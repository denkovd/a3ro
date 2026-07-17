/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Tracker — pipelines (architecture spec §2, v2).

   Flow A (weekly cron) and Flow B (backfill on watchlist-add) share
   one write routine, upsertQuarter, so the field mapping and safePct
   logic live in exactly one place. Both flows are fully idempotent
   (§2 "Both flows are idempotent") — re-running either any number of
   times converges to the same DB state, now including late-arriving
   revenue (§2.1's fill-nulls-only upsert replaces v1's DO NOTHING).

   Every run — success or failure — is recorded in pipeline_runs
   (§1/§2.4): the weekly flow's window is a watermark read from the
   last successful run of the same flow, not a fixed lookback, so a
   missed/failed week is auto-recovered on the next run instead of
   silently losing that week's reports.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { fetchCalendarEarnings, fetchStockEarnings, safePct } from "./finnhub";
import { FinnhubCalendarEntry, FinnhubStockEarningsEntry, ReportHour, UpsertOutcome, UpsertQuarterInput } from "./types";
import { Queryable } from "../storage/db";
import {
  finishPipelineRun,
  getActiveQuarterCounts,
  getActiveWatchlist,
  getCachedQuarterRevenueStatus,
  getLastSuccessfulPipelineRun,
  startPipelineRun,
  upsertQuarterRow,
} from "../storage/earningsRepo";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number, now = new Date()): string {
  return isoDate(new Date(now.getTime() - n * DAY_MS));
}

function addDaysIso(iso: string, n: number): string {
  return isoDate(new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS));
}

/* ── §2.2 step 1: watermark window constants ────────────────────── */

const WEEKLY_FALLBACK_LOOKBACK_DAYS = 8; // used only when no prior successful run exists
const WEEKLY_OVERLAP_DAYS = 2;
/** The free-tier /calendar/earnings hard lookback limit (verified live
 *  2026-07-16): requests for windows older than ~30 days return empty
 *  arrays. This caps the weekly watermark span AND defines the
 *  backfill's calendar-enrich window — quarters older than this are
 *  only recoverable EPS-only via /stock/earnings (last 4 quarters). */
const CALENDAR_LOOKBACK_DAYS = 30;

/* ── §2.4 retry policy: 429/5xx/network, twice, exponential + jitter ── */

const RETRY_DELAYS_MS = [1000, 4000] as const; // ~1s, ~4s base delays
const RETRY_JITTER_RATIO = 0.25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableError(err: unknown): boolean {
  return err instanceof SourceError && (err.kind === "rate_limited" || err.kind === "upstream_error" || err.kind === "network");
}

/**
 * §2.4 "Retries: on HTTP 429/5xx/network error, retry twice with
 * exponential backoff + jitter (≈1s, 4s). After the third failure,
 * give up on that call." Non-retriable SourceError kinds (auth,
 * bad_payload, no_data) and non-SourceError throws fail immediately.
 */
