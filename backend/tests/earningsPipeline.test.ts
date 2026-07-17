/* ────────────────────────────────────────────────────────────────
   Pipeline tests (architecture spec §2, v2): fill-nulls-only upsert
   idempotency, revenue-arrives-late enrichment, per-ticker isolation
   of supplemental-call failures, '' hour normalization, the weekly
   watermark, and pipeline_runs observability.

   FakeEarningsDb is an in-memory Postgres stand-in covering exactly
   the queries earningsRepo.ts issues, including a hand-rolled version
   of the real `xmax = 0` fill-nulls-only ON CONFLICT DO UPDATE ...
   WHERE clause — so the "no-op conflicts don't churn updated_at"
   guarantee (§2.1) is exercised for real, not asserted against a
   mock's call log.
──────────────────────────────────────────────────────────────── */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { QueryResultLike, Queryable } from "../src/storage/db";
import { backfillTicker, reconcileUnderfilledTickers, runWeeklyIncremental, upsertQuarter } from "../src/earnings/pipeline";
import { getCachedQuarters, getLastSuccessfulPipelineRun } from "../src/storage/earningsRepo";

/** Columns the fill-nulls-only upsert (§2.1) may fill on conflict.
 *  report_date is fillable since the v2 backfill rework: EPS-only rows
 *  from /stock/earnings insert it as NULL, and the calendar-enrich pass
 *  fills it for quarters inside the calendar's ~30-day lookback. */
const FILLABLE_COLUMNS = [
  "fiscal_date_ending", "report_date", "report_hour", "reported_eps", "estimated_eps",
  "eps_surprise_percent", "reported_revenue", "estimated_revenue", "revenue_surprise_percent",
] as const;

class FakeEarningsDb implements Queryable {
  watchlist: { id: number; ticker: string; company_name: string | null; is_active: boolean; added_at: string }[] = [];
  quarters: Record<string, unknown>[] = [];
  pipelineRuns: Record<string, unknown>[] = [];
  private nextTickerId = 1;
  private nextRunId = 1;

  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    const sql = text.toLowerCase();

    /* ── pipeline_runs ─────────────────────────────────────────── */

    if (sql.includes("insert into pipeline_runs")) {
      const [flow, windowFrom, windowTo] = params;
      const id = this.nextRunId++;
      this.pipelineRuns.push({
        id, flow, started_at: new Date().toISOString(), finished_at: null,
        window_from: windowFrom, window_to: windowTo,
        rows_inserted: null, rows_enriched: null, tickers_failed: [],
        status: "running", error: null,
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    if (sql.includes("update pipeline_runs")) {
      const [id, status, rowsInserted, rowsEnriched, tickersFailed, error] = params;
      const run = this.pipelineRuns.find((r) => r.id === id);
      if (run) {
        run.finished_at = new Date().toISOString();
        run.status = status;
        run.rows_inserted = rowsInserted;
        run.rows_enriched = rowsEnriched;
        run.tickers_failed = tickersFailed;
        run.error = error;
      }
      return { rows: [], rowCount: run ? 1 : 0 };
    }

    if (sql.includes("select window_to") && sql.includes("from pipeline_runs")) {
      const [flow] = params;
      const matches = this.pipelineRuns
        .filter((r) => r.flow === flow && r.status === "success" && r.window_to != null)
        .sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)));
      const row = matches[0];
      return { rows: row ? [{ window_to: row.window_to }] : [], rowCount: row ? 1 : 0 };
    }

    /* ── earnings_surprises: fill-nulls-only upsert (§2.1) ────────── */

    if (sql.includes("insert into earnings_surprises")) {
      const [
        ticker, fiscal_year, fiscal_quarter, fiscal_date_ending, report_date, report_hour,
        reported_eps, estimated_eps, eps_surprise_percent, reported_revenue, estimated_revenue,
        revenue_surprise_percent, source, raw,
      ] = params;

      const existing = this.quarters.find(
        (r) => r.ticker === ticker && r.fiscal_year === fiscal_year && r.fiscal_quarter === fiscal_quarter,
      ) as Record<string, unknown> | undefined;

      const incoming: Record<string, unknown> = {
        fiscal_date_ending, report_date, report_hour, reported_eps, estimated_eps, eps_surprise_percent,
        reported_revenue, estimated_revenue, revenue_surprise_percent,
      };

      if (!existing) {
        const now = new Date().toISOString();
        this.quarters.push({
          ticker, fiscal_year, fiscal_quarter, ...incoming, source, raw,
          pulled_at: now, updated_at: now,
        });
        return { rows: [{ inserted: true }], rowCount: 1 };
      }

      const changed = FILLABLE_COLUMNS.some(
        (col) => existing[col] == null && incoming[col] != null,
      );
      if (!changed) return { rows: [], rowCount: 0 }; // WHERE clause false -> true no-op

      for (const col of FILLABLE_COLUMNS) {
        if (existing[col] == null && incoming[col] != null) existing[col] = incoming[col];
      }
      if (existing.raw == null && raw != null) existing.raw = raw;
      existing.updated_at = new Date().toISOString();
      return { rows: [{ inserted: false }], rowCount: 1 };
    }

