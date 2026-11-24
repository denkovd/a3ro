import { AUSTRALIA_INDICATORS, AUSTRALIA_REGISTRY, type AustraliaSourceKind } from "../australia/registry";
import { fetchAbsSeries } from "../sources/abs";
import { createRbaTableLoader, fetchRbaSeries } from "../sources/rba";
import { fetchOecdSeries } from "../sources/oecd";
import { recordAustraliaFetchRun, upsertAustraliaObservations } from "../storage/australiaWatchRepo";
import type { Queryable } from "../storage/db";

export interface AustraliaWatchCycleReport { startedAt: string; results: Record<string, { written: number; error?: string }>; }

/** sdmx.oecd.org throttles back-to-back requests, so OECD series are spaced out rather than fired in a row. */
export const OECD_SPACING_MS = 3_000;
/**
 * Work budget for one cycle. The cron route allows 300s; stopping new work at 240s leaves room for a
 * request already in flight (30s timeout) plus the database writes, so the route always gets to respond.
 */
export const AUSTRALIA_CYCLE_BUDGET_MS = 240_000;
export const BUDGET_SKIP_ERROR = "Skipped: refresh time budget used up";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Each series is isolated: a failed fetch records degraded health and never touches valid observations. */
export async function runAustraliaWatchCycle(db: Queryable, opts: {
  now?: () => Date; fetchImpl?: typeof fetch; oecdRetryDelaysMs?: readonly number[];
  oecdSpacingMs?: number; budgetMs?: number; clock?: () => number;
  /** Only refresh series from these sources (default: all). The Vercel cron leaves out OECD, whose
   *  slow-to-warm queries need longer retry waits than it can afford; a GitHub Actions job fetches
   *  the OECD series instead (#78). */
  sources?: readonly AustraliaSourceKind[];
} = {}): Promise<AustraliaWatchCycleReport> {
  const startedAt = (opts.now ?? (() => new Date()))().toISOString();
  const clock = opts.clock ?? Date.now;
  const deadlineMs = clock() + (opts.budgetMs ?? AUSTRALIA_CYCLE_BUDGET_MS);
  const oecdSpacingMs = opts.oecdSpacingMs ?? OECD_SPACING_MS;
  const results: AustraliaWatchCycleReport["results"] = {};
  // Several RBA indicators share a table (e.g. F2.1); each table is downloaded once per cycle.
  const loadRbaTable = createRbaTableLoader({ fetchImpl: opts.fetchImpl });
  let oecdCalls = 0;
  for (const indicator of AUSTRALIA_INDICATORS) {
    if (opts.sources && !opts.sources.includes(AUSTRALIA_REGISTRY[indicator].source)) continue;
    try {
      if (clock() >= deadlineMs) throw new Error(BUDGET_SKIP_ERROR);
      const source = AUSTRALIA_REGISTRY[indicator].source;
      if (source === "oecd_sdmx" && oecdCalls++ > 0 && oecdSpacingMs > 0) await sleep(oecdSpacingMs);
      const rows = source === "rba_csv"
        ? await fetchRbaSeries(indicator, loadRbaTable, new Date(startedAt))
        : source === "oecd_sdmx"
          ? await fetchOecdSeries(indicator, { fetchImpl: opts.fetchImpl, now: new Date(startedAt), retryDelaysMs: opts.oecdRetryDelaysMs, deadlineMs, clock })
          : await fetchAbsSeries(indicator, { fetchImpl: opts.fetchImpl, now: new Date(startedAt) });
      if (!rows.length) throw new Error(`${source === "rba_csv" ? "RBA" : source === "oecd_sdmx" ? "OECD" : "ABS"} returned no valid observations`);
      const written = await upsertAustraliaObservations(db, rows);
      await recordAustraliaFetchRun(db, indicator, startedAt, "healthy", written, null);
      results[indicator] = { written };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await recordAustraliaFetchRun(db, indicator, startedAt, "degraded", 0, error);
      results[indicator] = { written: 0, error };
    }
  }
  return { startedAt, results };
}
