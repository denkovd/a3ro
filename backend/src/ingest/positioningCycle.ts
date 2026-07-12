/* ────────────────────────────────────────────────────────────────
   Positioning cycle — fetches CFTC managed-money net length (WTI),
   computes the 1-yr percentile stance, and upserts one cot_positioning
   row. Macro Override's positioning half (roadmap P7). Its own cycle,
   separate from the FRED macro cycle, per scores-plan's rule that
   positioning is never folded into macro pressure. Same isolation
   posture: never throws — SourceError captured, unknown wrapped.
   COT is weekly, so most days this upserts the same report_date again
   (idempotent) until the Friday release lands a new one.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { computePositioning } from "../macro/engine";
import { fetchCotPositioning } from "../sources/cftcCot";
import { upsertPositioning } from "../storage/positioningRepo";
import { Queryable } from "../storage/db";

export interface PositioningCycleReport {
  startedAt: string;
  runDate: string;
  reportDate?: string | null;
  netLength?: number | null;
  stance?: string;
  written: number;
  error?: string;
}

export async function runPositioningCycle(
  db: Queryable,
  opts: { now?: () => Date } = {},
): Promise<PositioningCycleReport> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runDate = startedAt.slice(0, 10);

  try {
    const series = await fetchCotPositioning();
    const snap = computePositioning(series.observations, runDate, series.market);
    const written = await upsertPositioning(db, snap);
    return { startedAt, runDate, reportDate: snap.reportDate, netLength: snap.netLength, stance: snap.stance, written };
  } catch (e) {
    if (e instanceof SourceError) {
      return { startedAt, runDate, written: 0, error: `${e.kind}: ${e.message}` };
    }
    const err = new SourceError("cftc-cot", "bad_payload", String(e), { cause: e });
    return { startedAt, runDate, written: 0, error: err.message };
  }
}