    /* ── getCachedQuarters (newest-first, capped) ──────────────────── */
    if (sql.includes("from earnings_surprises") && sql.includes("order by fiscal_year desc")) {
      const ticker = params[0];
      const limit = Number(params[1]);
      const rows = this.quarters
        .filter((r) => r.ticker === ticker)
        .sort((a, b) => (b.fiscal_year as number) - (a.fiscal_year as number) || (b.fiscal_quarter as number) - (a.fiscal_quarter as number))
        .slice(0, limit);
      return { rows, rowCount: rows.length };
    }

    /* ── getCachedQuarterRevenueStatus (§2.2 step 3) ───────────────── */
    if (sql.includes("reported_revenue") && sql.includes("from earnings_surprises") && sql.includes("where ticker = $1")) {
      const ticker = params[0];
      const rows = this.quarters
        .filter((r) => r.ticker === ticker)
        .map((r) => ({ fiscal_year: r.fiscal_year, fiscal_quarter: r.fiscal_quarter, reported_revenue: r.reported_revenue ?? null }));
      return { rows, rowCount: rows.length };
    }

    /* ── getCachedQuarterKeys ───────────────────────────────────────── */
    if (sql.includes("select fiscal_year, fiscal_quarter from earnings_surprises")) {
      const ticker = params[0];
      const rows = this.quarters
        .filter((r) => r.ticker === ticker)
        .map((r) => ({ fiscal_year: r.fiscal_year, fiscal_quarter: r.fiscal_quarter }));
      return { rows, rowCount: rows.length };
    }

