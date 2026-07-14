/* ────────────────────────────────────────────────────────────────
   Repository layer for the Earnings-Beat Tracker — the only module
   that writes SQL for watchlist / earnings_surprises. pipeline.ts
   calls the write paths; the API route (app/api/watchlist/rankings)
   calls getRankingData, which is DB-only (§4: "the read path never
   calls Finnhub").
──────────────────────────────────────────────────────────────── */

import { EarningsQuarterRow, ReportHour, UpsertQuarterInput, WatchlistEntry } from "../earnings/types";
import { Queryable } from "./db";

/* ── watchlist ────────────────────────────────────────────────── */

interface WatchlistRow {
  id: number;
  ticker: string;
  company_name: string | null;
  is_active: boolean;
  added_at: string;
}

function rowToWatchlistEntry(r: WatchlistRow): WatchlistEntry {
  return {
    id: r.id,
    ticker: r.ticker,
    companyName: r.company_name,
    isActive: r.is_active,
    addedAt: r.added_at,
  };
}

export async function getActiveWatchlist(db: Queryable): Promise<WatchlistEntry[]> {
  const res = await db.query(
    `select id, ticker, company_name, is_active, added_at
       from watchlist
      where is_active`,
  );
  return (res.rows as unknown as WatchlistRow[]).map(rowToWatchlistEntry);
}

export async function getAllWatchlist(db: Queryable): Promise<WatchlistEntry[]> {
  const res = await db.query(
    `select id, ticker, company_name, is_active, added_at from watchlist`,
  );
  return (res.rows as unknown as WatchlistRow[]).map(rowToWatchlistEntry);
}

/**
 * Number of cached quarters per active ticker — drives Flow B's
 * "< 4 quarters" reconcile trigger (§2 Flow B, §5 "< 4 quarters of
 * history"). Tickers with zero cached rows still appear (left join)
 * so a freshly-added ticker is picked up for backfill.
 */
export async function getActiveQuarterCounts(db: Queryable): Promise<Map<string, number>> {
  const res = await db.query(
    `select w.ticker, count(e.id)::int as quarter_count
       from watchlist w
       left join earnings_surprises e on e.ticker = w.ticker
      where w.is_active
      group by w.ticker`,
  );
  const out = new Map<string, number>();
  for (const r of res.rows as unknown as { ticker: string; quarter_count: number }[]) {
    out.set(r.ticker, r.quarter_count);
  }
  return out;
}

/**
 * Existing (fiscal_year, fiscal_quarter) keys already cached for a
 * ticker — Flow A step 2's "check existence, skip what's cached"
 * (§2). Returned as a Set of "year-quarter" strings for O(1) lookup.
 */
export async function getCachedQuarterKeys(db: Queryable, ticker: string): Promise<Set<string>> {
  const res = await db.query(
    `select fiscal_year, fiscal_quarter from earnings_surprises where ticker = $1`,
    [ticker],
  );
  const out = new Set<string>();
  for (const r of res.rows as unknown as { fiscal_year: number; fiscal_quarter: number }[]) {
    out.add(`${r.fiscal_year}-${r.fiscal_quarter}`);
  }
  return out;
}

/* ── earnings_surprises writes ───────────────────────────────────── */

/**
 * The shared insert routine's DB half (§2 upsertQuarter). Field
 * mapping and safePct computation happen in pipeline.ts; this
 * function only persists the already-mapped row.
 *
 * ON CONFLICT (ticker, fiscal_year, fiscal_quarter) DO NOTHING —
 * §1 "Immutability": a quarter's data never changes once pulled.
 * Returns true if a row was actually inserted (false if it was
 * already cached — the idempotency backstop, §2 step 3).
 */
export async function insertQuarterIfAbsent(
  db: Queryable,
  row: {
    ticker: string;
    fiscalYear: number;
    fiscalQuarter: number;
    fiscalDateEnding: string | null;
    reportDate: string;
    reportHour: ReportHour | null;
    reportedEps: number | null;
    estimatedEps: number | null;
    epsSurprisePercent: number | null;
    reportedRevenue: number | null;
    estimatedRevenue: number | null;
    revenueSurprisePercent: number | null;
    source?: string;
  },
): Promise<boolean> {
  const res = await db.query(
    `insert into earnings_surprises
       (ticker, fiscal_year, fiscal_quarter, fiscal_date_ending, report_date,
        report_hour, reported_eps, estimated_eps, eps_surprise_percent,
        reported_revenue, estimated_revenue, revenue_surprise_percent, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (ticker, fiscal_year, fiscal_quarter) do nothing`,
    [
      row.ticker,
      row.fiscalYear,
      row.fiscalQuarter,
      row.fiscalDateEnding,
      row.reportDate,
      row.reportHour,
      row.reportedEps,
      row.estimatedEps,
      row.epsSurprisePercent,
      row.reportedRevenue,
      row.estimatedRevenue,
      row.revenueSurprisePercent,
      row.source ?? "finnhub",
    ],
  );
  return (res.rowCount ?? 0) > 0;
}

