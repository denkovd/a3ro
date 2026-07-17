/* ────────────────────────────────────────────────────────────────
   Repository layer for the Earnings-Beat Tracker — the only module
   that writes SQL for watchlist / earnings_surprises / pipeline_runs.
   pipeline.ts calls the write paths; the API route (app/api/watchlist/
   rankings) calls getRankingData, which is DB-only (§4: "the read
   path never calls Finnhub").
──────────────────────────────────────────────────────────────── */

import {
  EarningsQuarterRow, PipelineFlow, PipelineRunStatus, ReportHour,
  UpsertOutcome, WatchlistEntry,
} from "../earnings/types";
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
 * ticker, regardless of completeness. Kept for callers that only need
 * a plain "is this quarter cached at all" check.
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

/**
 * Cached (fiscal_year, fiscal_quarter) keys for a ticker, each mapped
 * to whether reported_revenue is still NULL. Backs Flow A step 3
 * (§2.2): "re-attempt rows with missing revenue" using data already in
 * hand from the step-2 calendar sweep, at zero extra API calls. A key
 * present with value `false` means the quarter is fully populated and
 * should be skipped; a key absent means the quarter isn't cached yet
 * (step 4: insert).
 */
export async function getCachedQuarterRevenueStatus(
  db: Queryable,
  ticker: string,
): Promise<Map<string, boolean>> {
  const res = await db.query(
    `select fiscal_year, fiscal_quarter, reported_revenue
       from earnings_surprises
      where ticker = $1`,
    [ticker],
  );
  const out = new Map<string, boolean>();
  for (const r of res.rows as unknown as {
    fiscal_year: number; fiscal_quarter: number; reported_revenue: number | string | null;
  }[]) {
    out.set(`${r.fiscal_year}-${r.fiscal_quarter}`, r.reported_revenue === null);
  }
  return out;
}

/* ── earnings_surprises writes ───────────────────────────────────── */

/**
 * §2.1 "Insert = fill-nulls-only upsert" — the DB half of upsertQuarter.
 * Field mapping and safePct computation happen in pipeline.ts; this
 * function only persists the already-mapped row with the exact
 * COALESCE-per-column upsert from the spec (plus `raw`, which follows
 * the same fill-nulls pattern but isn't part of the spec's WHERE
 * trigger list — see pipeline.ts's upsertQuarter doc comment).
 *
 * `xmax = 0` in the RETURNING clause is the standard Postgres idiom
 * for "this row was just inserted, not updated by the ON CONFLICT
 * branch" — it distinguishes a brand-new quarter from a null-fill
 * enrichment of an existing one. When the WHERE clause evaluates false
 * (nothing new to fill), the conflict update is skipped entirely, no
 * row is returned, and this resolves to "noop" — exactly the
 * "no-op conflicts don't churn updated_at" guarantee the spec calls
 * for (§2.1).
 */
export async function upsertQuarterRow(
  db: Queryable,
  row: {
    ticker: string;
    fiscalYear: number;
    fiscalQuarter: number;
    fiscalDateEnding: string | null;
    /** NULL for EPS-only rows backfilled from /stock/earnings (no
     *  announcement date on that endpoint) — fillable later by the
     *  calendar-enrich pass via the same fill-nulls upsert. */
    reportDate: string | null;
    reportHour: ReportHour | null;
    reportedEps: number | null;
    estimatedEps: number | null;
    epsSurprisePercent: number | null;
    reportedRevenue: number | null;
    estimatedRevenue: number | null;
    revenueSurprisePercent: number | null;
    raw: unknown;
    source?: string;
  },
): Promise<UpsertOutcome> {
  const res = await db.query(
    `insert into earnings_surprises
       (ticker, fiscal_year, fiscal_quarter, fiscal_date_ending, report_date,
        report_hour, reported_eps, estimated_eps, eps_surprise_percent,
        reported_revenue, estimated_revenue, revenue_surprise_percent, source, raw)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (ticker, fiscal_year, fiscal_quarter) do update set
       fiscal_date_ending       = coalesce(earnings_surprises.fiscal_date_ending,       excluded.fiscal_date_ending),
       report_date              = coalesce(earnings_surprises.report_date,              excluded.report_date),
       report_hour              = coalesce(earnings_surprises.report_hour,              excluded.report_hour),
       reported_eps             = coalesce(earnings_surprises.reported_eps,             excluded.reported_eps),
       estimated_eps            = coalesce(earnings_surprises.estimated_eps,            excluded.estimated_eps),
       eps_surprise_percent     = coalesce(earnings_surprises.eps_surprise_percent,     excluded.eps_surprise_percent),
       reported_revenue         = coalesce(earnings_surprises.reported_revenue,         excluded.reported_revenue),
       estimated_revenue        = coalesce(earnings_surprises.estimated_revenue,        excluded.estimated_revenue),
       revenue_surprise_percent = coalesce(earnings_surprises.revenue_surprise_percent, excluded.revenue_surprise_percent),
       raw                      = coalesce(earnings_surprises.raw,                      excluded.raw),
       updated_at               = now()
     where earnings_surprises.fiscal_date_ending       is null and excluded.fiscal_date_ending       is not null
        or earnings_surprises.report_date              is null and excluded.report_date              is not null
        or earnings_surprises.report_hour              is null and excluded.report_hour              is not null
        or earnings_surprises.reported_eps             is null and excluded.reported_eps             is not null
        or earnings_surprises.estimated_eps            is null and excluded.estimated_eps            is not null
        or earnings_surprises.eps_surprise_percent     is null and excluded.eps_surprise_percent     is not null
        or earnings_surprises.reported_revenue         is null and excluded.reported_revenue         is not null
        or earnings_surprises.estimated_revenue        is null and excluded.estimated_revenue        is not null
        or earnings_surprises.revenue_surprise_percent is null and excluded.revenue_surprise_percent is not null
     returning (xmax = 0) as inserted`,
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
      row.raw ?? null,
    ],
  );
  if ((res.rowCount ?? 0) === 0) return "noop";
  const inserted = (res.rows[0] as { inserted: boolean }).inserted;
  return inserted ? "inserted" : "enriched";
}