    /* ── getActiveQuarterCounts ─────────────────────────────────────── */
    if (sql.includes("count(e.id)")) {
      const counts = new Map<string, number>();
      for (const w of this.watchlist.filter((w) => w.is_active)) counts.set(w.ticker, 0);
      for (const q of this.quarters) {
        const t = q.ticker as string;
        if (counts.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      const rows = [...counts.entries()].map(([ticker, quarter_count]) => ({ ticker, quarter_count }));
      return { rows, rowCount: rows.length };
    }

    /* ── watchlist reads ────────────────────────────────────────────── */
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
    this.watchlist.push({ id: this.nextTickerId++, ticker, company_name: null, is_active: true, added_at: new Date().toISOString() });
  }
}

function withFetchMock<T>(fn: () => Promise<T>): Promise<T> {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-key";
  return fn().finally(() => {
    global.fetch = originalFetch;
    if (originalKey !== undefined) process.env.FINNHUB_API_KEY = originalKey;
    else delete process.env.FINNHUB_API_KEY;
  });
}

describe("upsertQuarter (§2.1 fill-nulls-only upsert)", () => {
  test("inserts once; identical re-run is a true no-op (idempotent, no churn)", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      const input = {
        ticker: "NVDA", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-28",
        reportHour: "amc" as const, epsActual: 0.96, epsEstimate: 0.88,
        revenueActual: 44060000000, revenueEstimate: 43310000000,
        raw: { calendar: { symbol: "NVDA" } },
      };
      const first = await upsertQuarter(db, input);
      const updatedAtAfterInsert = db.quarters[0].updated_at;
      const second = await upsertQuarter(db, input); // re-run: identical data, nothing to fill
      assert.equal(first, "inserted");
      assert.equal(second, "noop");
      assert.equal(db.quarters.length, 1); // never a duplicate row
      assert.equal(db.quarters[0].updated_at, updatedAtAfterInsert); // no-op conflict never bumps updated_at
    });
  });

  test("late-arriving revenue is filled on a second pass: pulled_at unchanged, updated_at bumped", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      await upsertQuarter(db, {
        ticker: "NVDA", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-28",
        reportHour: "amc", epsActual: 0.96, epsEstimate: 0.88,
        revenueActual: null, revenueEstimate: null, // EPS-first: revenue not yet settled
        raw: { calendar: { pass: 1 } },
      });
      const pulledAt1 = db.quarters[0].pulled_at;
      const updatedAt1 = db.quarters[0].updated_at;
      assert.equal(pulledAt1, updatedAt1); // first insert: both timestamps identical

      await new Promise((r) => setTimeout(r, 5)); // ensure a distinguishable updated_at

      const outcome = await upsertQuarter(db, {
        ticker: "NVDA", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-28",
        reportHour: "amc", epsActual: 0.96, epsEstimate: 0.88,
        revenueActual: 44060000000, revenueEstimate: 43310000000, // revenue-later pass
        raw: { calendar: { pass: 2 } },
      });

      assert.equal(outcome, "enriched");
      assert.equal(db.quarters.length, 1); // still one row, not a duplicate
      assert.equal(db.quarters[0].pulled_at, pulledAt1); // immutable first-insert timestamp
      assert.notEqual(db.quarters[0].updated_at, updatedAt1); // bumped by the enrichment
      assert.equal(db.quarters[0].reported_revenue, 44060000000); // late revenue absorbed
      assert.equal(db.quarters[0].reported_eps, 0.96); // already-populated EPS untouched (first-write-wins)
      assert.deepEqual(db.quarters[0].raw, { calendar: { pass: 1 } }); // raw also fill-nulls-only: first payload wins
    });
  });

  test("derives eps_surprise_percent via safePct when no override given", async () => {
    await withFetchMock(async () => {
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
  });

  test("prefers the /stock/earnings surprisePercent override over safePct", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      await upsertQuarter(db, {
        ticker: "ACME", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-20",
        reportHour: null, epsActual: 1.1, epsEstimate: 1.0, revenueActual: null, revenueEstimate: null,
        epsSurprisePercentOverride: 12.34,
      });
      assert.equal(db.quarters[0].eps_surprise_percent, 12.34);
    });
  });

  test("estimate = 0 -> stored eps_surprise_percent is null (§5)", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      await upsertQuarter(db, {
        ticker: "ACME", fiscalYear: 2026, fiscalQuarter: 1, reportDate: "2026-05-20",
        reportHour: null, epsActual: 1.1, epsEstimate: 0, revenueActual: 10, revenueEstimate: 0,
      });
      assert.equal(db.quarters[0].eps_surprise_percent, null);
      assert.equal(db.quarters[0].revenue_surprise_percent, null);
    });
  });
});

