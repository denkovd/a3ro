/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Tracker — compute layer (architecture spec §3, v2).

   Pure functions operating on cached quarters ONLY. Nothing in this
   file makes a network call, touches Queryable, or imports finnhub.ts
   — the read path (API route) is DB-only per §4 ("The read path
   never calls Finnhub").

   Callers must pass ALL cached quarters for a ticker, already ordered
   newest-first by (fiscal_year desc, fiscal_quarter desc) — this
   module does not sort, and does not cap the input itself. §3.1's
   beat streak walks the FULL array; §3.2/§3.3's trailing averages and
   composite score internally window to the newest N = min(4, length)
   quarters. (v1 bug fixed in v2: v1 required callers to pre-cap the
   input to 4 quarters, which silently capped beat_streak too — the
   spec's own v1 example showed a streak of 6, contradicting its own
   "capped at 4" text. v2's spec explicitly resolves this: streak
   walks all cached history, §3.1.)
──────────────────────────────────────────────────────────────── */

import { Confidence, QuarterSurprise, TickerMetrics } from "./types";

/**
 * All ranking-engine tunable knobs in one place (task deliverable:
 * "keep constants in one exported RANKING_CONFIG object"). The
 * previously-individual named exports (RECENCY_WEIGHTS, WINSOR_BOUND,
 * EPS_BLEND_WEIGHT, REVENUE_BLEND_WEIGHT) are kept as thin aliases
 * below for backward compatibility with existing imports.
 */
export const RANKING_CONFIG = {
  /** Recency weights, most-recent-first (§3.3). */
  recencyWeights: [0.4, 0.3, 0.2, 0.1] as readonly number[],
  /** Winsorization bound (§3.3): clamp outliers so one blowout quarter
   *  can't dominate the composite score. */
  winsorBound: 50,
  /** EPS vs. revenue blend weight (§3.3): EPS is the headline surprise
   *  markets react to; revenue is harder to beat via buybacks/tax items. */
  epsBlendWeight: 0.6,
  revenueBlendWeight: 0.4,
  /** N = min(trailingWindow, quarters_available) for averages + composite (§3.2/§3.3). */
  trailingWindow: 4,
  /** Confidence thresholds (§3.3): count of newest-window quarters with
   *  signal >= high -> "high", >= mediumMin -> "medium", else (>0) -> "low". */
  confidence: { high: 4, mediumMin: 2 },
} as const;

export const RECENCY_WEIGHTS = RANKING_CONFIG.recencyWeights;
export const WINSOR_BOUND = RANKING_CONFIG.winsorBound;
export const EPS_BLEND_WEIGHT = RANKING_CONFIG.epsBlendWeight;
export const REVENUE_BLEND_WEIGHT = RANKING_CONFIG.revenueBlendWeight;

export function winsor(x: number): number {
  return Math.max(-RANKING_CONFIG.winsorBound, Math.min(RANKING_CONFIG.winsorBound, x));
}

/**
 * §3.1 Beat streak — walk from q1 (newest) across ALL cached history,
 * count consecutive quarters with eps_surprise_percent > 0. Stop at
 * the first value that is <= 0 OR null: an unknown surprise breaks
 * the streak (a data gap must never extend a streak). Not capped at 4
 * — bounded only by how many quarters are actually cached.
 */
export function computeBeatStreak(quarters: readonly QuarterSurprise[]): number {
  let streak = 0;
  for (const q of quarters) {
    if (q.epsSurprisePercent !== null && q.epsSurprisePercent > 0) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * §3.2 Trailing-N averages over q1..qN (N = quarters passed in,
 * already windowed to min(4, available) by the caller within this
 * module — see computeTickerMetrics).
 *
 * Edge case "No revenue estimate" (§5): quarters with a null
 * revenue_surprise_percent are EXCLUDED from the mean, never
 * counted as 0 — a missing estimate is not evidence of a miss.
 */
export function computeTrailingAverages(quarters: readonly QuarterSurprise[]): {
  epsSurpriseAvg: number | null;
  revenueSurpriseAvg: number | null;
} {
  const epsValues = quarters
    .map((q) => q.epsSurprisePercent)
    .filter((v): v is number => v !== null);
  const revValues = quarters
    .map((q) => q.revenueSurprisePercent)
    .filter((v): v is number => v !== null);
  return {
    epsSurpriseAvg: mean(epsValues),
    revenueSurpriseAvg: mean(revValues),
  };
}

/**
 * §3.3 Composite rank score — recency-weighted, EPS-tilted, over the
 * newest N = min(trailingWindow, quarters.length) quarters.
 *
 * Per-quarter blend sᵢ (symmetric null handling, §3.3):
 *   both eps/revenue present -> 0.6·winsor(eps) + 0.4·winsor(rev)
 *   revenue null             -> sᵢ = winsor(eps)           (EPS-only)
 *   eps null, revenue present-> sᵢ = winsor(rev)            (revenue-only)
 *   both null                -> no signal: DROP quarter i entirely
 *
 * Recency weights are positional (tied to the quarter's original slot
 * in the N-quarter window, not renumbered after drops), then retained
 * weights are renormalized to sum to 1.
 *
 * No quarter has signal -> rank_score = null (render "—", sort last;
 * NEVER 0 — a data gap can never look like a genuine flat quarter).
 */
export function computeRankScore(quarters: readonly QuarterSurprise[]): number | null {
  const n = Math.min(RANKING_CONFIG.trailingWindow, quarters.length);
  const windowed = quarters.slice(0, n);
  const weights = RANKING_CONFIG.recencyWeights;

  const retained: { weight: number; score: number }[] = [];
  windowed.forEach((q, i) => {
    const eps = q.epsSurprisePercent;
    const rev = q.revenueSurprisePercent;
    let s: number | null;
    if (eps !== null && rev !== null) {
      s = RANKING_CONFIG.epsBlendWeight * winsor(eps) + RANKING_CONFIG.revenueBlendWeight * winsor(rev);
    } else if (eps !== null) {
      s = winsor(eps); // revenue null -> EPS-only fallback
    } else if (rev !== null) {
      s = winsor(rev); // eps null, revenue present -> revenue-only
    } else {
      s = null; // both null -> no signal, drop this quarter
    }
    if (s !== null) retained.push({ weight: weights[i] ?? 0, score: s });
  });

  if (retained.length === 0) return null; // edge case "No signal at all" (§3.3)

  const weightSum = retained.reduce((sum, r) => sum + r.weight, 0);
  if (weightSum <= 0) {
    // Defensive only: shouldn't happen since n <= recencyWeights.length,
    // so every retained quarter has a positive positional weight. Falls
    // back to an equal-weight average rather than dividing by zero.
    const equal = 1 / retained.length;
    return retained.reduce((sum, r) => sum + equal * r.score, 0);
  }

  return retained.reduce((sum, r) => sum + (r.weight / weightSum) * r.score, 0);
}

/**
 * §3.3 Confidence label (UI hint, derived, not stored): counts how
 * many of the newest min(4, available) quarters have signal (at least
 * one of eps/revenue surprise non-null) — the SAME window the
 * composite score uses. 4 -> high, 2-3 -> medium, 1 -> low, 0 -> null
 * (no signal at all; spec doesn't name a tier for this, so it mirrors
 * rank_score's "null, never invented" convention rather than guessing
 * a label).
 */
function computeConfidence(signalCount: number): Confidence {
  if (signalCount >= RANKING_CONFIG.confidence.high) return "high";
  if (signalCount >= RANKING_CONFIG.confidence.mediumMin) return "medium";
  if (signalCount >= 1) return "low";
  return null;
}

/**
 * Combines §3.1-§3.3 into the per-ticker metrics the API route needs.
 * `quarters` must be ALL cached quarters for the ticker, newest-first
 * — this function does the N = min(4, available) windowing internally
 * for averages/composite/confidence, while beat_streak walks the full
 * array (§3.1 fix, see module header).
 */
export function computeTickerMetrics(quarters: readonly QuarterSurprise[]): TickerMetrics {
  const quartersAvailable = quarters.length;
  const beatStreak = computeBeatStreak(quarters);
  // §3.1: "streak_is_capped = (beat_streak === quarters_available)", taken
  // literally per spec — for quartersAvailable === 0 this is trivially
  // true (0 === 0), but that case is inert in practice: a zero-quarter
  // ticker carries no rank_score/averages either, and UIs typically apply
  // `min_quarters >= 1` upstream before rendering the streak badge at all.
  const streakIsCapped = beatStreak === quartersAvailable;

  const n = Math.min(RANKING_CONFIG.trailingWindow, quartersAvailable);
  const windowed = quarters.slice(0, n);
  const { epsSurpriseAvg, revenueSurpriseAvg } = computeTrailingAverages(windowed);
  const rankScore = computeRankScore(quarters);
  const signalCount = windowed.filter(
    (q) => q.epsSurprisePercent !== null || q.revenueSurprisePercent !== null,
  ).length;

  return {
    rankScore,
    beatStreak,
    streakIsCapped,
    confidence: computeConfidence(signalCount),
    epsSurpriseAvg,
    revenueSurpriseAvg,
    quartersAvailable,
  };
}

/* ── Leaderboard ordering (§3.3 "Leaderboard order") ─────────────── */

/** The subset of TickerMetrics (+ ticker) the tie-break comparator needs. */
export interface RankableEntry {
  ticker: string;
  rankScore: number | null;
  beatStreak: number;
  epsSurpriseAvg: number | null;
}

/** number|null comparator: nulls ALWAYS sort last, regardless of direction
 *  (§3.3: "nulls always last, regardless of order"). */
function compareNullsLast(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "desc" ? b - a : a - b;
}

/**
 * Full deterministic tie-break order (§3.3 "Leaderboard order"):
 *   1. rank_score desc (nulls always last)
 *   2. beat_streak desc
 *   3. eps_surprise_avg desc (nulls last)
 *   4. ticker asc
 * This is the DEFAULT (desc) board order; a caller wanting `order=asc`
 * on rank_score per §4 only flips comparator #1's direction — nulls
 * still sort last per the spec's explicit override.
 */
export function compareRankings(a: RankableEntry, b: RankableEntry): number {
  const rankCmp = compareNullsLast(a.rankScore, b.rankScore, "desc");
  if (rankCmp !== 0) return rankCmp;

  if (a.beatStreak !== b.beatStreak) return b.beatStreak - a.beatStreak;

  const epsCmp = compareNullsLast(a.epsSurpriseAvg, b.epsSurpriseAvg, "desc");
  if (epsCmp !== 0) return epsCmp;

  return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
}
