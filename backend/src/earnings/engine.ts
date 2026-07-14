/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Tracker — compute layer (architecture spec §3).

   Pure functions operating on cached quarters ONLY. Nothing in this
   file makes a network call, touches Queryable, or imports finnhub.ts
   — the read path (API route) is DB-only per §4 ("The read path
   never calls Finnhub").

   Callers must pass quarters already ordered newest-first by
   (fiscal_year desc, fiscal_quarter desc) — this module does not sort.
──────────────────────────────────────────────────────────────── */

import { QuarterSurprise, TickerMetrics } from "./types";

/** Recency weights, most-recent-first (§3.3). Tunable knob, not a
 *  literal scattered through the code — surfaced here as config. */
export const RECENCY_WEIGHTS = [0.4, 0.3, 0.2, 0.1] as const;

/** Winsorization bound (§3.3): clamp outliers so one blowout quarter
 *  can't dominate the composite score. Tunable knob. */
export const WINSOR_BOUND = 50;

/** EPS vs. revenue blend weight (§3.3): EPS is the headline surprise
 *  markets react to. Tunable knob. */
export const EPS_BLEND_WEIGHT = 0.6;
export const REVENUE_BLEND_WEIGHT = 0.4;

export function winsor(x: number): number {
  return Math.max(-WINSOR_BOUND, Math.min(WINSOR_BOUND, x));
}

/**
 * §3.1 Beat streak — walk from q1 (newest), count consecutive
 * quarters with eps_surprise_percent > 0. Stop at the first value
 * that is <= 0 OR null: an unknown surprise breaks the streak (a
 * missing estimate is not evidence of a beat).
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
 * already capped to min(4, available) by the caller).
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
 * §3.3 Composite rank score — recency-weighted, EPS-tilted.
 *
 * 1. Truncate RECENCY_WEIGHTS to N = quarters.length, renormalize so
 *    the weights sum to 1 (this is what makes tickers with < 4
 *    quarters of history, or with missing revenue, directly
 *    comparable to full-history tickers — see edge case
 *    "< 4 quarters of history", §5).
 * 2. Per-quarter blend: winsorize both legs; if revenue is null for
 *    that quarter, fall back to EPS-only (no synthetic 0 for the
 *    missing leg — edge case "No revenue estimate", §5); otherwise
 *    blend 0.6·EPS + 0.4·revenue.
 * 3. Weighted sum.
 */
export function computeRankScore(quarters: readonly QuarterSurprise[]): number {
  const n = quarters.length;
  if (n === 0) return 0;

  const truncated: number[] = RECENCY_WEIGHTS.slice(0, n);
  // Defensive pad: if more quarters are ever passed than weights defined
  // (spec caps N at 4, so this should not happen), extend with 0s rather
  // than throwing — treat unweighted quarters as excluded from the score.
  while (truncated.length < n) truncated.push(0);
  const weightSum = truncated.reduce((s, w) => s + w, 0);
  const weights = weightSum > 0 ? truncated.map((w) => w / weightSum) : truncated;

  let score = 0;
  quarters.forEach((q, i) => {
    // NOTE ON A GAP THE SPEC DOESN'T COVER: §3.3's formula (eᵢ = winsor(eps_surprise_percentᵢ))
    // assumes eps_surprise_percent is always present. It can be null (safePct's
    // "estimate = 0" case, §5), and the spec never states what rank_score should
    // do with a null EPS leg — only the streak ("null breaks it") and the trailing
    // average ("excluded from the mean") are specified for null values. Treating
    // it as 0 here (neutral, no push either direction) was the least-surprising
    // reading consistent with "never treat null as a beat or a miss" — but this
    // is a genuine interpretation, not a documented decision, and is called out
    // to Daniel for confirmation rather than assumed silently.
    const eps = winsor(q.epsSurprisePercent ?? 0);
    const blended =
      q.revenueSurprisePercent === null
        ? eps // EPS-only fallback (§3.3)
        : EPS_BLEND_WEIGHT * eps + REVENUE_BLEND_WEIGHT * winsor(q.revenueSurprisePercent);
    score += weights[i] * blended;
  });
  return score;
}

/**
 * Combines §3.1–§3.3 into the per-ticker metrics the API route needs.
 * `quarters` must already be capped to N = min(4, available) and
 * ordered newest-first — the caller (repo query / route) enforces both.
 */
export function computeTickerMetrics(quarters: readonly QuarterSurprise[]): TickerMetrics {
  const { epsSurpriseAvg, revenueSurpriseAvg } = computeTrailingAverages(quarters);
  return {
    rankScore: computeRankScore(quarters),
    beatStreak: computeBeatStreak(quarters),
    epsSurpriseAvg,
    revenueSurpriseAvg,
    quartersAvailable: quarters.length, // §3.2 "always expose quarters_available"
  };
}
