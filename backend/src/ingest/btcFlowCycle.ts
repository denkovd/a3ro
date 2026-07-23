/* ────────────────────────────────────────────────────────────────
   BTC flow cycle — free SoSoValue US spot ETF flow/AUM API. Single
   source (unlike goldFlowCycle.ts's COMEX+WGC pair), so no dual
   try/catch isolation is needed between sources — just the outer
   never-throw guarantee every cycle in this codebase has.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { fetchSosoValueBtcFlows, sosovalueFlowsToMetrics } from "../sources/sosovalueBtcEtf";
import { upsertBtcFlowMetrics } from "../storage/btcFlowRepo";
import { Queryable } from "../storage/db";

export interface BtcFlowCycleReport {
  startedAt: string;
  runDate: string;
  written: number;
  sosovalue?: { rows: number; latestDate: string | null; latestNetInflowUsd: number | null };
  error?: string;
}

export async function runBtcFlowCycle(
  db: Queryable,
  opts: { now?: () => Date } = {},
): Promise<BtcFlowCycleReport> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runDate = startedAt.slice(0, 10);

  try {
    const rows = await fetchSosoValueBtcFlows();
    const metrics = sosovalueFlowsToMetrics(rows);
    const written = await upsertBtcFlowMetrics(db, metrics);
    const last = rows[rows.length - 1];
    return {
      startedAt,
      runDate,
      written,
      sosovalue: {
        rows: rows.length,
        latestDate: last?.date ?? null,
        latestNetInflowUsd: last?.netInflowUsd ?? null,
      },
    };
  } catch (e) {
    const message = e instanceof SourceError ? `${e.kind}: ${e.message}` : String(e);
    return { startedAt, runDate, written: 0, error: message };
  }
}
