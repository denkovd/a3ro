/* ────────────────────────────────────────────────────────────────
   Pipeline tests (architecture spec §2): upsertQuarter idempotency,
   Flow A's "not yet reported" filter + skip-cached behavior, and
   Flow B backfill mapping. Uses an in-memory Queryable that actually
   enforces the (ticker, fiscal_year, fiscal_quarter) uniqueness
   constraint, so "ON CONFLICT DO NOTHING" idempotency is exercised
   for real rather than asserted against a mock's call log.
──────────────────────────────────────────────────────────────── */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { QueryResultLike, Queryable } from "../src/storage/db";
import { upsertQuarter, runWeeklyIncremental, backfillTicker } from "../src/earnings/pipeline";
import { getCachedQuarters } from "../src/storage/earningsRepo";

/** Minimal in-memory Postgres stand-in covering exactly the queries
 *  earningsRepo.ts issues — enough to exercise real uniqueness /
 *  ON CONFLICT DO NOTHING semantics instead of mocking them away. */
class FakeEarningsDb implements Queryable {
  watchlist: { id: number; ticker: string; company_name: string | null; is_active: boolean; added_at: string }[] = [];
  quarters: Record<string, unknown>[] = [];
  private nextId = 1;

  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    const sql = text.toLowerCase();