describe("runWeeklyIncremental (§2.2 Flow A)", () => {
  test("filters to active watchlist + epsActual!==null, skips fully-cached quarters, records pipeline_runs", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");
      db.addTicker("AMD");
      // NVDA Q1 2026 already fully cached -> should be skipped (zero extra calls).
      db.quarters.push({
        ticker: "NVDA", fiscal_year: 2026, fiscal_quarter: 1, fiscal_date_ending: null,
        report_date: "2026-05-01", report_hour: "amc", reported_eps: 1, estimated_eps: 1,
        eps_surprise_percent: 0, reported_revenue: 1, estimated_revenue: 1,
        revenue_surprise_percent: 0, source: "finnhub", raw: null,
        pulled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) {
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                // already cached (revenue present) -> filtered by the existence check, not the API
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
      assert.equal(report.status, "success");
      assert.equal(db.quarters.filter((q) => q.ticker === "AMD").length, 1);
      assert.equal(db.pipelineRuns.length, 1);
      assert.equal(db.pipelineRuns[0].flow, "weekly");
      assert.equal(db.pipelineRuns[0].status, "success");
      assert.equal(db.pipelineRuns[0].rows_inserted, 1);

      // re-running converges to the same state (idempotency guarantee, §2)
      const second = await runWeeklyIncremental(db, { fetchSupplement: true });
      assert.equal(second.inserted.length, 0);
      assert.equal(second.revenueEnriched.length, 0);
      assert.equal(db.quarters.length, 2);
      assert.equal(db.pipelineRuns.length, 2);
    });
  });

  test("§2.2 step 3: cached row with missing revenue is enriched from the same calendar sweep, zero extra calls", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");
      // Cached from an earlier EPS-first pass: revenue still null.
      db.quarters.push({
        ticker: "NVDA", fiscal_year: 2026, fiscal_quarter: 1, fiscal_date_ending: null,
        report_date: "2026-05-01", report_hour: "amc", reported_eps: 0.96, estimated_eps: 0.88,
        eps_surprise_percent: 9.09, reported_revenue: null, estimated_revenue: null,
        revenue_surprise_percent: null, source: "finnhub", raw: null,
        pulled_at: "2026-05-01T00:00:00.000Z", updated_at: "2026-05-01T00:00:00.000Z",
      });

      let stockEarningsCalls = 0;
      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) {
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                { symbol: "NVDA", date: "2026-05-01", hour: "amc", year: 2026, quarter: 1, epsActual: 0.96, epsEstimate: 0.88, revenueActual: 44060000000, revenueEstimate: 43310000000 },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/stock/earnings")) {
          stockEarningsCalls += 1;
          return new Response(JSON.stringify([]), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      };

      const report = await runWeeklyIncremental(db, { fetchSupplement: true });

      assert.deepEqual(report.revenueEnriched, ["NVDA-2026-Q1"]);
      assert.equal(report.inserted.length, 0);
      assert.equal(stockEarningsCalls, 0); // step 3 makes ZERO extra API calls (§2.2)
      const cached = await getCachedQuarters(db, "NVDA", 4);
      assert.equal(cached[0].reportedRevenue, 44060000000);
      assert.equal(cached[0].pulledAt, "2026-05-01T00:00:00.000Z"); // unchanged
      assert.notEqual(cached[0].updatedAt, "2026-05-01T00:00:00.000Z"); // bumped
      assert.equal(db.pipelineRuns[0].rows_enriched, 1);
    });
  });

  test("failed supplemental call is isolated: ticker recorded in tickers_failed, insert still happens", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("ACME");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) {
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                { symbol: "ACME", date: "2026-05-20", hour: "bmo", year: 2026, quarter: 1, epsActual: 1.1, epsEstimate: 1.0, revenueActual: 10, revenueEstimate: 9 },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/stock/earnings")) {
          // 404 -> classified "bad_payload" by getJsonForSource, non-retriable,
          // so this fails fast (no real backoff sleeps slowing the test down).
          return new Response("not found", { status: 404 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      };

      const report = await runWeeklyIncremental(db, { fetchSupplement: true });

      assert.deepEqual(report.inserted, ["ACME-2026-Q1"]); // insert still happened
      assert.deepEqual(report.supplementFailures, ["ACME"]);
      const row = db.quarters.find((q) => q.ticker === "ACME")!;
      assert.equal(row.fiscal_date_ending, null); // never guessed
      assert.deepEqual(db.pipelineRuns[0].tickers_failed, ["ACME"]);
      assert.equal(db.pipelineRuns[0].status, "success"); // supplemental failure never fails the run
    });
  });

  test("'' calendar hour normalizes to null all the way through to the stored row", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("ACME");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) {
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                { symbol: "ACME", date: "2026-05-20", hour: "", year: 2026, quarter: 1, epsActual: 1.1, epsEstimate: 1.0, revenueActual: 10, revenueEstimate: 9 },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/stock/earnings")) return new Response(JSON.stringify([]), { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      };

      await runWeeklyIncremental(db, { fetchSupplement: true });
      const row = db.quarters.find((q) => q.ticker === "ACME")!;
      assert.equal(row.report_hour, null);
    });
  });

  test("a failed calendar call fails the run and does not advance the watermark", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) return new Response("bad request", { status: 400 }); // non-retriable, fails fast
        throw new Error(`unexpected fetch: ${url}`);
      };

      await assert.rejects(() => runWeeklyIncremental(db, { fetchSupplement: true }));
      assert.equal(db.pipelineRuns.length, 1);
      assert.equal(db.pipelineRuns[0].status, "failed");
      assert.ok(typeof db.pipelineRuns[0].error === "string" && (db.pipelineRuns[0].error as string).length > 0);
      const watermark = await getLastSuccessfulPipelineRun(db, "weekly");
      assert.equal(watermark, null); // no successful run -> watermark not advanced
    });
  });

  test("watermark: second run's window starts from the first run's window_to minus the 2-day overlap", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");
      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [] }), { status: 200 });
        if (url.includes("/stock/earnings")) return new Response(JSON.stringify([]), { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      };

      const fixedNow = () => new Date("2026-06-01T12:00:00Z");
      const first = await runWeeklyIncremental(db, { now: fixedNow });
      assert.equal(first.windowTo, "2026-06-01");

      const second = await runWeeklyIncremental(db, { now: fixedNow });
      // from = last successful window_to (2026-06-01) - 2d overlap = 2026-05-30
      assert.equal(second.windowFrom, "2026-05-30");
    });
  });

  test("watermark span > 30d is capped at the calendar's lookback limit, with a warning", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");
      // A successful weekly run from ~3 months ago: the watermark span
      // would be ~92 days, beyond what the free-tier calendar can see.
      db.pipelineRuns.push({
        id: 999, flow: "weekly", started_at: "2026-03-01T12:00:00.000Z", finished_at: "2026-03-01T12:05:00.000Z",
        window_from: "2026-02-22", window_to: "2026-03-01",
        rows_inserted: 0, rows_enriched: 0, tickers_failed: [], status: "success", error: null,
      });

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [] }), { status: 200 });
        if (url.includes("/stock/earnings")) return new Response(JSON.stringify([]), { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      };

      const logs: string[] = [];
      const report = await runWeeklyIncremental(db, {
        now: () => new Date("2026-06-01T12:00:00Z"),
        log: (msg) => logs.push(msg),
      });

      assert.equal(report.windowCapped, true);
      assert.equal(report.windowFrom, "2026-05-02"); // 2026-06-01 - 30d, not the stale watermark
      assert.equal(report.windowTo, "2026-06-01");
      assert.ok(
        logs.some((m) => m.includes("capped at 30d") && m.includes("EPS-only")),
        `expected a cap warning mentioning the EPS-only recovery path, got: ${JSON.stringify(logs)}`,
      );
    });
  });
});

