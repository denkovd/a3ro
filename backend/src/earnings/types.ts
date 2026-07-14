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
 * One row of public.earnings_surprises, camelCased. Immutable once
 * inserted (§1 "Immutability" — ON CONFLICT DO NOTHING).
 */
export interface EarningsQuarterRow {
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
  source: string;
  pulledAt: string;
}

/** Input to upsertQuarter (§2 "Shared insert routine"). Everything the
 *  routine needs to map + insert one reported quarter. */
export interface UpsertQuarterInput {
  ticker: string;
  fiscalYear: number;
  fiscalQuarter: number;
  reportDate: string;
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
}

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

export interface TickerMetrics {
  rankScore: number;
  beatStreak: number;
  epsSurpriseAvg: number | null;
  revenueSurpriseAvg: number | null;
  quartersAvailable: number;
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
  report_date: string;
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
  rank_score: number;
  beat_streak: number;
  eps_surprise_avg: number | null;
  revenue_surprise_avg: number | null;
  quarters_available: number;
  latest: RankingsLatest;
  quarters: RankingsQuarterEntry[];
}

export interface RankingsResponse {
  generated_at: string;
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

export type ApiErrorCode = "INVALID_PARAM" | "INTERNAL" | "UPSTREAM_UNAVAILABLE";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
