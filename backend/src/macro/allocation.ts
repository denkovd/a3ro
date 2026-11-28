/* ────────────────────────────────────────────────────────────────
   Three-sleeve allocation — the KISS expression layer.

   The framework's KISS portfolio is a simple systematic allocation across
   stocks, gold and Bitcoin, with top-down exposure driven by the
   Global Macro Risk Matrix and bottom-up exposure adjusted by VAMS.
   This is that, with hard caps: stocks 60%, gold 30%, Bitcoin 10%,
   cash absorbing whatever is left.

   WHY THIS EXISTS: it gives the regime read a scoreboard. "Is
   Reflation the right label" is not directly falsifiable; "did this
   allocation beat buy-and-hold on a drawdown-adjusted basis" is. The
   matrix stays a 30-asset signal — narrowing IT to three would gut it,
   since the regime information lives in copper, the curve, credit and
   FX, while stocks/gold/BTC are mostly the regime's *output*. Three
   assets is the right size for the expression, not the signal.

   THE RULE, per sleeve:

       weight = cap × regimeScore × vamsMultiplier × cycleDrag

   - regimeScore  how much the CURRENT regime favours this sleeve
   - vamsMultiplier   whether the sleeve is actually trending
                      (stocks and Bitcoin only — gold is untimed, ×1)
   - cycleDrag    how many of the six cycles are fighting risk assets

   Caps sum to 1.0 and every multiplier is ≤ 1, so total exposure can
   never exceed 100% and cash is always the remainder — no leverage, no
   normalisation step that could quietly rescale a defensive reading
   back up to fully invested. (0.6 + 0.3 + 0.1 is 0.9999999999999999 in
   IEEE754; `invested` is rounded to 4dp before cash is derived from
   it, so the residue never reaches a weight.)

   Pure, no IO. Nothing here is advice; it is a backtestable rule.
──────────────────────────────────────────────────────────────── */

import { MacroQuadrant } from "./types";
import { VamsState } from "./vams";

export type Quadrant = Exclude<MacroQuadrant, "PENDING">;
export type SleeveKey = "stocks" | "gold" | "bitcoin";
/** "macro" is the live rule (regime × trend × cycle drag). "trend" is research-only: each asset's
 *  own trend sizes it (bullish full cap, neutral half, bearish or no signal zero), no regime or cycles. */
export type AllocationModel = "trend" | "macro";

export interface Sleeve {
  key: SleeveKey;
  label: string;
  symbol: string;
  cap: number;
}

/** Caps as specified: 60 / 30 / 10, summing to exactly 1.0. */
export const SLEEVES: Sleeve[] = [
  { key: "stocks", label: "S&P 500", symbol: "^GSPC", cap: 0.6 },
  { key: "gold", label: "Gold", symbol: "GC=F", cap: 0.3 },
  { key: "bitcoin", label: "Bitcoin", symbol: "BTC-USD", cap: 0.1 },
];

/**
 * How much each regime favours each sleeve, 0..1.
 *
 * REASONED, not backtested — the same status the affinity table had
 * before affinityBacktest.ts, and the same candidate for replacement.
 * The numbers encode ordinary regime logic: equities want growth with
 * cooling inflation; gold wants inflation and falling real yields, and
 * is the one sleeve that is *not* a risk asset; Bitcoin behaves as
 * high-beta liquidity, best in Goldilocks, worst in Deflation.
 *
 * Note gold's row never goes near zero. That is the point of holding
 * it — a hedge that gets cut in risk-off has stopped being a hedge.
 */
export const SLEEVE_REGIME_SCORE: Record<SleeveKey, Record<Quadrant, number>> = {
  stocks: { GOLDILOCKS: 1.0, REFLATION: 0.85, INFLATION: 0.35, DEFLATION: 0.15 },
  gold: { GOLDILOCKS: 0.3, REFLATION: 0.6, INFLATION: 1.0, DEFLATION: 0.7 },
  bitcoin: { GOLDILOCKS: 1.0, REFLATION: 0.8, INFLATION: 0.4, DEFLATION: 0.1 },
};

/** Trend confirmation, bottom-up. PENDING is treated as NEUTRAL
 *  rather than as bearish: no signal is not a sell signal. */
export const VAMS_MULTIPLIER: Record<VamsState, number> = {
  BULLISH: 1.0,
  NEUTRAL: 0.6,
  BEARISH: 0.2,
  PENDING: 0.6,
};

