/* ────────────────────────────────────────────────────────────────
   Bagholder Risk Map — pure scoring engine (P·08). No IO — every
   function here takes already-assembled context and returns
   deterministic, additive, auditable scores (architecture doc §2/§3).

   House rule, same as Thesis Lab/macro engines: every subscore is a
   SUM of named, capped contributions — no black-box weighting inside
   a subscore, and every layer reports its own coverage so a
   thin-data layer is flagged, never silently averaged away.
──────────────────────────────────────────────────────────────── */

import {
  AssetPerformanceRead,
  AssetPositioningRead,
  BagholderContext,
  CompositeBand,
  CompositeResult,
  LayerScore,
  Narrative,
  NarrativeEvent,
  ScoreComponent,
  Timeframe,
  Trigger,
  TriggerStateId,
  TradeObject,
} from "./types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ── §3 weights by timeframe ──────────────────────────────────── */

export const WEIGHTS_BY_TIMEFRAME: Record<Timeframe, { wM: number; wN: number; wP: number; wO: number }> = {
  INTRADAY: { wM: 0.10, wN: 0.35, wP: 0.35, wO: 0.20 },
  SWING: { wM: 0.20, wN: 0.25, wP: 0.30, wO: 0.25 },
  MULTI_WEEK: { wM: 0.35, wN: 0.15, wP: 0.20, wO: 0.30 },
};

/** Confidence-pre-backtest fixed prior (§3: "starts at a conservative
 *  fixed prior pre-backtest"). Graduates to a backtest-derived base
 *  rate once ≥15-20 resolved triggers exist per taxonomy (§12) — not
 *  implemented yet; V1 ships the honest fixed prior. */
export const CONFIDENCE_PRIOR = 0.65;

/* ── L1 — macro regime ─────────────────────────────────────────── */

const RISK_ON_QUADRANTS = new Set(["GOLDILOCKS", "REFLATION"]);
const RISK_OFF_QUADRANTS = new Set(["INFLATION", "DEFLATION"]);

export function computeMacroScore(macro: BagholderContext["macro"], narrativeDirection: Narrative["primaryDirection"]): LayerScore {
  const components: ScoreComponent[] = [];
  let score = 50;
  components.push({ key: "base", label: "Base", effect: 0, detail: "every narrative starts macro-neutral at 50" });

  if (!macro || macro.quadrant === "PENDING") {
    components.push({ key: "no_data", label: "Regime", effect: 0, detail: "no live macro snapshot — held at neutral base" });
    return { score, coverage: { available: 0, total: 2 }, components };
  }

  const dirSign = narrativeDirection === "bullish" ? 1 : narrativeDirection === "bearish" ? -1 : 0;
  let available = 1;

  if (dirSign !== 0) {
    const riskOn = RISK_ON_QUADRANTS.has(macro.quadrant);
    const riskOff = RISK_OFF_QUADRANTS.has(macro.quadrant);
    const aligned = (dirSign === 1 && riskOn) || (dirSign === -1 && riskOff);
    const opposed = (dirSign === 1 && riskOff) || (dirSign === -1 && riskOn);
    const effect = aligned ? 20 : opposed ? -15 : 0;
    score += effect;
    components.push({
      key: "regime_alignment",
      label: "Regime alignment",
      effect,
      detail: `${macro.quadrant} regime vs ${narrativeDirection} narrative — ${aligned ? "supportive" : opposed ? "hostile" : "neutral"}`,
    });
  } else {
    components.push({ key: "mixed_direction", label: "Regime alignment", effect: 0, detail: "mixed-direction narrative — regime cannot confirm or oppose a single side" });
  }

  if (macro.pressureScore !== null) {
    available += 1;
    const effect = round(((macro.pressureScore - 50) / 50) * 15 * dirSign);
    score += effect;
    components.push({
      key: "pressure",
      label: "Macro pressure",
      effect,
      detail: `pressure ${macro.pressureScore}/100 scaled to ${narrativeDirection} exposure`,
    });
  } else {
    components.push({ key: "pressure_no_data", label: "Macro pressure", effect: 0, detail: "no pressure read this cycle" });
  }

  return { score: round(clamp(score, 0, 100)), coverage: { available, total: 2 }, components };
}

/* ── L2 — narrative shock / exhaustion ────────────────────────── */

/** Higher = MORE exhausted (stale, contested, echoed) — this is the
 *  score that routes toward Late-Narrative-Fade / Structural-Cyclical
 *  taxonomies per §4/§10, not a "how good is this narrative" score. */
