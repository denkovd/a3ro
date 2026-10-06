import { AUSTRALIA_SERIES } from "../australia/watch";
import type { AustraliaIndicator } from "../australia/types";
import { fetchAbsSeries } from "../sources/abs";
import { recordAustraliaFetchRun, upsertAustraliaObservations } from "../storage/australiaWatchRepo";
import type { Queryable } from "../storage/db";

export interface AustraliaWatchCycleReport { startedAt: string; results: Record<string, { written: number; error?: string }>; }

/** Each series is isolated: a failed fetch records degraded health and never touches valid observations. */
export async function runAustraliaWatchCycle(db: Queryable, opts: { now?: () => Date; fetchImpl?: typeof fetch } = {}): Promise<AustraliaWatchCycleReport> {
  const startedAt = (opts.now ?? (() => new Date()))().toISOString();
  const results: AustraliaWatchCycleReport["results"] = {};
  for (const indicator of Object.keys(AUSTRALIA_SERIES) as AustraliaIndicator[]) {
    try {
      const rows = await fetchAbsSeries(indicator, { fetchImpl: opts.fetchImpl, now: new Date(startedAt) });
      if (!rows.length) throw new Error("ABS returned no valid observations");
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
