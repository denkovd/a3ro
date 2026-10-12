import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBeatLeaderboard, formatDate, coverageMeta } from "../../app/components/projects/earnings/earningsData";
import { revenueComparisonStatus } from "../../lib/earningsQuality";
import { GET } from "../../app/api/leaderboard/earnings-beats/route";
import { types as pgTypes } from "pg";

const now = Date.parse("2026-10-11T00:00:00Z");
const results = [
  { ticker: "GOOGL", rank_score: 12, quarters_available: 5 },
  { ticker: "AAPL", rank_score: 0, quarters_available: 4 },
  { ticker: "EMPTY", rank_score: null, quarters_available: 0 },
];

test("recent rankings preserve API order, zero scores and unknown scores", () => {
  const board = normalizeBeatLeaderboard({ results, data_as_of: "2026-10-10T12:00:00Z" }, now);
  assert.equal(board.status, "live");
  assert.deepEqual(board.rows.map((r) => r.ticker), ["GOOGL", "AAPL", "EMPTY"]);
  assert.equal(board.rows[1].rankScore, 0);
  assert.equal(board.rows[2].rankScore, null);
});

test("overdue weekly data stays visible as stale and gets three days of grace", () => {
  const at = "2026-10-01T00:00:00Z";
  assert.equal(normalizeBeatLeaderboard({ results, data_as_of: at }, now).status, "live");
  const board = normalizeBeatLeaderboard({ results, data_as_of: at }, now + 1);
  assert.equal(board.status, "stale");
  assert.equal(board.rows.length, 3);
  assert.equal(board.dataAsOf, at);
});

test("rankings without a valid refresh date do not claim to be live", () => {
  for (const data_as_of of [null, "not-a-date"]) {
    assert.equal(normalizeBeatLeaderboard({ results, data_as_of }, now).status, "stale");
  }
});

test("a populated watchlist without any score remains pending", () => {
  const board = normalizeBeatLeaderboard({ results: [{ ticker: "AAPL", rank_score: null }] }, now);
  assert.equal(board.status, "pending");
  assert.equal(board.count, 1);
  assert.equal(normalizeBeatLeaderboard({ results: [] }, now).status, "pending");
});

test("refresh dates include the year when requested and keep missing dates unknown", () => {
  assert.equal(formatDate("2026-07-23T09:17:53.509Z", true), "Jul 23, 2026");
  assert.equal(formatDate("2026-07-23"), "Jul 23");
  assert.equal(formatDate(null, true), "—");
});

test("revenue policy excludes both Alphabet share classes without blocking usable peers", () => {
  for (const ticker of ["GOOG", "googl"]) {
    assert.equal(revenueComparisonStatus(ticker, "finnhub", 103617e6, 120361e6, -13.9), "basis_unverified");
  }
  assert.equal(revenueComparisonStatus("MSFT", "finnhub", 90e9, 88e9, 2.27), "available");
  assert.equal(revenueComparisonStatus("MSFT", "finnhub", 90e9, null, null), "missing");
  assert.equal(revenueComparisonStatus("MSFT", "finnhub", 0, 10, -100), "available");
});

test("API uses calendar dates and removes cached mismatched revenue before ranking", async (t) => {
  const originalUrl = process.env.DATABASE_URL;
  const globals = globalThis as typeof globalThis & { __a3roLeaderboardPgPool?: Map<string, unknown> };
  const originalPools = globals.__a3roLeaderboardPgPool;
  process.env.DATABASE_URL = "earnings-test";
  t.after(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    globals.__a3roLeaderboardPgPool = originalPools;
  });
  const pool = { async query(sql: string) {
    if (sql.includes("from watchlist")) return { rows: [{ id: 1, ticker: "GOOGL", company_name: "Alphabet", is_active: true }] };
    if (sql.includes("from pipeline_runs")) return { rows: [{ finished_at: "2026-10-11T01:44:22Z" }] };
    if (sql.includes("from earnings_surprises")) return { rows: [{
      ticker: "GOOGL", fiscal_year: 2026, fiscal_quarter: 2,
      // Simulate pg's real DATE parser if the query lacks text casts.
      report_date: sql.includes("report_date::text") ? "2026-07-22" : pgTypes.getTypeParser(1082)("2026-07-22"),
      fiscal_date_ending: sql.includes("fiscal_date_ending::text") ? "2026-06-30" : pgTypes.getTypeParser(1082)("2026-06-30"),
      report_hour: "amc", reported_eps: "9.11", estimated_eps: "2.9753", eps_surprise_percent: "206.1876",
      reported_revenue: "103617000000", estimated_revenue: "120361387510", revenue_surprise_percent: "-13.911760122081365",
      source: "finnhub", pulled_at: "2026-07-23T09:17:52Z",
    }] };
    throw new Error(`Unexpected query: ${sql}`);
  } };
  globals.__a3roLeaderboardPgPool = new Map([["earnings-test", pool]]);
  const response = await GET(new Request("http://localhost/api/leaderboard/earnings-beats"));
  assert.equal(response.status, 200);
  const body = await response.json();
  const row = body.results[0];
  assert.equal(row.latest.report_date, "2026-07-22");
  assert.equal(row.latest.fiscal_date_ending, "2026-06-30");
  assert.equal(row.latest.reported_revenue, 103617000000);
  assert.equal(row.latest.revenue_surprise_percent, null);
  assert.equal(row.latest.revenue_comparison_status, "basis_unverified");
  assert.equal(row.revenue_surprise_avg, null);
  assert.equal(row.rank_score, 50); // EPS is capped to 50; excluded revenue cannot lower it.
  assert.deepEqual(row.data_quality, { window_quarters: 1, eps_quarters: 1, revenue_quarters: 0, revenue_excluded_quarters: 1 });
  const normalized = normalizeBeatLeaderboard(body, now);
  const coverage = coverageMeta(normalized.rows[0]);
  assert.equal(coverage.label, "EPS only");
  assert.match(coverage.description, /bases are unverified/);
});

test("coverage distinguishes partial revenue from complete comparisons", () => {
  for (const [surprises, expected] of [[[null, null], "EPS only"], [[1, null], "Partial rev"], [[1, 2], "EPS + rev"]] as const) {
    const board = normalizeBeatLeaderboard({ results: [{ ticker: "ACME", rank_score: 1, quarters: surprises.map((revenue_surprise_percent, i) => ({
      fiscal_year: 2026, fiscal_quarter: 2 - i, eps_surprise_percent: 1, revenue_surprise_percent,
    })) }] }, now);
    assert.equal(coverageMeta(board.rows[0]).label, expected);
  }
});