interface EarningsSurpriseDbRow {
  ticker: string;
  fiscal_year: number;
  fiscal_quarter: number;
  fiscal_date_ending: string | null;
  report_date: string | null;
  report_hour: ReportHour | null;
  reported_eps: number | null;
  estimated_eps: number | null;
  eps_surprise_percent: number | null;
  reported_revenue: number | null;
  estimated_revenue: number | null;
  revenue_surprise_percent: number | null;
  source: string;
  raw: unknown | null;
  pulled_at: string;
  updated_at: string;
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
    raw: r.raw ?? null,
    pulledAt: r.pulled_at,
    updatedAt: r.updated_at,
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
            source, raw, pulled_at, updated_at
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
 *
 * NOTE (v2 handoff): §3.1's beat_streak now walks ALL cached history,
 * not just the newest 4 (see engine.ts's module header). This query's
 * `perTicker` cap still defaults to 4 for the composite/averages
 * window, matching §3.2/§3.3 — but a caller that wants an honest
 * (uncapped) beat_streak must pass a larger `perTicker` (or a
 * dedicated "full history" query) and let computeTickerMetrics do the
 * internal windowing itself. The existing API route (out of scope for
 * this change) still calls this with perTicker: 4, so streaks it
 * renders are capped at 4 even when more history is cached — flagged
 * in the handoff notes, not silently fixed here.
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
            q.source, q.raw, q.pulled_at, q.updated_at
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

/* ── pipeline_runs (§1, §2.2 watermark, §2.4 observability) ─────── */

/**
 * Starts a run row (status='running') and returns its id. Callers
 * must always follow up with finishPipelineRun — including from a
 * catch block on any unhandled failure — so a crash mid-run still
 * leaves a terminal 'failed' row rather than one stuck at 'running'
 * forever (task requirement: "finally-style path").
 */
export async function startPipelineRun(
  db: Queryable,
  run: { flow: PipelineFlow; windowFrom: string | null; windowTo: string | null },
): Promise<number> {
  const res = await db.query(
    `insert into pipeline_runs (flow, window_from, window_to, status)
     values ($1, $2, $3, 'running')
     returning id`,
    [run.flow, run.windowFrom, run.windowTo],
  );
  const id = (res.rows[0] as { id: number | string }).id;
  return typeof id === "number" ? id : Number(id);
}

export async function finishPipelineRun(
  db: Queryable,
  id: number,
  finish: {
    status: PipelineRunStatus;
    rowsInserted: number;
    rowsEnriched: number;
    tickersFailed: string[];
    error?: string | null;
  },
): Promise<void> {
  await db.query(
    `update pipeline_runs
        set finished_at = now(),
            status = $2,
            rows_inserted = $3,
            rows_enriched = $4,
            tickers_failed = $5,
            error = $6
      where id = $1`,
    [id, finish.status, finish.rowsInserted, finish.rowsEnriched, finish.tickersFailed, finish.error ?? null],
  );
}

/**
 * §2.2 step 1's watermark source: the window_to of the most recent
 * *successful* run of the given flow. Absence (null) tells the caller
 * to fall back to `today - 8d` per the spec.
 */
export async function getLastSuccessfulPipelineRun(
  db: Queryable,
  flow: PipelineFlow,
): Promise<{ windowTo: string } | null> {
  const res = await db.query(
    `select window_to
       from pipeline_runs
      where flow = $1 and status = 'success' and window_to is not null
      order by finished_at desc nulls last, id desc
      limit 1`,
    [flow],
  );
  const row = res.rows[0] as { window_to: string } | undefined;
  return row ? { windowTo: row.window_to } : null;
}

/**
 * §4 "data_as_of" — finished_at of the last successful run of ANY
 * flow. Exported for the (out-of-scope) API route to wire up; not
 * currently called by anything in this backend module itself.
 */
export async function getLastSuccessfulRunFinishedAt(db: Queryable): Promise<string | null> {
  const res = await db.query(
    `select finished_at
       from pipeline_runs
      where status = 'success' and finished_at is not null
      order by finished_at desc
      limit 1`,
  );
  const row = res.rows[0] as { finished_at: string } | undefined;
  return row ? row.finished_at : null;
}
