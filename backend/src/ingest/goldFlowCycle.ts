/* ────────────────────────────────────────────────────────────────
   Gold stock/flow cycle — free COMEX warehouse stocks + WGC ETF
   holdings/flows. Isolated: failures never throw to the caller;
   each source is independent so one outage cannot block the other.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import {
  comexReadingToMetrics,
  fetchComexGoldStocks,
} from "../sources/comexGoldStocks";
import {
  fetchWgcEtfHoldings,
  wgcHoldingsToMetrics,
} from "../sources/wgcEtf";
import { upsertGoldFlowMetrics } from "../storage/goldFlowRepo";
import { Queryable } from "../storage/db";

export interface GoldFlowCycleReport {
  startedAt: string;
  runDate: string;
  written: number;
  comex?: { reportDate: string; registeredToz: number; eligibleToz: number };
  comexError?: string;
  wgc?: { points: number; latestDate: string | null; naHoldingsT: number | null };
  wgcError?: string;
  error?: string;
}

export async function runGoldFlowCycle(
  db: Queryable,
  opts: { now?: () => Date } = {},
): Promise<GoldFlowCycleReport> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runDate = startedAt.slice(0, 10);
  let written = 0;
  const report: GoldFlowCycleReport = { startedAt, runDate, written: 0 };

  try {
    // COMEX — daily warehouse stocks
    try {
      const reading = await fetchComexGoldStocks();
      const n = await upsertGoldFlowMetrics(db, comexReadingToMetrics(reading));
      written += n;
      report.comex = {
        reportDate: reading.reportDate,
        registeredToz: reading.registeredToz,
        eligibleToz: reading.eligibleToz,
      };
    } catch (e) {
      report.comexError =
        e instanceof SourceError ? `${e.kind}: ${e.message}` : String(e);
    }

    // WGC — weekly ETF holdings (full history upsert is cheap JSON)
    try {
      const points = await fetchWgcEtfHoldings();
      const n = await upsertGoldFlowMetrics(db, wgcHoldingsToMetrics(points));
      written += n;
      const last = points[points.length - 1];
      report.wgc = {
        points: points.length,
        latestDate: last?.date ?? null,
        naHoldingsT: last?.northAmericaT ?? null,
      };
    } catch (e) {
      report.wgcError =
        e instanceof SourceError ? `${e.kind}: ${e.message}` : String(e);
    }

    report.written = written;
    if (report.comexError && report.wgcError) {
      report.error = `both sources failed: comex=${report.comexError}; wgc=${report.wgcError}`;
    }
    return report;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    report.written = written;
    return report;
  }
}
