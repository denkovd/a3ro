/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Tracker — canonical domain types.
   Mirrors core/types.ts's role for this module: adapters normalize
   INTO these shapes, storage persists them, the compute layer (engine.ts)
   and the API route only ever see these — never Finnhub's native payload.

   See earnings-beat-tracker-architecture.md for the full spec this
   module implements section-by-section (§ references below point back
   to it).
──────────────────────────────────────────────────────────────── */

export interface WatchlistEntry {
  id: number;
  ticker: string;
  companyName: string | null;
  isActive: boolean;
  addedAt: string;
}

/** report_hour: bmo = before market open, amc = after close, dmh = during market hours. */
export type ReportHour = "bmo" | "amc" | "dmh";

/**
 * One row of public.earnings_surprises, camelCased. Populated columns
 * are immutable once set; NULL columns may be filled by a later run's
 * fill-nulls-only upsert (§1/§2.1 v2 — replaces v1's ON CONFLICT DO
 * NOTHING, which froze late-arriving revenue at NULL forever).
 */
export interface EarningsQuarterRow {
  ticker: string;
  fiscalYear: number;
  fiscalQuarter: number;
  fiscalDateEnding: string | null;
  /** NULL for rows backfilled solely from /stock/earnings, which has
   *  no announcement-date field (§0, v2 backfill rework) — never
   *  faked from fiscalDateEnding/period. May be filled later by a
   *  calendar-enrich pass (fill-nulls upsert) if the quarter falls
   *  within that endpoint's ~30-day lookback window. */
  reportDate: string | null;
  reportHour: ReportHour | null;
  reportedEps: number | null;
  estimatedEps: number | null;
  epsSurprisePercent: number | null;
  reportedRevenue: number | null;
  estimatedRevenue: number | null;
  revenueSurprisePercent: number | null;
  source: string;
  /** Verbatim source payload(s) the row was built from (§1 "raw jsonb") —
   *  audit proof that no value was fabricated. */
  raw: unknown | null;
  pulledAt: string;
  /** First insert = pulledAt; bumped on every null-fill enrichment (§2.1). */
  updatedAt: string;
}

/** Input to upsertQuarter (§2 "Shared write routine"). Everything the
 *  routine needs to map + insert/enrich one reported quarter. */
export interface UpsertQuarterInput {
  ticker: string;
  fiscalYear: number;
  fiscalQuarter: number;
  /** NULL for EPS-only rows sourced from /stock/earnings (no
   *  announcement date on that endpoint) — see EarningsQuarterRow. */
  reportDate: string | null;
  reportHour: ReportHour | null;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  /** From /stock/earnings.surprisePercent, if that optional supplemental
   *  call was made — authoritative over safePct(epsActual, epsEstimate)
   *  when present (§2). */
  epsSurprisePercentOverride?: number | null;
  /** From /stock/earnings.period, if fetched (§2). */
  fiscalDateEnding?: string | null;
  /** Verbatim source payload(s) this row was built from (§1/§2.1 `raw`).
   *  Callers pass the exact calendar entry (and stock-earnings entry, if
   *  fetched) so `raw` is provable provenance, never a reconstruction. */
  raw?: unknown;
}

/** Outcome of one fill-nulls-only upsert (§2.1) — distinguishes a
 *  brand-new row from a null-fill enrichment of an existing row from a
 *  true no-op (conflict matched but nothing new to fill), so callers can
 *  tally `rows_inserted` vs `rows_enriched` for pipeline_runs (§1). */
export type UpsertOutcome = "inserted" | "enriched" | "noop";

/* ── Finnhub payload shapes (raw, pre-normalization) ────────────
   Adapters (finnhub.ts) parse INTO UpsertQuarterInput; nothing
   downstream of finnhub.ts ever sees these directly. */

/** One entry from GET /calendar/earnings. */
export interface FinnhubCalendarEntry {
  symbol: string;
  date: string; // announcement date, YYYY-MM-DD
  hour: string | null; // "bmo" | "amc" | "dmh" | ""
  year: number;
  quarter: number;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
}

/** One entry from GET /stock/earnings?symbol=X. */
export interface FinnhubStockEarningsEntry {
  symbol: string;
  period: string; // fiscal period-end date, YYYY-MM-DD
  year: number;
  quarter: number;
  actual: number | null;
  estimate: number | null;
  surprise: number | null;
  surprisePercent: number | null;
}

