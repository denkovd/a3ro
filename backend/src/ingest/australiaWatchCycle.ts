import { AUSTRALIA_INDICATORS, AUSTRALIA_REGISTRY } from "../australia/registry";
import { fetchAbsSeries } from "../sources/abs";
import { createRbaTableLoader, fetchRbaSeries } from "../sources/rba";
import { fetchOecdSeries } from "../sources/oecd";
import { recordAustraliaFetchRun, upsertAustraliaObservations } from "../storage/australiaWatchRepo";
import type { Queryable } from "../storage/db";

export interface AustraliaWatchCycleReport { startedAt: string; results: Record<string, { written: number; error?: string }>; }

/** Each series is isolated: a failed fetch records degraded health and never touches valid observations. */
export async function runAustraliaWatchCycle(db: Queryable, opts: { now?: () => Date; fetchImpl?: typeof fetch } = {}): Promise<AustraliaWatchCycleReport> {
  const startedAt = (opts.now ?? (() => new Date()))().toISOString();
  const results: AustraliaWatchCycleReport["results"] = {};
  // Several RBA indicators share a table (e.g. F2.1); each table is downloaded once per cycle.
  const loadRbaTable = createRbaTableLoader({ fetchImpl: opts.fetchImpl });
  for (const indicator of AUSTRALIA_INDICATORS) {
    try {
      const source = AUSTRALIA_REGISTRY[indicator].source;
      const rows = source === "rba_csv"
        ? await fetchRbaSeries(indicator, loadRbaTable, new Date(startedAt))
        : source === "oecd_sdmx"
          ? await fetchOecdSeries(indicator, { fetchImpl: opts.fetchImpl, now: new Date(startedAt) })
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
