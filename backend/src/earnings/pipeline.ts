/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Tracker — pipelines (architecture spec §2).

   Flow A (weekly cron) and Flow B (backfill on watchlist-add) share
   one insert routine, upsertQuarter, so the field mapping and
   safePct logic live in exactly one place. Both flows are fully
   idempotent (§2 "Idempotency guarantee") — re-running either any
   number of times converges to the same DB state.
──────────────────────────────────────────────────────────────── */

import { fetchCalendarEarnings, fetchStockEarnings, safePct } from "./finnhub";
import { FinnhubCalendarEntry, ReportHour, UpsertQuarterInput } from "./types";
import { Queryable } from "../storage/db";
import {
  getActiveQuarterCounts,
  getActiveWatchlist,
  getCachedQuarterKeys,
  insertQuarterIfAbsent,
} from "../storage/earningsRepo";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number, now = new Date()): string {
  return isoDate(new Date(now.getTime() - n * DAY_MS));
}

/* ── shared insert routine (§2 "Shared insert routine — upsertQuarter") ── */

/**
 * Maps one reported quarter to the earnings_surprises row shape and
 * inserts it (ON CONFLICT DO NOTHING — the immutability contract,
 * §1). `eps_surprise_percent` prefers the /stock/earnings
 * surprisePercent when the optional supplemental call was made;
 * otherwise it's derived with safePct from the calendar's own
 * actual/estimate, exactly as §2 specifies.
 *
 * Returns true if a new row was written, false if the quarter was
 * already cached (idempotency backstop for cron overlap / races —
 * §2 step 3, §5 "Duplicate calendar entries").
 */
export async function upsertQuarter(db: Queryable, input: UpsertQuarterInput): Promise<boolean> {
  const epsSurprisePercent =
    input.epsSurprisePercentOverride !== undefined && input.epsSurprisePercentOverride !== null
      ? input.epsSurprisePercentOverride
      : safePct(input.epsActual, input.epsEstimate);
  const revenueSurprisePercent = safePct(input.revenueActual, input.revenueEstimate);

  return insertQuarterIfAbsent(db, {
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
  });
}

/**
 * Edge case "Duplicate calendar entries" (§5): dedup within a batch
 * before insert, preferring the row with a non-null epsActual. The
 * unique key + ON CONFLICT DO NOTHING is the DB-level backstop; this
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

function toReportHour(h: string | null): ReportHour | null {
  return h === "bmo" || h === "amc" || h === "dmh" ? h : null;
}

/** ~1.1s spacing at Finnhub's 60 req/min free-tier cap (§2 Flow B "Rate-limit note"). */
const RATE_LIMIT_SPACING_MS = 1100;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── Flow A — weekly incremental cron (§2) ──────────────────────── */

export interface WeeklyIncrementalReport {
  windowFrom: string;
  windowTo: string;
  reportedCandidates: number;
  alreadyCached: number;
  inserted: string[]; // "TICKER-YYYY-Qn"
  supplementFailures: string[]; // tickers where the optional /stock/earnings call failed (non-fatal)
}

export interface WeeklyIncrementalOptions {
  /** Injectable clock for tests. */
  now?: () => Date;
  /** Whether to make the optional /stock/earnings supplemental call
   *  per newly-reported ticker (default true — recommended by §2). */
  fetchSupplement?: boolean;
  log?: (msg: string) => void;
}

/**
 * Flow A (§2): weekly cron, gated by data not by the calendar.
 *
 * 1. One whole-market /calendar/earnings call over an 8-day window
 *    (1-day overlap vs. the 7-day cadence, so a report slipping
 *    across the run boundary — edge case "Weekend/holiday date
 *    shift", §5 — is never missed; idempotency absorbs the overlap).
 * 2. Filter to the active watchlist AND epsActual !== null (edge
 *    case "Not yet reported": scheduled date alone is unreliable).
 * 3. Skip tickers whose (year, quarter) is already cached — zero
 *    calls for those. For genuinely new quarters, optionally pull
 *    /stock/earnings for fiscal_date_ending + authoritative EPS %,
 *    then upsertQuarter.
 */
export async function runWeeklyIncremental(
  db: Queryable,
  opts: WeeklyIncrementalOptions = {},
): Promise<WeeklyIncrementalReport> {
  const now = opts.now?.() ?? new Date();
  const fetchSupplement = opts.fetchSupplement ?? true;
  const log = opts.log ?? (() => {});

  const windowFrom = daysAgo(8, now);
  const windowTo = isoDate(now);

  const [watchlist, allCalendarRows] = await Promise.all([
    getActiveWatchlist(db),
    fetchCalendarEarnings(windowFrom, windowTo), // whole-market: no symbol filter (§2 step 1)
  ]);
  const activeTickers = new Set(watchlist.map((w) => w.ticker));

  // Edge case "Not yet reported" (§5): epsActual !== null is the
  // definitive "it has reported" signal, not the scheduled date.
  const reported = dedupeCalendarBatch(
    allCalendarRows.filter((r) => activeTickers.has(r.symbol) && r.epsActual !== null),
  );

  const report: WeeklyIncrementalReport = {
    windowFrom,
    windowTo,
    reportedCandidates: reported.length,
    alreadyCached: 0,
    inserted: [],
    supplementFailures: [],
  };

  for (const row of reported) {
    // Existence check BEFORE any per-ticker call (§2 step 2/3): cached
    // quarters cost zero API calls, not just zero DB writes.
    const cachedKeys = await getCachedQuarterKeys(db, row.symbol);
    if (cachedKeys.has(`${row.year}-${row.quarter}`)) {
      report.alreadyCached += 1;
      continue;
    }

    let epsSurprisePercentOverride: number | null | undefined;
    let fiscalDateEnding: string | null | undefined;
    if (fetchSupplement) {
      try {
        const stockEntries = await fetchStockEarnings(row.symbol);
        const match = stockEntries.find((s) => s.year === row.year && s.quarter === row.quarter);
        if (match) {
          epsSurprisePercentOverride = match.surprisePercent;
          fiscalDateEnding = match.period;
        }
      } catch (err) {
        // Optional supplement — a failure here must never block the
        // calendar-sourced insert (§0/§2: /stock/earnings is demoted
        // to enrichment, not a required fetch).
        report.supplementFailures.push(row.symbol);
        log(`[earnings] supplemental /stock/earnings failed for ${row.symbol}: ${String(err)}`);
      }
    }

    const inserted = await upsertQuarter(db, {
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
    });
    if (inserted) report.inserted.push(`${row.symbol}-${row.year}-Q${row.quarter}`);
  }

  return report;
}