/**
 * Sleeves whose weight is scaled by their own trend state. Gold is
 * not one of them: its trend multiplier is fixed at 1.0, so its weight
 * is cap × regimeScore and nothing else. Gold's VAMS state is still
 * computed and reported, it just no longer moves the weight.
 *
 * Approved 2026-11-14 after the pre-registered untimed-gold test
 * (rebuilt Phase 1 dataset, BIL cash, 25 bps): timing gold on its
 * 63-day trend de-risked it in 81 of 143 months and gold then rose in
 * 46 of them.
 */
export const TREND_TIMED_SLEEVES: SleeveKey[] = ["stocks", "bitcoin"];

/**
 * The six cycles are scored tailwind/headwind FOR RISK ASSETS (see
 * cycles.ts), so their drag applies to the risk sleeves only. Gold is
 * exempt — applying a risk-asset headwind to the hedge would cut the
 * hedge exactly when the cycles say you need it, which is the single
 * most obvious way to get this wrong.
 */
export const RISK_SLEEVES: SleeveKey[] = ["stocks", "bitcoin"];

/** At 6 of 6 headwinds a risk sleeve keeps this fraction of its
 *  otherwise-indicated weight. Not zero: the cycles are a
 *  sustainability read, not a stop-loss. */
export const MAX_CYCLE_DRAG = 0.5;

/** Versioned research settings. Passing these never changes the live defaults. */
export interface AllocationSettings {
  /** Omitted = "macro", the live rule. "trend" is used by the internal regime lab only. */
  model?: AllocationModel;
  caps: Record<SleeveKey, number>;
  regimeScores: Record<SleeveKey, Record<Quadrant, number>>;
  vamsMultipliers: Record<VamsState, number>;
  cycleDrag: number;
  /** Sleeves the trend multiplier applies to. Omitted = the live rule
   *  (TREND_TIMED_SLEEVES); any sleeve not listed gets ×1. */
  trendTimedSleeves?: SleeveKey[];
}

export const BASELINE_SETTINGS: AllocationSettings = {
  caps: { stocks: 0.6, gold: 0.3, bitcoin: 0.1 },
  regimeScores: structuredClone(SLEEVE_REGIME_SCORE),
  vamsMultipliers: { ...VAMS_MULTIPLIER },
  cycleDrag: MAX_CYCLE_DRAG,
  trendTimedSleeves: [...TREND_TIMED_SLEEVES],
};

/**
 * Research-only asset-trend rule (the internal regime lab's "Asset trend only" baseline).
 * NOT the live allocation: BASELINE_SETTINGS stays the approved macro rule. Every sleeve,
 * gold included, is timed on its own trend: bullish 100% of cap, neutral 50%, bearish or
 * pending 0%. No regime scores and no cycle drag.
 */
export const TREND_SETTINGS: AllocationSettings = {
  model: "trend",
  caps: { stocks: 0.6, gold: 0.3, bitcoin: 0.1 },
  regimeScores: {
    stocks: { GOLDILOCKS: 1, REFLATION: 1, INFLATION: 1, DEFLATION: 1 },
    gold: { GOLDILOCKS: 1, REFLATION: 1, INFLATION: 1, DEFLATION: 1 },
    bitcoin: { GOLDILOCKS: 1, REFLATION: 1, INFLATION: 1, DEFLATION: 1 },
  },
  vamsMultipliers: { BULLISH: 1, NEUTRAL: 0.5, BEARISH: 0, PENDING: 0 },
  cycleDrag: 0,
  trendTimedSleeves: ["stocks", "gold", "bitcoin"],
};

export function validateAllocationSettings(settings: AllocationSettings): void {
  const fraction = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
  if ((settings.model !== undefined && settings.model !== "trend" && settings.model !== "macro") || !fraction(settings.cycleDrag) ||
      SLEEVES.some(s => !fraction(settings.caps[s.key])) ||
      Object.values(settings.caps).reduce((a, b) => a + b, 0) > 1 + 1e-9 ||
      Object.values(settings.vamsMultipliers).some(n => !fraction(n)) ||
      (settings.trendTimedSleeves ?? []).some(k => !SLEEVES.some(s => s.key === k)) ||
      SLEEVES.some(s => Object.keys(SLEEVE_REGIME_SCORE[s.key]).some(q =>
        !fraction(settings.regimeScores[s.key][q as Quadrant])))) {
    throw new Error("Caps must total at most 100%; all allocation settings must be between 0 and 100%.");
  }
}