    if (sql.includes("insert into earnings_surprises")) {
      const [ticker, fiscal_year, fiscal_quarter, fiscal_date_ending, report_date, report_hour,
        reported_eps, estimated_eps, eps_surprise_percent, reported_revenue, estimated_revenue,
        revenue_surprise_percent, source] = params;
      const exists = this.quarters.some(
        (q) => q.ticker === ticker && q.fiscal_year === fiscal_year && q.fiscal_quarter === fiscal_quarter,
      );
      if (exists) return { rows: [], rowCount: 0 }; // ON CONFLICT DO NOTHING
      this.quarters.push({
        ticker, fiscal_year, fiscal_quarter, fiscal_date_ending, report_date, report_hour,
        reported_eps, estimated_eps, eps_surprise_percent, reported_revenue, estimated_revenue,
        revenue_surprise_percent, source, pulled_at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("select fiscal_year, fiscal_quarter from earnings_surprises")) {
      const ticker = params[0];
      const rows = this.quarters
        .filter((q) => q.ticker === ticker)
        .map((q) => ({ fiscal_year: q.fiscal_year, fiscal_quarter: q.fiscal_quarter }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes("from earnings_surprises") && sql.includes("order by fiscal_year desc")) {
      const ticker = params[0];
      const limit = Number(params[1]);
      const rows = this.quarters
        .filter((q) => q.ticker === ticker)
        .sort((a, b) => (b.fiscal_year as number) - (a.fiscal_year as number) || (b.fiscal_quarter as number) - (a.fiscal_quarter as number))
        .slice(0, limit);
      return { rows, rowCount: rows.length };
    }

    if (sql.includes("from watchlist") && sql.includes("where is_active")) {
      const rows = this.watchlist.filter((w) => w.is_active);
      return { rows, rowCount: rows.length };
    }

    if (sql.includes("select id, ticker, company_name, is_active, added_at from watchlist")) {
      return { rows: this.watchlist, rowCount: this.watchlist.length };
    }

    throw new Error(`FakeEarningsDb: unhandled query: ${text}`);
  }

  addTicker(ticker: string): void {
    this.watchlist.push({ id: this.nextId++, ticker, company_name: null, is_active: true, added_at: new Date().toISOString() });
  }
}

describe("upsertQuarter (§2 shared insert routine)", () => {
  test("inserts once, ON CONFLICT DO NOTHING on re-run (idempotent)", async () => {
    const db = new FakeEarningsDb();
    const input = {
      ticker: "NVDA", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-28",
      reportHour: "amc" as const, epsActual: 0.96, epsEstimate: 0.88,
      revenueActual: 44060000000, revenueEstimate: 43310000000,
    };
    const first = await upsertQuarter(db, input);
    const second = await upsertQuarter(db, input); // re-run: same quarter
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(db.quarters.length, 1); // never a duplicate row
  });

  test("derives eps_surprise_percent via safePct when no override given", async () => {
    const db = new FakeEarningsDb();
    await upsertQuarter(db, {
      ticker: "ACME", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-20",
      reportHour: null, epsActual: 1.1, epsEstimate: 1.0, revenueActual: null, revenueEstimate: null,
    });
    const row = db.quarters[0];
    assert.ok(Math.abs((row.eps_surprise_percent as number) - 10) < 1e-9);
    // no revenue estimate (§5 edge case): revenue_surprise_percent is null, not 0
    assert.equal(row.revenue_surprise_percent, null);
  });

  test("prefers the /stock/earnings surprisePercent override over safePct", async () => {
    const db = new FakeEarningsDb();
    await upsertQuarter(db, {
      ticker: "ACME", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-20",
      reportHour: null, epsActual: 1.1, epsEstimate: 1.0, revenueActual: null, revenueEstimate: null,
      epsSurprisePercentOverride: 12.34,
    });
    assert.equal(db.quarters[0].eps_surprise_percent, 12.34);
  });

  test("estimate = 0 -> stored eps_surprise_percent is null (§5)", async () => {
    const db = new FakeEarningsDb();
    await upsertQuarter(db, {
      ticker: "ACME", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-20",
      reportHour: null, epsActual: 1.1, epsEstimate: 0, revenueActual: 10, revenueEstimate: 0,
    });
    assert.equal(db.quarters[0].eps_surprise_percent, null);
    assert.equal(db.quarters[0].revenue_surprise_percent, null);
  });
});

describe("runWeeklyIncremental (§2 Flow A)", () => {
  let originalFetch: typeof global.fetch;
  let originalKey: string | undefined;

  const setup = () => {
    originalFetch = global.fetch;
    originalKey = process.env.FINNHUB_API_KEY;
    process.env.FINNHUB_API_KEY = "test-key";
  };
  const teardown = () => {
    global.fetch = originalFetch;
    if (originalKey !== undefined) process.env.FINNHUB_API_KEY = originalKey;
    else delete process.env.FINNHUB_API_KEY;
  };

  test("filters to active watchlist + epsActual!==null, skips already-cached quarters", async () => {
    setup();
    try {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");
      db.addTicker("AMD");
      // NVDA Q1 2026 already cached -> should be skipped (zero extra calls beyond the calendar sweep).
      db.quarters.push({
        ticker: "NVDA", fiscal_year: 2026, fiscal_quarter: 1, fiscal_date_ending: null,
        report_date: "2026-05-01", report_hour: "amc", reported_eps: 1, estimated_eps: 1,
        eps_surprise_percent: 0, reported_revenue: null, estimated_revenue: null,
        revenue_surprise_percent: null, source: "finnhub", pulled_at: new Date().toISOString(),
      });

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) {
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                // already cached -> filtered out by the existence check, not the API
                { symbol: "NVDA", date: "2026-05-28", hour: "amc", year: 2026, quarter: 1, epsActual: 0.96, epsEstimate: 0.88, revenueActual: 1, revenueEstimate: 1 },
                // new quarter for AMD -> should insert
                { symbol: "AMD", date: "2026-05-27", hour: "bmo", year: 2026, quarter: 1, epsActual: 0.7, epsEstimate: 0.6, revenueActual: 5, revenueEstimate: 4 },
                // not yet reported (epsActual null) -> must never be written
                { symbol: "AMD", date: "2026-08-27", hour: "bmo", year: 2026, quarter: 2, epsActual: null, epsEstimate: 0.8, revenueActual: null, revenueEstimate: 5 },
                // reported, but not on the watchlist -> ignored
                { symbol: "OFFLIST", date: "2026-05-27", hour: "bmo", year: 2026, quarter: 1, epsActual: 1, epsEstimate: 1, revenueActual: 1, revenueEstimate: 1 },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/stock/earnings")) {
          return new Response(JSON.stringify([]), { status: 200 }); // no supplement data available
        }
        throw new Error(`unexpected fetch: ${url}`);
      };

      const report = await runWeeklyIncremental(db, { fetchSupplement: true });

      assert.equal(report.alreadyCached, 1); // NVDA skipped
      assert.deepEqual(report.inserted, ["AMD-2026-Q1"]);
      assert.equal(db.quarters.filter((q) => q.ticker === "AMD").length, 1);
      // re-running converges to the same state (idempotency guarantee, §2 step 3)
      const second = await runWeeklyIncremental(db, { fetchSupplement: true });
      assert.equal(second.inserted.length, 0);
      assert.equal(db.quarters.length, 2);
    } finally {
      teardown();
    }
  });
});

describe("backfillTicker (§2 Flow B)", () => {
  let originalFetch: typeof global.fetch;
  let originalKey: string | undefined;
  const setup = () => {
    originalFetch = global.fetch;
    originalKey = process.env.FINNHUB_API_KEY;
    process.env.FINNHUB_API_KEY = "test-key";
  };
  const teardown = () => {
    global.fetch = originalFetch;
    if (originalKey !== undefined) process.env.FINNHUB_API_KEY = originalKey;
    else delete process.env.FINNHUB_API_KEY;
  };

  test("seeds trailing history and left-joins fiscal_date_ending from the supplement", async () => {
    setup();
    try {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) {
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                { symbol: "NVDA", date: "2026-05-28", hour: "amc", year: 2026, quarter: 1, epsActual: 0.96, epsEstimate: 0.88, revenueActual: 1, revenueEstimate: 1 },
                { symbol: "NVDA", date: "2026-02-25", hour: "amc", year: 2025, quarter: 4, epsActual: 0.9, epsEstimate: 0.85, revenueActual: 1, revenueEstimate: 1 },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/stock/earnings")) {
          return new Response(
            JSON.stringify([
              { symbol: "NVDA", period: "2026-04-30", year: 2026, quarter: 1, actual: 0.96, estimate: 0.88, surprise: 0.08, surprisePercent: 9.09 },
            ]),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      };

      const report = await backfillTicker(db, "NVDA");
      assert.equal(report.inserted.length, 2);

      const cached = await getCachedQuarters(db, "NVDA", 4);
      const q1 = cached.find((q) => q.fiscalQuarter === 1)!;
      assert.equal(q1.fiscalDateEnding, "2026-04-30"); // filled from the supplement
      assert.equal(q1.epsSurprisePercent, 9.09); // authoritative override, not safePct
      const q4 = cached.find((q) => q.fiscalQuarter === 4)!;
      assert.equal(q4.fiscalDateEnding, null); // no supplement match for this quarter -> stays null
    } finally {
      teardown();
    }
  });
});
