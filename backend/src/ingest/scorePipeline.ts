/* ────────────────────────────────────────────────────────────────
   Score cycle — sibling to corridorPipeline.ts / regime pipeline, for
   the composite-score domain. Runs from the same daily cron, AFTER
   price/corridor/regime/baseline ingestion, because scores are
   computed FROM data those cycles just wrote (the cron wraps this in
   its own try/catch so a score failure can never touch ingestion).

   Per-score isolation: each score is computed in its own try/catch so
   one failing (e.g. a series read erroring) records an error in the
   report and the others still compute + persist.

   Phase 1 (this pass): the Brent–WTI spread signal, read from
   daily_prices. Flow Stress / Tightness / Macro Override join this
   loop as their input legs come online — see docs/scores-plan.md.
──────────────────────────────────────────────────────────────── */

import { ScoreSnapshot } from "../core/scoreTypes";
import { computeSpreadSignal, PricePoint } from "../scores/engine";
import { Queryable } from "../storage/db";
import { getDailySeries } from "../storage/priceRepo";
import { upsertScoreSnapshots } from "../storage/scoreRepo";

/** How far back to pull closes — comfortably over the spread's 60-session
 *  window, allowing for weekends/holidays inside a calendar range. */
const LOOKBACK_DAYS = 180;

export interface ScoreCycleReport {
  startedAt: string;
  runDate: string;
  computed: {
    scoreId: string;
    ok: boolean;
    score: number | null;
    status?: string;
    coverage?: string; // "available/total"
    error?: string;
  }[];
  written: number;
}

export async function runScoreCycle(
  db: Queryable,
  opts: { now?: () => Date } = {},
): Promise<ScoreCycleReport> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runDate = startedAt.slice(0, 10);
  const to = runDate;
  const from = new Date(started.getTime() - LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const report: ScoreCycleReport = { startedAt, runDate, computed: [], written: 0 };
  const snapshots: ScoreSnapshot[] = [];

  // ── brent_wti_spread ──
  try {
    const [wti, brent] = await Promise.all([
      getDailySeries(db, "WTI", from, to),
      getDailySeries(db, "BRENT", from, to),
    ]);
    const toPoints = (rows: { periodDate: string; price: number }[]): PricePoint[] =>
      rows.map((r) => ({ date: r.periodDate, value: r.price }));
    const spread = computeSpreadSignal(toPoints(wti), toPoints(brent), runDate);
    snapshots.push(spread);
    report.computed.push({
      scoreId: spread.scoreId,
      ok: true,
      score: spread.score,
      status: spread.status,
      coverage: `${spread.coverage.available}/${spread.coverage.total}`,
    });
  } catch (e) {
    report.computed.push({
      scoreId: "brent_wti_spread",
      ok: false,
      score: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (snapshots.length > 0) {
    report.written = await upsertScoreSnapshots(db, snapshots);
  }
  return report;
}
