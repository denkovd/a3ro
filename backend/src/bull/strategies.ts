/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — strategy registry (unified-module spec §1).

   A strategy is a LENS over the one base snapshot, not a second
   engine: computeBullSnapshot already runs the verified Money Line
   on both timeframes (plus ATR%, RS), so each strategy is a pure
   derivation that picks which leg(s) drive verdict / recency /
   strength. No bar is refetched, no engine is forked.

   The one invariant every strategy must honor (spec §8): recency is
   expressed in CLOSED DAILY BARS (weekly bars × 5) so "most recent
   transition first" means the same thing on every lens, and the
   shared ranking grammar (group → recency → strength÷ATR%) applies
   unchanged.
──────────────────────────────────────────────────────────────── */

import { NEWLY_BULLISH_MAX_AGE } from "../regime/engine";
import { RegimeVerdict, TimeframeState } from "../regime/types";
import { BullSnapshot } from "./types";

export type StrategyId = "ml-dw" | "ml-daily" | "ml-weekly";

export interface StrategyMeta {
  id: StrategyId;
  /** UI label for the switcher. */
  label: string;
  timeframe: "multi" | "daily" | "weekly";
  /** One-sentence honest description (the per-strategy footnote seed). */
  description: string;
}

/** Registry order = switcher order. Adding a strategy = one entry here
 *  plus a branch in deriveStrategySnapshots. */
export const STRATEGIES: StrategyMeta[] = [
  {
    id: "ml-dw",
    label: "Money Line D×W",
    timeframe: "multi",
    description:
      "Daily × weekly Money Line double confirmation — flips confirm only on candle close; conflicts are shown, never resolved by guessing.",
  },
  {
    id: "ml-weekly",
    label: "Weekly",
    timeframe: "weekly",
    description:
      "Weekly Money Line only — the position lens. Slower and quieter; a state changes only on a weekly close, and the forming week never counts.",
  },
  {
    id: "ml-daily",
    label: "Daily",
    timeframe: "daily",
    description:
      "Daily Money Line only — the fast lens. Noisier by design; what flipped recently matters more than what is merely bullish.",
  },
];

export const DEFAULT_STRATEGY: StrategyId = "ml-dw";

export const STRATEGY_IDS = new Set<string>(STRATEGIES.map((s) => s.id));

export function isStrategyId(v: unknown): v is StrategyId {
  return typeof v === "string" && STRATEGY_IDS.has(v);
}

/** A base snapshot re-read through one strategy's lens. */
export interface BullStrategySnapshot extends BullSnapshot {
  strategy: StrategyId;
}

/* ── single-leg derivation ────────────────────────────────────── */

function legVerdict(trend: number): RegimeVerdict {
  return trend === 1 ? "BULLISH" : trend === -1 ? "BEARISH" : "WARMUP";
}

/** cushion + sinceFlip of ONE leg — same composition computeRegime
 *  uses, but scoped to the leg that drives this strategy (a weekly
 *  lens must not rank on daily cushion). */
function legStrength(leg: TimeframeState): number | null {
  if (leg.cushionPct !== null && leg.sinceFlipPct !== null) {
    return leg.cushionPct + leg.sinceFlipPct;
  }
  return leg.cushionPct ?? leg.sinceFlipPct;
}

/**
 * Re-read the base snapshot through one timeframe leg:
 * - verdict = that leg's trend (BULLISH/BEARISH/WARMUP — conflicts
 *   cannot exist with one leg)
 * - recency = that leg's bars-since-flip, scaled to daily bars, and
 *   stored in alignedSince/daysSinceAligned so the shared ranking and
 *   the UI's "Confirmed" column read the same fields on every lens
 * - strength = that leg's cushion+sinceFlip, ÷ ATR% for the tiebreak
 * - newlyBullish = bullish for ≤ NEWLY_BULLISH_MAX_AGE daily-scale bars
 * Both TimeframeStates are kept verbatim — the UI dims the leg that
 * doesn't drive, it never pretends the other leg wasn't computed.
 */
function deriveSingleLeg(
  base: BullSnapshot,
  strategy: StrategyId,
  leg: TimeframeState,
  barScale: number,
): BullStrategySnapshot {
  const verdict = legVerdict(leg.trend);
  const recencyDays = leg.barsSinceFlip === null ? null : leg.barsSinceFlip * barScale;
  const newlyBullish =
    verdict === "BULLISH" && recencyDays !== null && recencyDays <= NEWLY_BULLISH_MAX_AGE;
  const strength = legStrength(leg);
  const strengthVol =
    strength !== null && base.atrPct !== null && base.atrPct > 0
      ? strength / base.atrPct
      : null;

  return {
    ...base,
    strategy,
    verdict,
    newlyBullish,
    alignedSince: verdict === "WARMUP" ? null : leg.lastFlipDate,
    daysSinceAligned: verdict === "WARMUP" ? null : recencyDays,
    strength,
    strengthVol,
    rank: 0, // assigned per strategy by rankBullSnapshots
  };
}

/**
 * One base snapshot → one row per registered strategy. `ml-dw` is the
 * identity read (today's exact behavior); the single-leg lenses derive
 * from the weekly/daily TimeframeStates already computed inside it.
 */
export function deriveStrategySnapshots(base: BullSnapshot): BullStrategySnapshot[] {
  return [
    { ...base, strategy: "ml-dw" },
    deriveSingleLeg(base, "ml-weekly", base.weekly, 5),
    deriveSingleLeg(base, "ml-daily", base.daily, 1),
  ];
}

/* ── consensus (spec §1 "the merge dividend") ─────────────────── */

export interface StrategyConsensus {
  bull: number;
  bear: number;
  /** Conflicted or warm-up — neither camp. */
  neutral: number;
  /** Strategies that produced a row for this symbol on the run. */
  of: number;
}

/** Fold one strategy-verdict into a consensus tally. BULLISH counts
 *  bull, BEARISH counts bear, everything else (conflicts, warm-up)
 *  is neutral — a conflict is a real reading, not a missing one. */
export function tallyConsensus(verdicts: string[]): StrategyConsensus {
  const c: StrategyConsensus = { bull: 0, bear: 0, neutral: 0, of: verdicts.length };
  for (const v of verdicts) {
    if (v === "BULLISH") c.bull++;
    else if (v === "BEARISH") c.bear++;
    else c.neutral++;
  }
  return c;
}
