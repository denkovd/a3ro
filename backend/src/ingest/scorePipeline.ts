/* ────────────────────────────────────────────────────────────────
   Score cycle — sibling to corridorPipeline.ts / regime pipeline, for
   the composite-score domain. Runs from the same daily cron, AFTER
   price/corridor/regime/baseline ingestion, because scores are
   computed FROM data those cycles just wrote (the cron wraps this in
   its own try/catch so a score failure can never touch ingestion).

   Per-score isolation: each score is computed in its own try/catch so
   one failing (e.g. a series read erroring) records an error in the
   report and the others still compute + persist.

   Live scores: brent_wti_spread (primitive, from daily_prices),
   flow_stress (Phase 1 composite — throughput deviation + export
   strength + regional stock draw + spread) and tightness (Phase 2 —
   inventories vs 5-yr seasonal band + utilization; crack pending).
   This cycle runs AFTER corridor/seasonal ingestion in the cron, so
   the rows it reads are at most one cycle old. Macro Override joins
   this loop as its legs come online (docs/scores-plan.md Phase 3).
──────────────────────────────────────────────────────────────── */

import { ScoreComponent, ScoreSnapshot } from "../core/scoreTypes";
import {
  computeCrackLeg,
  computeExportStrengthLeg,
  computeFlowStress,
  computeSeasonalTightnessLeg,
  computeSpreadSignal,
  computeStockDrawLeg,
  computeThroughputDeviationLeg,
  computeTapeStance,
  computeTightness,
  computeUtilizationLeg,
  GateThroughput,
  PricePoint,
  spreadLegFrom,
  StockLevel,
} from "../scores/engine";
import { Queryable } from "../storage/db";
import { getBaselines } from "../storage/baselineRepo";
import { getCorridorMetricSeries, getLatestCorridorMetrics } from "../storage/corridorRepo";
import { getDailySeries } from "../storage/priceRepo";
import { getSeasonalBaselines } from "../storage/seasonalRepo";
import { upsertScoreSnapshots } from "../storage/scoreRepo";
import { getLatestMacroSnapshot } from "../storage/macroRepo";
import { getLatestPositioning } from "../storage/positioningRepo";
import { upsertTapeSnapshot } from "../storage/tapeRepo";

/** How far back to pull closes — comfortably over the spread's 60-session
 *  window, allowing for weekends/holidays inside a calendar range. */
const LOOKBACK_DAYS = 180;

/** Export-strength percentile window — history accumulates weekly, so a
 *  wide bound just means "use everything on file" for the first year. */
const EXPORTS_LOOKBACK_DAYS = 400;

/** Stock-draw window — needs the 4-week delta plus slack for gaps. */
const STOCKS_LOOKBACK_DAYS = 90;

