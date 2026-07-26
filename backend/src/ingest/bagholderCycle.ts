/* ────────────────────────────────────────────────────────────────
   Bagholder Risk Map — ingest cycle (P·08). Rescoring is
   timeframe-independent at the layer level (L1–L4 don't change with
   the timeframe tier, only the composite weights do — §3), so one
   pass computes all four layer scores once per narrative and derives
   all three timeframe composites from them, persisting one
   bh_regime_snapshots row per (narrative, timeframe).

   Each narrative is processed in its own try/catch — one bad
   narrative (missing assets, a broken read) can never take down the
   rest of the cycle, same discipline as every other *Cycle in this
   backend (gold/btc/macro).
──────────────────────────────────────────────────────────────── */

import { Queryable } from "../storage/db";
import {
  computeConfidenceScore,
  computeMacroScore,
  computeNarrativeScore,
  computeOpportunityScore,
  computePositioningScore,
  composeScore,
  checkAutoInvalidation,
  nextTriggerState,
  buildTradeObject,
} from "../bagholder/engine";
import { assembleBagholderContext } from "../bagholder/marketContext";
import { BagholderAnalysis, CompositeResult, Timeframe } from "../bagholder/types";
import {
  listActiveNarratives,
  listNarrativeAssets,
  listNarrativeEvents,
  listTriggersForNarrative,
  listRecentRegimeSnapshots,
  upsertRegimeSnapshot,
  updateTriggerState,
  insertTriggerEvent,
  insertTradeObject,
} from "../storage/bagholderRepo";

const TIMEFRAMES: Timeframe[] = ["INTRADAY", "SWING", "MULTI_WEEK"];
const DEFAULT_BENCHMARK = "SPY";

export interface BagholderCycleReport {
  runDate: string;
  narrativesScored: number;
  triggersEvaluated: number;
  transitions: number;
  tradeObjectsEmitted: number;
  errors: { narrativeId: number; message: string }[];
}

export async function runBagholderCycle(db: Queryable): Promise<BagholderCycleReport> {
  const runDate = new Date().toISOString().slice(0, 10);
  const report: BagholderCycleReport = {
    runDate,
    narrativesScored: 0,
    triggersEvaluated: 0,
    transitions: 0,
    tradeObjectsEmitted: 0,
    errors: [],
  };

  const narratives = await listActiveNarratives(db);

  for (const narrative of narratives) {
    try {
      const links = await listNarrativeAssets(db, narrative.id);
      const benchmarkLink = links.find((l) => l.exposureType === "BENCHMARK");
      const benchmarkSymbol = benchmarkLink?.symbol ?? DEFAULT_BENCHMARK;

      const [ctx, events] = await Promise.all([
        assembleBagholderContext(db, links, benchmarkSymbol),
        listNarrativeEvents(db, narrative.id),
      ]);

      const expectedAssetCount = links.filter((l) => l.exposureType !== "BENCHMARK").length;
      const macro = computeMacroScore(ctx.macro, narrative.primaryDirection);
      const narrativeLayer = computeNarrativeScore(narrative, events, ctx.asOf);
      const positioning = computePositioningScore(ctx.positioning, expectedAssetCount);
      const opportunity = computeOpportunityScore(ctx.performance);
      const confidence = computeConfidenceScore([macro.coverage, narrativeLayer.coverage, positioning.coverage, opportunity.coverage]);

      const composites: Record<Timeframe, CompositeResult> = {} as Record<Timeframe, CompositeResult>;
      const aggregateCoverage = {
        available: macro.coverage.available + narrativeLayer.coverage.available + positioning.coverage.available + opportunity.coverage.available,
        total: macro.coverage.total + narrativeLayer.coverage.total + positioning.coverage.total + opportunity.coverage.total,
      };

      for (const timeframe of TIMEFRAMES) {
        const composite = composeScore(macro.score, narrativeLayer.score, positioning.score, opportunity.score, confidence.score, timeframe);
        composites[timeframe] = composite;
        const analysis: BagholderAnalysis = {
          narrativeId: narrative.id,
          timeframe,
          layers: { macro, narrative: narrativeLayer, positioning, opportunity, confidence },
          composite,
          coverage: aggregateCoverage,
          computedAt: new Date().toISOString(),
        };
        await upsertRegimeSnapshot(db, { narrativeId: narrative.id, runDate, timeframe, analysis });
      }
      report.narrativesScored += 1;

      const triggers = await listTriggersForNarrative(db, narrative.id);
      for (const trigger of triggers) {
        if (trigger.state === "INVALIDATED" || trigger.state === "EXPIRED") continue;
        report.triggersEvaluated += 1;
        const composite = composites[trigger.timeframe];
        const transition = nextTriggerState(trigger.state, composite.band, trigger.sustainCycles);

        if (transition.transitioned) {
          await updateTriggerState(db, trigger.id, transition.state, transition.sustainCycles, true);
          await insertTriggerEvent(db, {
            triggerId: trigger.id,
            fromState: trigger.state,
            toState: transition.state,
            reason: transition.reason,
            evidence: [{ compositeFinal: composite.final, band: composite.band, runDate }],
          });
          report.transitions += 1;

          if (transition.state === "LIVE_TRIGGER") {
            const tradeObject = buildTradeObject(
              { ...trigger, state: transition.state },
              narrative,
              { macro: macro.score, narrative: narrativeLayer.score, positioning: positioning.score, opportunity: opportunity.score, confidence: confidence.score },
              composite.final,
            );
            await insertTradeObject(db, trigger.id, tradeObject);
            report.tradeObjectsEmitted += 1;
          }
        } else {
          await updateTriggerState(db, trigger.id, transition.state, transition.sustainCycles, false);
        }

        const recent = await listRecentRegimeSnapshots(db, narrative.id, trigger.timeframe, 3);
        if (checkAutoInvalidation(transition.state, recent.map((r) => r.compositeFinal))) {
          await updateTriggerState(db, trigger.id, "INVALIDATED", 0, true);
          await insertTriggerEvent(db, {
            triggerId: trigger.id,
            fromState: transition.state,
            toState: "INVALIDATED",
            reason: "auto-invalidated: composite_final held below 30 for 3 consecutive cycles — regime shifted underneath the setup (§11)",
            evidence: recent.map((r) => ({ runDate: r.runDate, compositeFinal: r.compositeFinal })),
          });
          report.transitions += 1;
        }
      }
    } catch (e) {
      report.errors.push({ narrativeId: narrative.id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return report;
}