export function computeNarrativeScore(narrative: Narrative, events: NarrativeEvent[], asOf: string): LayerScore {
  const components: ScoreComponent[] = [];
  let score = 25;
  components.push({ key: "base", label: "Base", effect: 0, detail: "every fresh narrative starts at 25 exhaustion — staleness/dispersion is earned" });

  const daysSince = Math.max(0, (new Date(asOf).getTime() - new Date(narrative.firstSeenAt).getTime()) / 86_400_000);
  const stalenessEffect = round(clamp(daysSince / 3, 0, 45));
  score += stalenessEffect;
  components.push({
    key: "staleness",
    label: "Staleness",
    effect: stalenessEffect,
    detail: `${Math.round(daysSince)}d since first documented appearance (${narrative.firstSeenAt.slice(0, 10)}), not the latest post's date`,
  });

  if (events.length === 0) {
    components.push({ key: "no_events", label: "Reply corpus", effect: 0, detail: "no linked events — dispersion/repetition unmeasured" });
    return { score: round(clamp(score, 0, 100)), coverage: { available: 1, total: 4 }, components };
  }

  const totalReplies = events.reduce((a, e) => a + e.replyAgree + e.replyDisagree + e.replyReframe, 0);
  let available = 2;
  if (totalReplies > 0) {
    available += 1;
    const disagreeRatio = events.reduce((a, e) => a + e.replyDisagree + e.replyReframe, 0) / totalReplies;
    const dispersionEffect = round(disagreeRatio * 25);
    score += dispersionEffect;
    components.push({
      key: "dispersion",
      label: "Reply dispersion",
      effect: dispersionEffect,
      detail: `${Math.round(disagreeRatio * 100)}% of ${totalReplies} tagged replies are disagree/reframe — "old news"/"affects X not Y" reads as contested, not confirmed`,
    });
  } else {
    components.push({ key: "dispersion_no_data", label: "Reply dispersion", effect: 0, detail: "no tagged replies yet" });
  }

  const distinctAuthors = new Set(events.map((e) => e.author).filter(Boolean)).size;
  const repetitionEffect = round(clamp((distinctAuthors - 1) * 5, 0, 20));
  score += repetitionEffect;
  components.push({
    key: "repetition",
    label: "Repetition",
    effect: repetitionEffect,
    detail: `${distinctAuthors} independent source(s) making this claim in the tracked window`,
  });

  available += 1;
  const hedgeCount = events.filter((e) => e.hedgeDetected).length;
  const hedgeEffect = hedgeCount > 0 ? round(-5 * (hedgeCount / events.length)) : 0;
  score += hedgeEffect;
  components.push({
    key: "hedge_language",
    label: "Hedge language",
    effect: hedgeEffect,
    detail: hedgeCount > 0 ? `${hedgeCount}/${events.length} events hedge — lower originator conviction, cuts both ways` : "no hedging detected in the linked events",
  });

  return { score: round(clamp(score, 0, 100)), coverage: { available, total: 4 }, components };
}

/* ── L3 — positioning / pain ──────────────────────────────────── */

export function computePositioningScore(positioning: AssetPositioningRead[], expectedAssetCount: number): LayerScore {
  const components: ScoreComponent[] = [];
  let score = 20;
  components.push({ key: "base", label: "Base", effect: 0, detail: "no crowding assumed until positioning data says otherwise" });

  if (positioning.length === 0) {
    components.push({ key: "no_data", label: "Positioning", effect: 0, detail: "no positioning indicators live for the implicated assets — this is V1's expected-weakest layer (§6)" });
    return { score, coverage: { available: 0, total: Math.max(expectedAssetCount, 1) }, components };
  }

  let sumEffect = 0;
  for (const p of positioning) {
    if (p.percentile1y !== null) {
      const effect = round(p.percentile1y * 40);
      sumEffect += effect;
      components.push({
        key: `pctile_${p.symbol}_${p.indicatorType}`,
        label: `${p.symbol} ${p.indicatorType} percentile`,
        effect,
        detail: `${Math.round(p.percentile1y * 100)}th pctile (1y) — distance from trailing extreme`,
      });
    }
    if (p.stance === "CROWDED_LONG" || p.stance === "CROWDED_SHORT") {
      sumEffect += 10;
      components.push({
        key: `stance_${p.symbol}_${p.indicatorType}`,
        label: `${p.symbol} stance`,
        effect: 10,
        detail: `${p.indicatorType} reads ${p.stance.replace("_", " ").toLowerCase()}`,
      });
    }
  }
  score += sumEffect / Math.max(positioning.length, 1);

  return {
    score: round(clamp(score, 0, 100)),
    coverage: { available: positioning.length, total: Math.max(expectedAssetCount, positioning.length, 1) },
    components,
  };
}