interface EarningsSurpriseDbRow {
  ticker: string;
  fiscal_year: number;
  fiscal_quarter: number;
  fiscal_date_ending: string | null;
  report_date: string;
  report_hour: ReportHour | null;
  reported_eps: number | null;
  estimated_eps: number | null;
  eps_surprise_percent: number | null;
  reported_revenue: number | null;
  estimated_revenue: number | null;
  revenue_surprise_percent: number | null;
  source: string;
  pulled_at: string;
}

function rowToQuarter(r: EarningsSurpriseDbRow): EarningsQuarterRow {
  return {
    ticker: r.ticker,
    fiscalYear: r.fiscal_year,
    fiscalQuarter: r.fiscal_quarter,
    fiscalDateEnding: r.fiscal_date_ending,
    reportDate: r.report_date,
    reportHour: r.report_hour,
    reportedEps: numOrNull(r.reported_eps),
    estimatedEps: numOrNull(r.estimated_eps),
    epsSurprisePercent: numOrNull(r.eps_surprise_percent),
    reportedRevenue: numOrNull(r.reported_revenue),
    estimatedRevenue: numOrNull(r.estimated_revenue),
    revenueSurprisePercent: numOrNull(r.revenue_surprise_percent),
    source: r.source,
    pulledAt: r.pulled_at,
  };
}

// pg returns numeric columns as strings; normalize without ever
// turning a real null into 0 (the exact bug §5 warns against).
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : Number(v);
}

/** Newest-first cached quarters for one ticker, capped to `limit` (§3). */
export async function getCachedQuarters(
  db: Queryable,
  ticker: string,
  limit = 4,
): Promise<EarningsQuarterRow[]> {
  const res = await db.query(
    `select ticker, fiscal_year, fiscal_quarter, fiscal_date_ending, report_date,
            report_hour, reported_eps, estimated_eps, eps_surprise_percent,
            reported_revenue, estimated_revenue, revenue_surprise_percent,
            source, pulled_at
       from earnings_surprises
      where ticker = $1
      order by fiscal_year desc, fiscal_quarter desc
      limit $2`,
    [ticker, limit],
  );
  return (res.rows as unknown as EarningsSurpriseDbRow[]).map(rowToQuarter);
}

/**
 * One row per (active) watchlist ticker with its newest `perTicker`
 * cached quarters attached — the single query backing
 * GET /api/watchlist/rankings. Uses a LATERAL join so the "top N per
 * group" cap happens in SQL, not by over-fetching and slicing in TS.
 */
export interface RankingDataEntry {
  watchlist: WatchlistEntry;
  quarters: EarningsQuarterRow[]; // newest-first, length <= perTicker
}

export async function getRankingData(
  db: Queryable,
  opts: { activeOnly: boolean; perTicker?: number } = { activeOnly: true },
): Promise<RankingDataEntry[]> {
  const perTicker = opts.perTicker ?? 4;
  const res = await db.query(
    `select w.id, w.ticker, w.company_name, w.is_active, w.added_at,
            q.fiscal_year, q.fiscal_quarter, q.fiscal_date_ending, q.report_date,
            q.report_hour, q.reported_eps, q.estimated_eps, q.eps_surprise_percent,
            q.reported_revenue, q.estimated_revenue, q.revenue_surprise_percent,
            q.source, q.pulled_at
       from watchlist w
       left join lateral (
         select *
           from earnings_surprises e
          where e.ticker = w.ticker
          order by e.fiscal_year desc, e.fiscal_quarter desc
          limit $1
       ) q on true
      where ($2::boolean is false or w.is_active)
      order by w.ticker, q.fiscal_year desc, q.fiscal_quarter desc`,
    [perTicker, opts.activeOnly],
  );

  const byTicker = new Map<string, RankingDataEntry>();
  for (const r of res.rows as unknown as (WatchlistRow & Partial<EarningsSurpriseDbRow>)[]) {
    let entry = byTicker.get(r.ticker);
    if (!entry) {
      entry = {
        watchlist: rowToWatchlistEntry({
          id: r.id,
          ticker: r.ticker,
          company_name: r.company_name,
          is_active: r.is_active,
          added_at: r.added_at,
        }),
        quarters: [],
      };
      byTicker.set(r.ticker, entry);
    }
    // The lateral join yields a null-filled row when a ticker has zero
    // cached quarters — skip it rather than pushing a garbage quarter.
    if (r.fiscal_year != null && r.fiscal_quarter != null) {
      entry.quarters.push(rowToQuarter(r as EarningsSurpriseDbRow));
    }
  }
  return [...byTicker.values()];
}