export interface AllocationInput {
  date: string;
  /** Regime to allocate against. Prefer the MARKET's modal regime over
   *  the economic quadrant — the framework's position is that you
   *  invest on what the market is telling you, not on your own read.
   *  Null falls back to `economicQuadrant`. */
  marketRegime: Quadrant | null;
  economicQuadrant: Quadrant | null;
  /** 0..6 cycles working against risk assets. */
  headwinds: number;
  /** VAMS state per sleeve. */
  states: Partial<Record<SleeveKey, VamsState>>;
  /** Sleeves that have no price history yet at this date — excluded
   *  entirely rather than held at zero, so the backtest can tell
   *  "not investable yet" from "deliberately not held". */
  unavailable?: SleeveKey[];
}

export interface SleeveWeight {
  /** Set only for the research trend rule; live (macro) weights omit it. */
  model?: AllocationModel;
  key: SleeveKey;
  weight: number;
  cap: number;
  regimeScore: number;
  vamsMultiplier: number;
  cycleDrag: number;
  state: VamsState;
  available: boolean;
}

export interface Allocation {
  date: string;
  regime: Quadrant | null;
  regimeSource: "market" | "economic" | "none";
  weights: SleeveWeight[];
  /** Sum of sleeve weights, 0..1. */
  invested: number;
  cash: number;
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/**
 * Target weights for one date.
 *
 * With no regime at all every sleeve goes to zero and the book is all
 * cash. That is deliberate: an allocation engine with no regime read
 * has no opinion, and expressing "no opinion" as a default 60/30/10
 * would silently turn a data outage into a full risk position.
 */
export function computeAllocation(input: AllocationInput, settings?: AllocationSettings): Allocation {
  if (settings) validateAllocationSettings(settings);
  const regime = input.marketRegime ?? input.economicQuadrant;
  const regimeSource: Allocation["regimeSource"] = input.marketRegime
    ? "market"
    : input.economicQuadrant
      ? "economic"
      : "none";

  const unavailable = new Set(input.unavailable ?? []);
  const headwinds = Math.max(0, Math.min(6, input.headwinds));

  // Research trend rule: each asset's own trend sizes it; no regime read is needed.
  const trendModel = settings?.model === "trend";
  const weights: SleeveWeight[] = SLEEVES.map((s) => {
    const state = input.states[s.key] ?? "PENDING";
    const available = !unavailable.has(s.key);
    const cap = settings?.caps[s.key] ?? s.cap;
    const regimeScore = trendModel ? 1 : regime ? (settings?.regimeScores ?? SLEEVE_REGIME_SCORE)[s.key][regime] : 0;
    const vamsMultiplier = trendModel
      ? (state === "PENDING" ? 0 : settings!.vamsMultipliers[state])
      : (settings?.trendTimedSleeves ?? TREND_TIMED_SLEEVES).includes(s.key)
        ? (settings?.vamsMultipliers ?? VAMS_MULTIPLIER)[state]
        : 1;
    const cycleDrag = !trendModel && RISK_SLEEVES.includes(s.key)
      ? 1 - (headwinds / 6) * (settings?.cycleDrag ?? MAX_CYCLE_DRAG)
      : 1;

    const weight =
      !available || (!trendModel && !regime) ? 0 : Math.min(cap, round4(cap * regimeScore * vamsMultiplier * cycleDrag));

    return {
      ...(trendModel ? { model: "trend" as const } : {}),
      key: s.key,
      weight,
      cap,
      regimeScore: round4(regimeScore),
      vamsMultiplier,
      cycleDrag: round4(cycleDrag),
      state,
      available,
    };
  });

  const invested = round4(weights.reduce((a, w) => a + w.weight, 0));
  return {
    date: input.date,
    regime,
    regimeSource,
    weights,
    invested,
    // Caps sum to 1.0 and all multipliers are ≤ 1, so this can't go
    // negative — the max() is belt-and-braces against a future cap edit.
    cash: round4(Math.max(0, 1 - invested)),
  };
}

/** Weight lookup, for the backtest's return calculation. */
export function weightOf(alloc: Allocation, key: SleeveKey): number {
  return alloc.weights.find((w) => w.key === key)?.weight ?? 0;
}