/* ── L4 — relative performance / opportunity ─────────────────── */

const SWING_SIGMA_DAYS = 21;

export function computeOpportunityScore(performance: AssetPerformanceRead[]): LayerScore {
  const components: ScoreComponent[] = [];
  let score = 15;
  components.push({ key: "base", label: "Base", effect: 0, detail: "opportunity starts low — a real edge has to be large relative to noise, not just directionally plausible" });

  if (performance.length === 0) {
    components.push({ key: "no_data", label: "Relative performance", effect: 0, detail: "no price series available for the implicated assets" });
    return { score, coverage: { available: 0, total: 1 }, components };
  }

  let available = 0;
  let sumEffect = 0;
  for (const p of performance) {
    if (p.rsVsBenchmark === null || p.realizedDailySigma === null || p.realizedDailySigma <= 0) {
      components.push({ key: `${p.symbol}_no_data`, label: `${p.symbol} vol-adjusted gap`, effect: 0, detail: "RS or realized vol unavailable" });
      continue;
    }
    available += 1;
    const horizonSigma = p.realizedDailySigma * Math.sqrt(SWING_SIGMA_DAYS);
    const sigmaMove = Math.abs(p.rsVsBenchmark) / horizonSigma;
    const effect = round(clamp(sigmaMove * 12, 0, 40));
    sumEffect += effect;
    components.push({
      key: `${p.symbol}_gap`,
      label: `${p.symbol} unresolved gap`,
      effect,
      detail: `RS ${round(p.rsVsBenchmark * 100)}% vs benchmark ≈ ${round(sigmaMove)}σ over a ${SWING_SIGMA_DAYS}d window`,
    });
  }
  score += available > 0 ? sumEffect / available : 0;

  return { score: round(clamp(score, 0, 100)), coverage: { available, total: performance.length }, components };
}

/* ── confidence ────────────────────────────────────────────────── */

export function computeConfidenceScore(layerCoverages: { available: number; total: number }[]): LayerScore {
  const totalAvailable = layerCoverages.reduce((a, c) => a + c.available, 0);
  const totalPossible = layerCoverages.reduce((a, c) => a + c.total, 0);
  const coverageRatio = totalPossible > 0 ? totalAvailable / totalPossible : 0;
  const score = round(clamp(coverageRatio * 100 * CONFIDENCE_PRIOR, 0, 100));
  const components: ScoreComponent[] = [
    {
      key: "coverage",
      label: "Data coverage",
      effect: round(coverageRatio * 100),
      detail: `${totalAvailable}/${totalPossible} live inputs across L1–L4 this cycle`,
    },
    {
      key: "prebacktest_prior",
      label: "Pre-backtest prior",
      effect: round(coverageRatio * 100 * CONFIDENCE_PRIOR) - round(coverageRatio * 100),
      detail: `×${CONFIDENCE_PRIOR} fixed conservative prior — no trigger history yet to derive a base rate from (§3, §12)`,
    },
  ];
  return { score, coverage: { available: totalAvailable, total: totalPossible }, components };
}

/* ── composite (§3) ────────────────────────────────────────────── */

export function bandFor(compositeFinal: number): CompositeBand {
  if (compositeFinal >= 75) return "live_trigger";
  if (compositeFinal >= 60) return "setup_forming";
  if (compositeFinal >= 40) return "watchlist";
  return "no_trade";
}

export function composeScore(
  M: number,
  N: number,
  P: number,
  O: number,
  C: number,
  timeframe: Timeframe,
): CompositeResult {
  const w = WEIGHTS_BY_TIMEFRAME[timeframe];
  const raw = round(w.wM * M + w.wN * N + w.wP * P + w.wO * O);
  const confidenceMultiplier = round(0.5 + 0.5 * (C / 100));
  const final = round(raw * confidenceMultiplier);
  return { raw, final, band: bandFor(final), confidenceMultiplier };
}

/* ── trigger state machine (§3 hysteresis, §8 alert transitions) ──
   Upgrades (WATCHLIST → SETUP_FORMING → LIVE_TRIGGER) require the
   qualifying band to hold for 2 consecutive scoring cycles — the
   hysteresis buffer the architecture doc calls for explicitly, to
   avoid flapping on a single noisy print. Downgrades apply
   immediately: a trigger losing its edge should reflect that on the
   very next cycle, not linger at a stale, higher-conviction state. */

