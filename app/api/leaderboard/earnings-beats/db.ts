/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Leaderboard — DB access (architecture spec §1, §4).

   Self-contained: does NOT import from "@a3ro/oil-backend" (=
   backend/src, per tsconfig paths) even though that package exposes
   a very similar createDb()/repo layer. backend/src/earnings is
   being upgraded concurrently by a separate workstream and app/ +
   backend/ are separate packages for this task, so this route owns
   its own minimal pg pool + queries rather than depending on
   backend/'s in-flight state.

   RUNTIME CONSTRAINT: `pg` needs raw TCP -> Node.js runtime only.
   route.ts declares `export const runtime = "nodejs"`.
──────────────────────────────────────────────────────────────── */

import type { Pool } from "pg";

// NOTE ON `pg`'s TYPES: under this repo's tsconfig ("moduleResolution":
// "bundler"), @types/pg's ESM entry point (index.d.mts) does not
// properly re-export named types like `QueryResultRow`, and loses the
// generic overloads on `Pool.query` (a known pg/@types interop gap
// under bundler resolution). Rather than fight that, this module
// mirrors backend/src/storage/db.ts's own convention: call
// `pool.query(text, params)` untyped and cast `res.rows` to a local
// row shape explicitly, instead of relying on `query<T>()`.

export interface WatchlistRow {
  id: number;
  ticker: string;
  companyName: string | null;
  isActive: boolean;
}

export interface EarningsQuarterRow {
  fiscalYear: number;
  fiscalQuarter: number;
  fiscalDateEnding: string | null;
  /** NULL for quarters backfilled solely from /stock/earnings, which
   *  has no announcement date (§0 v2 backfill rework). */
  reportDate: string | null;
  reportHour: "bmo" | "amc" | "dmh" | null;
  reportedEps: number | null;
  estimatedEps: number | null;
  epsSurprisePercent: number | null;
  reportedRevenue: number | null;
  estimatedRevenue: number | null;
  revenueSurprisePercent: number | null;
  pulledAt: string;
}

export interface TickerData {
  watchlist: WatchlistRow;
  /** Newest-first, ALL cached quarters for this ticker (not capped) —
   *  beat_streak (§3.1) must be able to walk full history. */
  quarters: EarningsQuarterRow[];
}

/**
 * Memoized pool on globalThis, keyed separately from backend/'s own
 * pool cache (different global key) so the two packages never share
 * or fight over a Pool instance despite both reading DATABASE_URL.
 * Survives module re-evaluation across warm serverless invocations.
 */
export async function createPool(connectionString = process.env.DATABASE_URL): Promise<Pool> {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const g = globalThis as typeof globalThis & { __a3roLeaderboardPgPool?: Map<string, Pool> };
  g.__a3roLeaderboardPgPool ??= new Map();
  const existing = g.__a3roLeaderboardPgPool.get(connectionString);
  if (existing) return existing;
  const { Pool: PgPool } = await import("pg");
  const pool = new PgPool({ connectionString, max: 5 });
  g.__a3roLeaderboardPgPool.set(connectionString, pool);
  return pool;
}

// pg returns numeric columns as strings; normalize without ever
// turning a real null into 0 (the exact bug the spec warns against, §5/§6).
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : Number(v);
}

interface WatchlistDbRow {
  id: number;
  ticker: string;
  company_name: string | null;
  is_active: boolean;
}

interface EarningsDbRow {
  ticker: string;
  fiscal_year: number;
  fiscal_quarter: number;
  fiscal_date_ending: string | null;
  report_date: string | null;
  report_hour: "bmo" | "amc" | "dmh" | null;
  reported_eps: unknown;
  estimated_eps: unknown;
  eps_surprise_percent: unknown;
  reported_revenue: unknown;
  estimated_revenue: unknown;
  revenue_surprise_percent: unknown;
  pulled_at: string;
}

function rowToWatchlist(r: WatchlistDbRow): WatchlistRow {
  return { id: r.id, ticker: r.ticker, companyName: r.company_name, isActive: r.is_active };
}

function rowToQuarter(r: EarningsDbRow): EarningsQuarterRow {
  return {
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
    pulledAt: r.pulled_at,
  };
}

/**
 * Loads watchlist rows (filtered by active, unless a single ticker is
 * requested) plus ALL cached earnings_surprises quarters for each,
 * newest-first. One extra round trip (watchlist, then quarters keyed
 * by the resulting ticker list) rather than a lateral-join cap, so
 * quarters_available and beat_streak (§3.1) always see full history.
 */
export async function loadLeaderboardData(
  pool: Pool,
  opts: { activeOnly: boolean; ticker?: string },
): Promise<TickerData[]> {
  let watchlistRes;
  if (opts.ticker) {
    watchlistRes = await pool.query(
      `select id, ticker, company_name, is_active
         from watchlist
        where upper(ticker) = upper($1)`,
      [opts.ticker],
    );
  } else {
    watchlistRes = await pool.query(
      `select id, ticker, company_name, is_active
         from watchlist
        where ($1::boolean is false or is_active)
        order by ticker`,
      [opts.activeOnly],
    );
  }

  const watchlistDbRows = watchlistRes.rows as unknown as WatchlistDbRow[];
  const watchlistRows = watchlistDbRows.map(rowToWatchlist);
  if (watchlistRows.length === 0) return [];

  const tickers = watchlistRows.map((w) => w.ticker);
  const quartersRes = await pool.query(
    `select ticker, fiscal_year, fiscal_quarter, fiscal_date_ending, report_date,
            report_hour, reported_eps, estimated_eps, eps_surprise_percent,
            reported_revenue, estimated_revenue, revenue_surprise_percent, pulled_at
       from earnings_surprises
      where ticker = any($1::text[])
      order by ticker, fiscal_year desc, fiscal_quarter desc`,
    [tickers],
  );

  const quartersByTicker = new Map<string, EarningsQuarterRow[]>();
  for (const r of quartersRes.rows as unknown as EarningsDbRow[]) {
    const list = quartersByTicker.get(r.ticker) ?? [];
    list.push(rowToQuarter(r));
    quartersByTicker.set(r.ticker, list);
  }

  return watchlistRows.map((watchlist) => ({
    watchlist,
    quarters: quartersByTicker.get(watchlist.ticker) ?? [],
  }));
}

/**
 * `data_as_of` (§4) = finished_at of the last successful pipeline_runs
 * row. That table ships in migration 014, which may not have run yet
 * against the deployed DB — a missing-relation error here must degrade
 * to `null`, not a 500 (per task spec), since it's informational only.
 */
export async function getDataAsOf(pool: Pool): Promise<string | null> {
  try {
    const res = await pool.query(
      `select finished_at
         from pipeline_runs
        where status = 'success'
        order by finished_at desc
        limit 1`,
    );
    const rows = res.rows as unknown as { finished_at: string | null }[];
    return rows[0]?.finished_at ?? null;
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    const message = err instanceof Error ? err.message : String(err);
    // Postgres 42P01 = undefined_table. Match on code first (reliable),
    // fall back to message sniffing in case the driver/proxy masks it.
    if (code === "42P01" || /relation .* does not exist/i.test(message)) {
      return null;
    }
    throw err;
  }
}