/* ── Flow B — backfill on watchlist-add (§2) ────────────────────── */

export interface BackfillReport {
  ticker: string;
  candidates: number;
  inserted: string[];
  supplementFailed: boolean;
}

/**
 * Flow B (§2): seeds trailing history for one ticker so streaks and
 * trailing-4Q averages are computable immediately (§3 depends on
 * >=1 quarter existing; full confidence needs 4 — edge case "< 4
 * quarters of history", §5).
 *
 * 1. /calendar/earnings over a ~460-day window scoped to `symbol`
 *    (~5 trailing quarters with EPS + revenue). Keep epsActual !== null.
 * 2. Optional /stock/earnings for the last 4 quarters' period +
 *    surprisePercent, left-joined onto step 1 by (year, quarter).
 * 3. upsertQuarter for each (ON CONFLICT DO NOTHING).
 */
export async function backfillTicker(
  db: Queryable,
  ticker: string,
  opts: { now?: () => Date; fetchSupplement?: boolean; log?: (msg: string) => void } = {},
): Promise<BackfillReport> {
  const now = opts.now?.() ?? new Date();
  const fetchSupplement = opts.fetchSupplement ?? true;
  const log = opts.log ?? (() => {});

  const from = daysAgo(460, now);
  const to = isoDate(now);

  const calendarRows = dedupeCalendarBatch(
    (await fetchCalendarEarnings(from, to, ticker)).filter((r) => r.epsActual !== null),
  );

  const report: BackfillReport = { ticker, candidates: calendarRows.length, inserted: [], supplementFailed: false };

  let supplementByKey = new Map<string, { period: string; surprisePercent: number | null }>();
  if (fetchSupplement) {
    try {
      const stockEntries = await fetchStockEarnings(ticker);
      supplementByKey = new Map(
        stockEntries.map((s) => [`${s.year}-${s.quarter}`, { period: s.period, surprisePercent: s.surprisePercent }]),
      );
    } catch (err) {
      report.supplementFailed = true;
      log(`[earnings] backfill supplement failed for ${ticker}: ${String(err)}`);
    }
  }

  for (const row of calendarRows) {
    const supplement = supplementByKey.get(`${row.year}-${row.quarter}`);
    const inserted = await upsertQuarter(db, {
      ticker: row.symbol,
      fiscalYear: row.year,
      fiscalQuarter: row.quarter,
      reportDate: row.date,
      reportHour: toReportHour(row.hour),
      epsActual: row.epsActual,
      epsEstimate: row.epsEstimate,
      revenueActual: row.revenueActual,
      revenueEstimate: row.revenueEstimate,
      epsSurprisePercentOverride: supplement?.surprisePercent,
      fiscalDateEnding: supplement?.period,
    });
    if (inserted) report.inserted.push(`${row.symbol}-${row.year}-Q${row.quarter}`);
  }

  return report;
}

export interface BackfillReconcileReport {
  checked: number;
  backfilled: BackfillReport[];
}

/**
 * Nightly reconcile (§2 Flow B: "or as a nightly reconcile for
 * tickers with < 4 cached quarters"). Runs backfillTicker for every
 * active ticker under the threshold, spaced ~1.1s apart per the
 * spec's rate-limit note so a large watchlist never approaches
 * Finnhub's 60/min free-tier cap.
 */
export async function reconcileUnderfilledTickers(
  db: Queryable,
  opts: { minQuarters?: number; now?: () => Date; fetchSupplement?: boolean; log?: (msg: string) => void } = {},
): Promise<BackfillReconcileReport> {
  const minQuarters = opts.minQuarters ?? 4;
  const counts = await getActiveQuarterCounts(db);
  const underfilled = [...counts.entries()].filter(([, count]) => count < minQuarters).map(([ticker]) => ticker);

  const report: BackfillReconcileReport = { checked: underfilled.length, backfilled: [] };
  for (let i = 0; i < underfilled.length; i++) {
    if (i > 0) await sleep(RATE_LIMIT_SPACING_MS); // rate-limit spacing (§2 Flow B)
    report.backfilled.push(await backfillTicker(db, underfilled[i], opts));
  }
  return report;
}