const STATE_RANK: Record<TriggerStateId, number> = {
  WATCHLIST: 1,
  SETUP_FORMING: 2,
  LIVE_TRIGGER: 3,
  INVALIDATED: -1,
  EXPIRED: -1,
};
const BAND_RANK: Record<CompositeBand, number> = { no_trade: 0, watchlist: 1, setup_forming: 2, live_trigger: 3 };

export interface TriggerTransition {
  state: TriggerStateId;
  sustainCycles: number;
  transitioned: boolean;
  reason: string;
}

export function nextTriggerState(current: TriggerStateId, band: CompositeBand, sustainCycles: number): TriggerTransition {
  if (current === "INVALIDATED" || current === "EXPIRED") {
    return { state: current, sustainCycles: 0, transitioned: false, reason: "terminal state — no further scoring transitions" };
  }

  const currentRank = STATE_RANK[current];
  const bandRank = BAND_RANK[band];
  // Highest state rank (1..3) the current band alone justifies.
  const justifiedRank = Math.min(Math.max(bandRank, 1), 3);

  // Downgrade — immediate, no hysteresis needed to shed conviction.
  if (justifiedRank < currentRank) {
    const floor: TriggerStateId = justifiedRank === 2 ? "SETUP_FORMING" : "WATCHLIST";
    return { state: floor, sustainCycles: 0, transitioned: true, reason: `composite dropped to ${band} band — downgraded from ${current}` };
  }

  // Already at what the band justifies — hold, tracking live-trigger
  // duration for the post-trigger-drift read (§8), reset otherwise.
  if (justifiedRank === currentRank) {
    const sustained = band === "live_trigger" ? sustainCycles + 1 : 0;
    return { state: current, sustainCycles: sustained, transitioned: false, reason: `composite in ${band} band — holding at ${current}` };
  }

  // Upgrade attempt — requires 2 consecutive cycles at the qualifying
  // band, and moves at most one rank per pair of cycles (WATCHLIST →
  // SETUP_FORMING → LIVE_TRIGGER are separate hysteresis gates, §3/§8).
  const newSustain = sustainCycles + 1;
  if (newSustain < 2) {
    return { state: current, sustainCycles: newSustain, transitioned: false, reason: `composite in ${band} band, ${newSustain}/2 cycles sustained before upgrading past ${current}` };
  }
  const nextRank = Math.min(justifiedRank, currentRank + 1);
  const nextState: TriggerStateId = nextRank === 3 ? "LIVE_TRIGGER" : "SETUP_FORMING";
  return { state: nextState, sustainCycles: newSustain, transitioned: true, reason: `composite in ${band} band sustained 2 consecutive cycles — upgraded to ${nextState}` };
}

/** Deterministic decay proxy for "regime shifts" risk (§11): a trigger
 *  sitting above WATCHLIST whose last 3 composite_final reads are all
 *  below the no-trade ceiling has lost its own edge — auto-invalidate
 *  rather than let it drift indefinitely at a stale conviction level. */
export function checkAutoInvalidation(state: TriggerStateId, recentComposites: number[]): boolean {
  if (state !== "LIVE_TRIGGER" && state !== "SETUP_FORMING") return false;
  if (recentComposites.length < 3) return false;
  return recentComposites.slice(0, 3).every((c) => c < 30);
}

/* ── trade object (§9) ────────────────────────────────────────── */

export function buildTradeObject(trigger: Trigger, narrative: Narrative, scores: { macro: number; narrative: number; positioning: number; opportunity: number; confidence: number }, compositeFinal: number): TradeObject {
  return {
    triggerId: trigger.id,
    setupName: `${trigger.taxonomy.replace(/_/g, " ")} — ${narrative.headline}`,
    taxonomy: trigger.taxonomy,
    direction: trigger.direction ?? "no_trade",
    targetAssets: trigger.primarySymbol ? [trigger.primarySymbol] : [],
    legs: trigger.primarySymbol && trigger.direction && (trigger.direction === "long" || trigger.direction === "short")
      ? [{ symbol: trigger.primarySymbol, side: trigger.direction, weight: 1.0 }]
      : [],
    timeframe: trigger.timeframe,
    entryLogic: trigger.triggerCondition,
    invalidation: trigger.invalidation,
    scores,
    compositeFinal,
    confidence: scores.confidence,
    bagholderSide: `cohort anchored to "${narrative.headline}"`,
    notes: `Auto-emitted on LIVE_TRIGGER — sizing is a human decision, this module scores setups only.`,
    createdAt: new Date().toISOString(),
  };
}