async function withEarningsRetry<T>(
  fn: () => Promise<T>,
  log: (msg: string) => void,
  label: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetriableError(err) || attempt === RETRY_DELAYS_MS.length) throw err;
      const base = RETRY_DELAYS_MS[attempt];
      const delay = base + Math.random() * base * RETRY_JITTER_RATIO;
      const kind = err instanceof SourceError ? err.kind : "unknown";
      log(`[earnings] ${label} failed (${kind}), retrying in ~${Math.round(delay)}ms (attempt ${attempt + 2}/${RETRY_DELAYS_MS.length + 1})`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/* ── shared write routine (§2.1 "Shared write routine — upsertQuarter") ── */

/**
 * Maps one reported quarter to the earnings_surprises row shape and
 * writes it via the fill-nulls-only upsert (§2.1 — replaces v1's ON
 * CONFLICT DO NOTHING so late-arriving revenue is absorbed on a later
 * run instead of frozen at NULL forever). `eps_surprise_percent`
 * prefers the /stock/earnings surprisePercent when the optional
 * supplemental call was made; otherwise it's derived with safePct
 * from the calendar's own actual/estimate, exactly as §2.1 specifies.
 *
 * `raw` (§1): stores the exact FinnhubCalendarEntry (and, when fetched,
 * FinnhubStockEarningsEntry) this row was built from. NOTE this is the
 * *adapter-normalized* shape, not Finnhub's untouched wire JSON —
 * finnhub.ts's own contract ("adapters normalize INTO these shapes;
 * nothing downstream ever sees Finnhub's native payload") already
 * discards the raw wire body before pipeline.ts sees it, and widening
 * that contract to also return the untouched body was judged out of
 * scope for this upgrade (it would change fetchCalendarEarnings's and
 * fetchStockEarnings's return shape, a wider blast radius than this
 * task's file list). What's stored is still exact, 1:1 field
 * provenance for every column written — proof no value was fabricated
 * — just not byte-identical to the HTTP response body. Flagged in the
 * handoff notes as a deliberate, reasoned deviation from a literal
 * reading of "verbatim source payload".
 *
 * Returns the upsert outcome so callers can tally rows_inserted vs
 * rows_enriched for pipeline_runs (§1).
 */
export async function upsertQuarter(db: Queryable, input: UpsertQuarterInput): Promise<UpsertOutcome> {
  const epsSurprisePercent =
    input.epsSurprisePercentOverride !== undefined && input.epsSurprisePercentOverride !== null
      ? input.epsSurprisePercentOverride
      : safePct(input.epsActual, input.epsEstimate);
  const revenueSurprisePercent = safePct(input.revenueActual, input.revenueEstimate);

  return upsertQuarterRow(db, {
    ticker: input.ticker,
    fiscalYear: input.fiscalYear,
    fiscalQuarter: input.fiscalQuarter,
    fiscalDateEnding: input.fiscalDateEnding ?? null,
    reportDate: input.reportDate,
    reportHour: input.reportHour,
    reportedEps: input.epsActual,
    estimatedEps: input.epsEstimate,
    epsSurprisePercent,
    reportedRevenue: input.revenueActual,
    estimatedRevenue: input.revenueEstimate,
    revenueSurprisePercent,
    raw: input.raw ?? null,
  });
}

/**
 * Edge case "Duplicate calendar entries" (§5): dedup within a batch
 * before insert, preferring the row with a non-null epsActual. The
 * unique key + the fill-nulls upsert is the DB-level backstop; this
 * is the in-memory pre-filter the spec also calls for.
 */
function dedupeCalendarBatch(rows: FinnhubCalendarEntry[]): FinnhubCalendarEntry[] {
  const byKey = new Map<string, FinnhubCalendarEntry>();
  for (const row of rows) {
    const key = `${row.symbol}-${row.year}-${row.quarter}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
    } else if (existing.epsActual === null && row.epsActual !== null) {
      byKey.set(key, row); // prefer the row with a non-null actual
    }
  }
  return [...byKey.values()];
}

/** report_hour ← calendar.hour, with '' normalized to NULL (§2.1). Also
 *  a defensive re-normalization: finnhub.ts's own adapter already maps
 *  anything outside {bmo,amc,dmh} (including '') to null at parse time
 *  (V3), so this is belt-and-suspenders against a shape change there. */
function toReportHour(h: string | null): ReportHour | null {
  return h === "bmo" || h === "amc" || h === "dmh" ? h : null;
}

/** ~1.1s spacing at Finnhub's 60 req/min free-tier cap, engaged whenever
 *  more than a handful of calls are queued (§2.3 "Pacing"). */
const RATE_LIMIT_SPACING_MS = 1100;
const PACING_THRESHOLD = 5;

/* ── Flow A — weekly incremental cron (§2.2) ────────────────────── */

export interface WeeklyIncrementalReport {
  windowFrom: string;
  windowTo: string;
  /** True when the watermark span exceeded the calendar's 30-day
   *  lookback limit and was capped (§2.2 step 1). */
  windowCapped: boolean;
  reportedCandidates: number;
  alreadyCached: number;
  /** "TICKER-YYYY-Qn" rows whose missing revenue was filled by step 3 (zero extra calls). */
  revenueEnriched: string[];
  /** "TICKER-YYYY-Qn" brand-new rows inserted by step 4. */
  inserted: string[];
  /** Tickers where the optional supplemental call failed (non-fatal — insert still happened). */
  supplementFailures: string[];
  status: "success" | "failed";
  error?: string;
}

export interface WeeklyIncrementalOptions {
  /** Injectable clock for tests. */
  now?: () => Date;
  /** Whether to make the optional /stock/earnings supplemental call
   *  per newly-reported ticker (default true — recommended by §2.1/V2). */
  fetchSupplement?: boolean;
  log?: (msg: string) => void;
}

/**
 * Flow A (§2.2): weekly cron, gated by data not by the calendar.
 *
 * 1. Watermark window: `from = (last successful weekly run's window_to,
 *    else today-8d) - 2d overlap`, `to = today`, capped at 30 days —
 *    the free-tier calendar's hard lookback limit (logged warning if
 *    the cap engages; anything older is EPS-only recoverable via the
 *    backfill/reconcile flow).
 * 2. One whole-market /calendar/earnings call. A failure here fails
 *    the whole run (status='failed') and the watermark does NOT
 *    advance, so the next run re-covers this window (§2.4).
 * 3. Cached rows in the window with reported_revenue IS NULL are
 *    re-attempted from the SAME calendar sweep — zero extra calls.
 * 4. Genuinely new (ticker, year, quarter)s: optional /stock/earnings
 *    supplement (isolated failures never block the insert), then
 *    upsertQuarter.
 * 5. Every run is recorded in pipeline_runs regardless of outcome.
 */
export async function runWeeklyIncremental(
  db: Queryable,
  opts: WeeklyIncrementalOptions = {},
): Promise<WeeklyIncrementalReport> {
  const now = opts.now?.() ?? new Date();
  const fetchSupplement = opts.fetchSupplement ?? true;
  const log = opts.log ?? (() => {});

  const lastRun = await getLastSuccessfulPipelineRun(db, "weekly");
  const baseFrom = lastRun?.windowTo ?? daysAgo(WEEKLY_FALLBACK_LOOKBACK_DAYS, now);
  let windowFrom = addDaysIso(baseFrom, -WEEKLY_OVERLAP_DAYS);
  const windowTo = isoDate(now);

  let windowCapped = false;
  const spanDays = Math.round((Date.parse(`${windowTo}T00:00:00Z`) - Date.parse(`${windowFrom}T00:00:00Z`)) / DAY_MS);
  if (spanDays > CALENDAR_LOOKBACK_DAYS) {
    windowCapped = true;
    windowFrom = daysAgo(CALENDAR_LOOKBACK_DAYS, now);
    log(
      `[earnings] weekly window capped at ${CALENDAR_LOOKBACK_DAYS}d (watermark span was ${spanDays}d — the free-tier calendar cannot look back further; ` +
      `quarters older than ${CALENDAR_LOOKBACK_DAYS}d are only recoverable EPS-only via the backfill/reconcile flow)`,
    );
  }

  const runId = await startPipelineRun(db, { flow: "weekly", windowFrom, windowTo });

  const report: WeeklyIncrementalReport = {
    windowFrom,
    windowTo,
    windowCapped,
    reportedCandidates: 0,
    alreadyCached: 0,
    revenueEnriched: [],
    inserted: [],
    supplementFailures: [],
    status: "success",
  };
  const tickersFailed: string[] = [];
  let rowsInserted = 0;
  let rowsEnriched = 0;

  try {
    // Step 2: whole-market calendar sweep — no `symbol` filter. A
    // failure here propagates to the outer catch (fails the run,
    // watermark not advanced).
    const [watchlist, allCalendarRows] = await Promise.all([
      getActiveWatchlist(db),
      withEarningsRetry(() => fetchCalendarEarnings(windowFrom, windowTo), log, "weekly calendar sweep"),
    ]);
    const activeTickers = new Set(watchlist.map((w) => w.ticker));

    // Edge case "Not yet reported" (§5): epsActual !== null is the
    // definitive "it has reported" signal, not the scheduled date.
    const reported = dedupeCalendarBatch(
      allCalendarRows.filter((r) => activeTickers.has(r.symbol) && r.epsActual !== null),
    );
    report.reportedCandidates = reported.length;

    let supplementCallsMade = 0;
    for (const row of reported) {
      const revenueStatus = await getCachedQuarterRevenueStatus(db, row.symbol);
      const key = `${row.year}-${row.quarter}`;

      if (revenueStatus.has(key)) {
        const revenueMissing = revenueStatus.get(key) === true;
        if (!revenueMissing) {
          report.alreadyCached += 1;
          continue;
        }
        // Step 3: re-attempt using data already fetched in step 2 —
        // zero extra API calls. No supplement fetch here by design.
        const outcome = await upsertQuarter(db, {
          ticker: row.symbol,
          fiscalYear: row.year,
          fiscalQuarter: row.quarter,
          reportDate: row.date,
          reportHour: toReportHour(row.hour),
          epsActual: row.epsActual,
          epsEstimate: row.epsEstimate,
          revenueActual: row.revenueActual,
          revenueEstimate: row.revenueEstimate,
          raw: { calendar: row },
        });
        if (outcome === "enriched") {
          rowsEnriched += 1;
          report.revenueEnriched.push(`${row.symbol}-${row.year}-Q${row.quarter}`);
        }
        continue;
      }

      // Step 4: genuinely new quarter.
      let epsSurprisePercentOverride: number | null | undefined;
      let fiscalDateEnding: string | null | undefined;
      let stockEntry: FinnhubStockEarningsEntry | undefined;
      if (fetchSupplement) {
        if (supplementCallsMade > 0 && reported.length > PACING_THRESHOLD) {
          await sleep(RATE_LIMIT_SPACING_MS);
        }
        supplementCallsMade += 1;
        try {
          const stockEntries = await withEarningsRetry(
            () => fetchStockEarnings(row.symbol),
            log,
            `stock earnings supplement (${row.symbol})`,
          );
          stockEntry = stockEntries.find((s) => s.year === row.year && s.quarter === row.quarter);
          if (stockEntry) {
            epsSurprisePercentOverride = stockEntry.surprisePercent;
            fiscalDateEnding = stockEntry.period;
          }
        } catch (err) {
          // §2.4: a failed SUPPLEMENTAL call never blocks the insert —
          // insert with fiscal_date_ending NULL, record the ticker.
          tickersFailed.push(row.symbol);
          report.supplementFailures.push(row.symbol);
          log(`[earnings] supplemental /stock/earnings failed for ${row.symbol}: ${String(err)}`);
        }
      }

      const raw: Record<string, unknown> = { calendar: row };
      if (stockEntry) raw.stockEarnings = stockEntry;

      const outcome = await upsertQuarter(db, {
        ticker: row.symbol,
        fiscalYear: row.year,
        fiscalQuarter: row.quarter,
        reportDate: row.date,
        reportHour: toReportHour(row.hour),
        epsActual: row.epsActual,
        epsEstimate: row.epsEstimate,
        revenueActual: row.revenueActual,
        revenueEstimate: row.revenueEstimate,
        epsSurprisePercentOverride,
        fiscalDateEnding,
        raw,
      });
      if (outcome === "inserted") {
        rowsInserted += 1;
        report.inserted.push(`${row.symbol}-${row.year}-Q${row.quarter}`);
      } else if (outcome === "enriched") {
        rowsEnriched += 1;
      }
    }

    await finishPipelineRun(db, runId, { status: "success", rowsInserted, rowsEnriched, tickersFailed });

    // §2.4 alert signal (surfaced via log, acted on by GH Actions/observability,
    // not by this function): rows_inserted === 0 in a week the market-wide
    // sweep showed >=1 watchlist ticker reporting is a strong filter/parse-bug signal.
    if (rowsInserted === 0 && rowsEnriched === 0 && report.reportedCandidates > 0) {
      log(`[earnings] weekly run wrote 0 rows despite ${report.reportedCandidates} reported candidate(s) — possible filter/parse bug`);
    }

    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishPipelineRun(db, runId, { status: "failed", rowsInserted, rowsEnriched, tickersFailed, error: message });
    report.status = "failed";
    report.error = message;
    throw err;
  }
}

/* ── Flow B — backfill on watchlist-add (§2.3) ──────────────────── */

export interface BackfillReport {
  ticker: string;
  /** The calendar-enrich window (today−30d .. today) — NOT the span of
   *  history seeded; /stock/earnings has no window parameter. */
  windowFrom: string;
  windowTo: string;
  /** Reported quarters seen from the primary /stock/earnings call. */
  candidates: number;
  inserted: string[];
  enriched: string[];
  /** True when the calendar-enrich call failed (non-fatal — the
   *  EPS-only rows from /stock/earnings are still written). */
  enrichFailed: boolean;
  status: "success" | "failed";
  error?: string;
}

/**
 * Flow B (§2.3, v2 rework): seeds trailing history for one ticker so
 * streaks and trailing averages are computable immediately.
 *
 * The free-tier calendar cannot look back further than ~30 days
 * (verified live 2026-07-16: older windows return empty arrays), so a
 * multi-year calendar backfill is impossible. Instead:
 *
 * 1. PRIMARY — /stock/earnings: up to the last 4 quarters, EPS-only.
 *    Each reported entry (actual !== null) upserts with fiscal
 *    year/quarter from the entry, fiscal_date_ending = period,
 *    Finnhub's surprisePercent verbatim, and report_date/report_hour/
 *    revenue all NULL (the endpoint doesn't carry them — never faked).
 *    A failure here fails the run: with no primary rows there is
 *    nothing to enrich.
 * 2. ENRICH — /calendar/earnings scoped to the ticker over
 *    today−30d .. today: any quarter reported inside the calendar's
 *    lookback upserts with full calendar data (report_date, hour,
 *    revenue); the fill-nulls upsert (§2.1) merges it onto the
 *    EPS-only row via the (ticker, fiscal_year, fiscal_quarter) key —
 *    the two endpoints' (year, quarter) labels agree (verified on
 *    offset-fiscal-year tickers MU/NKE) so no in-memory join is
 *    needed. A failure here is non-fatal (EPS-only rows already
 *    landed) — recorded via enrichFailed/tickers_failed.
 *
 * Records a pipeline_runs row with flow='backfill'.
 */
export async function backfillTicker(
  db: Queryable,
  ticker: string,
  opts: { now?: () => Date; log?: (msg: string) => void } = {},
): Promise<BackfillReport> {
  const now = opts.now?.() ?? new Date();
  const log = opts.log ?? (() => {});

  const windowFrom = daysAgo(CALENDAR_LOOKBACK_DAYS, now);
  const windowTo = isoDate(now);

  const runId = await startPipelineRun(db, { flow: "backfill", windowFrom, windowTo });

  const report: BackfillReport = {
    ticker,
    windowFrom,
    windowTo,
    candidates: 0,
    inserted: [],
    enriched: [],
    enrichFailed: false,
    status: "success",
  };
  const tickersFailed: string[] = [];
  let rowsInserted = 0;
  let rowsEnriched = 0;

  const tally = (outcome: UpsertOutcome, year: number, quarter: number) => {
    if (outcome === "inserted") {
      rowsInserted += 1;
      report.inserted.push(`${ticker}-${year}-Q${quarter}`);
    } else if (outcome === "enriched") {
      rowsEnriched += 1;
      report.enriched.push(`${ticker}-${year}-Q${quarter}`);
    }
  };

  try {
    // Step 1: PRIMARY /stock/earnings — a failure here propagates to
    // the outer catch and fails the run.
    const stockEntries = (await withEarningsRetry(() => fetchStockEarnings(ticker), log, `backfill stock earnings (${ticker})`))
      .filter((s) => s.actual !== null); // edge case "Not yet reported" (§5)
    report.candidates = stockEntries.length;

    for (const entry of stockEntries) {
      const outcome = await upsertQuarter(db, {
        ticker,
        fiscalYear: entry.year,
        fiscalQuarter: entry.quarter,
        reportDate: null, // /stock/earnings has no announcement date — never faked from `period`
        reportHour: null,
        epsActual: entry.actual,
        epsEstimate: entry.estimate,
        revenueActual: null,
        revenueEstimate: null,
        epsSurprisePercentOverride: entry.surprisePercent,
        fiscalDateEnding: entry.period,
        raw: { stockEarnings: entry },
      });
      tally(outcome, entry.year, entry.quarter);
    }

    // Step 2: ENRICH from the calendar's ~30-day lookback — non-fatal.
    try {
      const calendarRows = dedupeCalendarBatch(
        (await withEarningsRetry(() => fetchCalendarEarnings(windowFrom, windowTo, ticker), log, `backfill calendar enrich (${ticker})`))
          .filter((r) => r.epsActual !== null),
      );
      for (const row of calendarRows) {
        const outcome = await upsertQuarter(db, {
          ticker: row.symbol,
          fiscalYear: row.year,
          fiscalQuarter: row.quarter,
          reportDate: row.date,
          reportHour: toReportHour(row.hour),
          epsActual: row.epsActual,
          epsEstimate: row.epsEstimate,
          revenueActual: row.revenueActual,
          revenueEstimate: row.revenueEstimate,
          raw: { calendar: row },
        });
        tally(outcome, row.year, row.quarter);
      }
    } catch (err) {
      report.enrichFailed = true;
      tickersFailed.push(ticker);
      log(`[earnings] backfill calendar enrich failed for ${ticker} (EPS-only rows kept): ${String(err)}`);
    }

    await finishPipelineRun(db, runId, { status: "success", rowsInserted, rowsEnriched, tickersFailed });
    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishPipelineRun(db, runId, { status: "failed", rowsInserted, rowsEnriched, tickersFailed, error: message });
    report.status = "failed";
    report.error = message;
    throw err;
  }
}

export interface BackfillReconcileReport {
  checked: number;
  backfilled: BackfillReport[];
  /** Tickers whose backfillTicker call itself threw (e.g. the primary
   *  /stock/earnings call exhausted retries) — isolated here so one bad
   *  ticker never blocks reconciling the rest of the watchlist. */
  failed: { ticker: string; error: string }[];
}

/**
 * Nightly reconcile (§2.3: "or as a nightly reconcile for tickers with
 * < 4 cached quarters"). Runs backfillTicker for every active ticker
 * under the threshold, spaced ~1.1s apart per §2.3's pacing note so a
 * large watchlist never approaches Finnhub's 60/min free-tier cap.
 * Each ticker's backfillTicker records its own pipeline_runs row; a
 * single ticker failing (after its own internal retries) is isolated
 * here so it can't abort reconciliation of the rest of the watchlist.
 */
export async function reconcileUnderfilledTickers(
  db: Queryable,
  opts: { minQuarters?: number; now?: () => Date; log?: (msg: string) => void } = {},
): Promise<BackfillReconcileReport> {
  const minQuarters = opts.minQuarters ?? 4;
  const log = opts.log ?? (() => {});
  const counts = await getActiveQuarterCounts(db);
  const underfilled = [...counts.entries()].filter(([, count]) => count < minQuarters).map(([ticker]) => ticker);

  const report: BackfillReconcileReport = { checked: underfilled.length, backfilled: [], failed: [] };
  for (let i = 0; i < underfilled.length; i++) {
    if (i > 0) await sleep(RATE_LIMIT_SPACING_MS); // rate-limit spacing (§2.3)
    try {
      report.backfilled.push(await backfillTicker(db, underfilled[i], opts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.failed.push({ ticker: underfilled[i], error: message });
      log(`[earnings] reconcile backfill failed for ${underfilled[i]}: ${message}`);
    }
  }
  return report;
}