describe("backfillTicker (§2.3 Flow B, v2: /stock/earnings primary + 30-day calendar enrich)", () => {
  test("seeds EPS-only history from /stock/earnings (report_date NULL, never faked), calendar enriches the recent quarter", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/stock/earnings")) {
          return new Response(
            JSON.stringify([
              { symbol: "NVDA", period: "2026-04-30", year: 2026, quarter: 1, actual: 0.96, estimate: 0.88, surprise: 0.08, surprisePercent: 9.09 },
              { symbol: "NVDA", period: "2026-01-31", year: 2025, quarter: 4, actual: 0.9, estimate: 0.85, surprise: 0.05, surprisePercent: 5.88 },
              // not yet reported (actual null) -> must never be written
              { symbol: "NVDA", period: "2026-07-31", year: 2026, quarter: 2, actual: null, estimate: 1.0, surprise: null, surprisePercent: null },
            ]),
            { status: 200 },
          );
        }
        if (url.includes("/calendar/earnings")) {
          // Only the quarter reported inside the ~30-day lookback comes back.
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                { symbol: "NVDA", date: "2026-05-28", hour: "amc", year: 2026, quarter: 1, epsActual: 0.96, epsEstimate: 0.88, revenueActual: 44060000000, revenueEstimate: 43310000000 },
              ],
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      };

      const report = await backfillTicker(db, "NVDA");
      assert.equal(report.status, "success");
      assert.equal(report.candidates, 2); // reported stock entries only — the actual:null row is dropped
      assert.deepEqual(report.inserted, ["NVDA-2026-Q1", "NVDA-2025-Q4"]);
      assert.deepEqual(report.enriched, ["NVDA-2026-Q1"]); // calendar filled report_date/hour/revenue
      assert.equal(report.enrichFailed, false);
      assert.equal(db.quarters.length, 2);

      const cached = await getCachedQuarters(db, "NVDA", 4);
      const q1 = cached.find((q) => q.fiscalYear === 2026 && q.fiscalQuarter === 1)!;
      assert.equal(q1.fiscalDateEnding, "2026-04-30"); // stock `period`
      assert.equal(q1.epsSurprisePercent, 9.09); // Finnhub's surprisePercent verbatim, not safePct
      assert.equal(q1.reportDate, "2026-05-28"); // merged in by the calendar enrich
      assert.equal(q1.reportHour, "amc");
      assert.equal(q1.reportedRevenue, 44060000000);

      const q4 = cached.find((q) => q.fiscalYear === 2025 && q.fiscalQuarter === 4)!;
      assert.equal(q4.reportDate, null); // outside the calendar lookback: EPS-only, never faked
      assert.equal(q4.reportHour, null);
      assert.equal(q4.reportedRevenue, null);
      assert.equal(q4.epsSurprisePercent, 5.88);

      assert.equal(db.pipelineRuns.length, 1);
      assert.equal(db.pipelineRuns[0].flow, "backfill");
      assert.equal(db.pipelineRuns[0].status, "success");

      // window recorded is the 30-day calendar-enrich window, not 3 years
      const spanDays = Math.round(
        (Date.parse(`${report.windowTo}T00:00:00Z`) - Date.parse(`${report.windowFrom}T00:00:00Z`)) / (24 * 60 * 60 * 1000),
      );
      assert.equal(spanDays, 30);
    });
  });

  test("calendar-enrich failure is non-fatal: EPS-only rows kept, run still succeeds, ticker recorded", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/stock/earnings")) {
          return new Response(
            JSON.stringify([
              { symbol: "NVDA", period: "2026-04-30", year: 2026, quarter: 1, actual: 0.96, estimate: 0.88, surprise: 0.08, surprisePercent: 9.09 },
            ]),
            { status: 200 },
          );
        }
        if (url.includes("/calendar/earnings")) {
          return new Response("bad request", { status: 400 }); // non-retriable -> fails fast
        }
        throw new Error(`unexpected fetch: ${url}`);
      };

      const report = await backfillTicker(db, "NVDA");
      assert.equal(report.status, "success"); // enrich failure never fails the run
      assert.equal(report.enrichFailed, true);
      assert.deepEqual(report.inserted, ["NVDA-2026-Q1"]);
      assert.equal(db.pipelineRuns[0].status, "success");
      assert.deepEqual(db.pipelineRuns[0].tickers_failed, ["NVDA"]);
    });
  });

  test("primary /stock/earnings failure fails the run (nothing to seed or enrich)", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/stock/earnings")) return new Response("bad request", { status: 400 });
        throw new Error(`unexpected fetch: ${url}`);
      };

      await assert.rejects(() => backfillTicker(db, "NVDA"));
      assert.equal(db.pipelineRuns.length, 1);
      assert.equal(db.pipelineRuns[0].status, "failed");
      assert.equal(db.quarters.length, 0);
    });
  });

  test("idempotent: an immediate re-run inserts nothing and re-enriches nothing", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("NVDA");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/stock/earnings")) {
          return new Response(
            JSON.stringify([
              { symbol: "NVDA", period: "2026-04-30", year: 2026, quarter: 1, actual: 0.96, estimate: 0.88, surprise: 0.08, surprisePercent: 9.09 },
            ]),
            { status: 200 },
          );
        }
        if (url.includes("/calendar/earnings")) {
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                { symbol: "NVDA", date: "2026-05-28", hour: "amc", year: 2026, quarter: 1, epsActual: 0.96, epsEstimate: 0.88, revenueActual: 1, revenueEstimate: 1 },
              ],
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      };

      await backfillTicker(db, "NVDA");
      const updatedAtAfterFirst = db.quarters[0].updated_at;
      const second = await backfillTicker(db, "NVDA");
      assert.equal(second.inserted.length, 0);
      assert.equal(second.enriched.length, 0);
      assert.equal(db.quarters.length, 1);
      assert.equal(db.quarters[0].updated_at, updatedAtAfterFirst); // no-op conflicts don't churn updated_at
    });
  });
});