/** PortWatch gate corridors read by the throughput-deviation leg. */
const GATE_CORRIDORS = ["hormuz", "singapore", "suez", "bab_el_mandeb", "cape", "panama"];

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
  let spreadSnapshot: ScoreSnapshot | null = null;

  // ── brent_wti_spread ──
  try {
    const [wti, brent] = await Promise.all([
      getDailySeries(db, "WTI", from, to),
      getDailySeries(db, "BRENT", from, to),
    ]);
    const toPoints = (rows: { periodDate: string; price: number }[]): PricePoint[] =>
      rows.map((r) => ({ date: r.periodDate, value: r.price }));
    const spread = computeSpreadSignal(toPoints(wti), toPoints(brent), runDate);
    spreadSnapshot = spread;
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

  // ── flow_stress ── (own try/catch: a leg-read failure must never
  // touch the spread snapshot already computed above)
  try {
    const stocksFrom = new Date(started.getTime() - STOCKS_LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const exportsFrom = new Date(started.getTime() - EXPORTS_LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const [exportsHist, usStocks, cushingStocks, latestMetrics, baselines] = await Promise.all([
      getCorridorMetricSeries(db, "usgulf", "crude_exports", exportsFrom, to),
      getCorridorMetricSeries(db, "usgulf", "us_crude_stocks", stocksFrom, to),
      getCorridorMetricSeries(db, "usgulf", "cushing_stocks", stocksFrom, to),
      getLatestCorridorMetrics(db),
      getBaselines(db),
    ]);

    const toPts = (rows: { periodDate: string; value: number }[]): PricePoint[] =>
      rows.map((r) => ({ date: r.periodDate, value: r.value }));

    const gates: GateThroughput[] = [];
    for (const corridor of GATE_CORRIDORS) {
      const vol = latestMetrics.find(
        (m) => m.corridor === corridor && m.metric === "tanker_volume_7d",
      );
      const band = baselines.find(
        (b) => b.corridor === corridor && b.metric === "tanker_volume" && b.win === "1y",
      );
      if (!vol || !band) continue;
      gates.push({ corridor, current: vol.value, mean: band.meanValue, p10: band.p10 });
    }

    const legs: ScoreComponent[] = [
      computeThroughputDeviationLeg(gates),
      computeExportStrengthLeg(toPts(exportsHist)),
      computeStockDrawLeg(toPts(usStocks), toPts(cushingStocks)),
      spreadLegFrom(spreadSnapshot),
    ];

    const flowStress = computeFlowStress(runDate, legs);
    snapshots.push(flowStress);
    report.computed.push({
      scoreId: flowStress.scoreId,
      ok: true,
      score: flowStress.score,
      status: flowStress.status,
      coverage: `${flowStress.coverage.available}/${flowStress.coverage.total}`,
    });
  } catch (e) {
    report.computed.push({
      scoreId: "flow_stress",
      ok: false,
      score: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── tightness ── (own try/catch + its own DB reads: full per-score
  // isolation, even at the cost of re-reading latest metrics — one
  // cheap query vs. a shared failure domain)
  try {
    const [latestMetrics, seasonal] = await Promise.all([
      getLatestCorridorMetrics(db),
      getSeasonalBaselines(db),
    ]);
    const usgulf = latestMetrics.filter((m) => m.corridor === "usgulf");

    const levels: StockLevel[] = usgulf
      .filter((m) => m.unit === "Mbbl")
      .map((m) => ({ metric: m.metric, value: m.value, asOf: m.periodDate }));

    // Prefer the US-total utilization series; fall back to PADD 3,
    // never silently — the leg's note carries which one it read.
    const usUtil = usgulf.find((m) => m.metric === "us_refinery_utilization");
    const padd3Util = usgulf.find((m) => m.metric === "refinery_utilization");
    const util = usUtil
      ? { value: usUtil.value, asOf: usUtil.periodDate, series: "US" as const }
      : padd3Util
        ? { value: padd3Util.value, asOf: padd3Util.periodDate, series: "PADD 3" as const }
        : null;

    // Crack 3:2:1 — EIA spot products + WTI, all $/bbl, same source so
    // dates align (sources/eiaSpotProducts.ts). asOf = the products'
    // date (gasoline), the newer-lagging of the three in practice.
    const gasolineSpot = usgulf.find((m) => m.metric === "gasoline_spot");
    const heatingOilSpot = usgulf.find((m) => m.metric === "heating_oil_spot");
    const wtiSpot = usgulf.find((m) => m.metric === "wti_spot");

    const legs: ScoreComponent[] = [
      computeSeasonalTightnessLeg(levels, seasonal, runDate),
      computeUtilizationLeg(util),
      computeCrackLeg({
        gasoline: gasolineSpot ? gasolineSpot.value : null,
        heatingOil: heatingOilSpot ? heatingOilSpot.value : null,
        wti: wtiSpot ? wtiSpot.value : null,
        asOf: gasolineSpot ? gasolineSpot.periodDate : null,
      }),
    ];

    const tightness = computeTightness(runDate, legs);
    snapshots.push(tightness);
    report.computed.push({
      scoreId: tightness.scoreId,
      ok: true,
      score: tightness.score,
      status: tightness.status,
      coverage: `${tightness.coverage.available}/${tightness.coverage.total}`,
    });
  } catch (e) {
    report.computed.push({
      scoreId: "tightness",
      ok: false,
      score: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── tape ── (headline synthesis; own try/catch + own table). Rolls
  // the three composites this run computed (flow_stress + tightness,
  // just above) plus Macro Override (macro_snapshots, written by the
  // macro cycle earlier in the cron) into one stance.
  try {
    const flowStressScore = snapshots.find((s) => s.scoreId === "flow_stress")?.score ?? null;
    const tightnessScore = snapshots.find((s) => s.scoreId === "tightness")?.score ?? null;
    const [macroRow, posRow] = await Promise.all([
      getLatestMacroSnapshot(db),
      getLatestPositioning(db),
    ]);
    const tape = computeTapeStance(runDate, {
      flowStress: flowStressScore,
      tightness: tightnessScore,
      macroPressure: macroRow?.pressureScore ?? null,
      macroDiverging: macroRow?.diverging ?? false,
      positioningStance: posRow?.stance ?? null,
    });
    await upsertTapeSnapshot(db, tape);
    report.computed.push({
      scoreId: "tape",
      ok: true,
      score: null,
      status: tape.stance,
      coverage: `${tape.coverage.available}/${tape.coverage.total}`,
    });
  } catch (e) {
    report.computed.push({
      scoreId: "tape",
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