/* ── Compute layer outputs (§3) ─────────────────────────────────── */

/** Per-quarter shape the engine consumes — just the fields the
 *  compute layer needs, ordered newest-first by the caller. */
export interface QuarterSurprise {
  fiscalYear: number;
  fiscalQuarter: number;
  epsSurprisePercent: number | null;
  revenueSurprisePercent: number | null;
}

/** UI confidence hint (§3.3, derived, not stored). Number of the newest
 *  min(4, available) quarters carrying at least one non-null surprise:
 *  4 -> high, 2-3 -> medium, 1 -> low, 0 -> null (no signal at all). */
export type Confidence = "high" | "medium" | "low" | null;

export interface TickerMetrics {
  /** null when no quarter in the composite window has signal (§3.3) —
   *  renders "—", sorts last; never coerced to 0. */
  rankScore: number | null;
  beatStreak: number;
  /** True when beat_streak === quartersAvailable: the true streak may
   *  extend further back than the cache can see (§3.1). */
  streakIsCapped: boolean;
  confidence: Confidence;
  epsSurpriseAvg: number | null;
  revenueSurpriseAvg: number | null;
  /** Total cached quarters passed in (NOT capped to 4) — §3 "Input: all
   *  cached quarters for a ticker". */
  quartersAvailable: number;
}

/* ── Pipeline observability (§1 pipeline_runs, §2.4) ─────────────── */

export type PipelineFlow = "weekly" | "backfill";
export type PipelineRunStatus = "running" | "success" | "failed";

export interface PipelineRunRow {
  id: number;
  flow: PipelineFlow;
  startedAt: string;
  finishedAt: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  rowsInserted: number | null;
  rowsEnriched: number | null;
  tickersFailed: string[];
  status: PipelineRunStatus;
  error: string | null;
}

/* ── API contract shapes (§4) ────────────────────────────────────── */

export interface RankingsQueryParams {
  active: boolean;
  minQuarters: number;
  limit: number;
  order: "asc" | "desc";
}

export interface RankingsQuarterEntry {
  fiscal_year: number;
  fiscal_quarter: number;
  eps_surprise_percent: number | null;
  revenue_surprise_percent: number | null;
}

export interface RankingsLatest {
  fiscal_year: number;
  fiscal_quarter: number;
  fiscal_date_ending: string | null;
  /** NULL for quarters backfilled solely from /stock/earnings (see
   *  EarningsQuarterRow.reportDate). */
  report_date: string | null;
  report_hour: ReportHour | null;
  reported_eps: number | null;
  estimated_eps: number | null;
  eps_surprise_percent: number | null;
  reported_revenue: number | null;
  estimated_revenue: number | null;
  revenue_surprise_percent: number | null;
  pulled_at: string;
}

export interface RankingsResultEntry {
  ticker: string;
  company_name: string | null;
  is_active: boolean;
  /** null when no quarter has signal (§3.3) — never coerced to 0. */
  rank_score: number | null;
  beat_streak: number;
  streak_is_capped: boolean;
  confidence: Confidence;
  eps_surprise_avg: number | null;
  revenue_surprise_avg: number | null;
  quarters_available: number;
  latest: RankingsLatest;
  quarters: RankingsQuarterEntry[];
}

export interface RankingsResponse {
  generated_at: string;
  /** finished_at of the last successful pipeline_runs row (§4) — data
   *  freshness, distinct from generated_at (when the JSON was rendered). */
  data_as_of: string | null;
  count: number;
  params: {
    active: boolean;
    min_quarters: number;
    limit: number;
    order: "asc" | "desc";
  };
  results: RankingsResultEntry[];
}

/* ── API error taxonomy (§4 "Errors") ───────────────────────────── */

export type ApiErrorCode =
  | "INVALID_PARAM"
  | "INTERNAL"
  | "TICKER_NOT_FOUND"
  | "DB_UNAVAILABLE"
  /** @deprecated v1 name for DB_UNAVAILABLE (§4: "renamed ... this path
   *  has no upstream"). Kept so the existing (out-of-scope, app/-owned)
   *  route handler that still emits this code continues to type-check;
   *  new code should use DB_UNAVAILABLE. */
  | "UPSTREAM_UNAVAILABLE";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