describe("reconcileUnderfilledTickers (§2.3 nightly reconcile)", () => {
  test("backfills every active ticker under the quarter threshold; one failure doesn't block the rest", async () => {
    await withFetchMock(async () => {
      const db = new FakeEarningsDb();
      db.addTicker("GOOD");
      db.addTicker("BAD");

      global.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("symbol=BAD") && url.includes("/stock/earnings")) {
          // primary source fails -> that ticker's backfill throws (non-retriable, fails fast)
          return new Response("bad request", { status: 400 });
        }
        if (url.includes("/stock/earnings")) {
          return new Response(
            JSON.stringify([
              { symbol: "GOOD", period: "2026-04-30", year: 2026, quarter: 1, actual: 1, estimate: 1, surprise: 0, surprisePercent: 0 },
            ]),
            { status: 200 },
          );
        }
        if (url.includes("/calendar/earnings")) {
          return new Response(
            JSON.stringify({
              earningsCalendar: [
                { symbol: "GOOD", date: "2026-05-28", hour: "amc", year: 2026, quarter: 1, epsActual: 1, epsEstimate: 1, revenueActual: 1, revenueEstimate: 1 },
              ],
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      };

      const report = await reconcileUnderfilledTickers(db, { minQuarters: 4 });
      assert.equal(report.checked, 2);
      assert.equal(report.backfilled.length, 1);
      assert.equal(report.backfilled[0].ticker, "GOOD");
      assert.equal(report.failed.length, 1);
      assert.equal(report.failed[0].ticker, "BAD");
    });
  });
});
