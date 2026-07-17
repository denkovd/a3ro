/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Leaderboard — ranking engine (architecture spec §3,
   v2). Pure functions only: no network, no DB — operates on cached
   quarters already loaded by db.ts.

   NOTE ON PACKAGE BOUNDARIES: this intentionally does NOT import
   backend/src/earnings/engine.ts (exposed as "@a3ro/oil-backend").
   That package is being upgraded concurrently by another workstream;
   app/ and backend/ are separate packages on this task and the v2
   read API is self-contained so it never depends on backend/'s
   in-flight state. Constants and math are re-derived here from the
   spec, not reused.

   All tunable constants live in RANKING_CONFIG (spec §3: "All
   constants live in one config object").
──────────────────────────────────────────────────────────────── */

export const RANKING_CONFIG = {
  /** ±50% winsorization bound — one blowout quarter can't dominate (§3.3). */
  WINSOR_BOUND: 50,
  /** EPS vs. revenue blend weights — EPS is the headline surprise markets react to (§3.3). */
  EPS_BLEND_WEIGHT: 0.6,
  REVENUE_BLEND_WEIGHT: 0.4,
  /** Recency weights, newest-first, positional (§3.3). */
  RECENCY_WEIGHTS: [0.4, 0.3, 0.2, 0.1] as const,
  /** Trailing-window size for averages + composite score (§3.2/§3.3). */
  TRAILING_QUARTERS: 4,
  /** Confidence thresholds on "quarters with signal" among the trailing window (§3.3). */
  CONFIDENCE_HIGH_MIN: 4,
  CONFIDENCE_MEDIUM_MIN: 2,
  /** API defaults (§4). */
  DEFAULT_ACTIVE: true,
  DEFAULT_MIN_QUARTERS: 0,
  DEFAULT_LIMIT: 100,
  DEFAULT_ORDER: "desc" as const,
  CACHE_CONTROL: "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

export type Confidence = "high" | "medium" | "low" | null;

/** Per-quarter shape the engine needs — newest-first, caller enforces order. */
export interface QuarterSurprise {
  fiscalYear: number;
  fiscalQuarter: number;
  epsSurprisePercent: number | null;
  revenueSurprisePercent: number | null;
}

export interface TickerMetrics {
  rankScore: number | null;
  beatStreak: number;
  streakIsCapped: boolean;
  confidence: Confidence;
  epsSurpriseAvg: number | null;
  revenueSurpriseAvg: number | null;
  quartersAvailable: number;
}

export function winsor(x: number): number {
  return Math.max(-RANKING_CONFIG.WINSOR_BOUND, Math.min(RANKING_CONFIG.WINSOR_BOUND, x));
}

/**
 * §3.1 Beat streak — walks ALL cached history (v2 fix; v1 capped this
 * at 4 by only ever being handed 4 quarters — see route.ts comment).
 * From newest, count consecutive quarters with eps_surprise_percent > 0;
 * stop at the first value <= 0 OR null (a data gap must never extend
 * a streak).
 */
export function computeBeatStreak(allQuartersNewestFirst: readonly QuarterSurprise[]): number {
  let streak = 0;
  for (const q of allQuartersNewestFirst) {
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
 * §3.2 Trailing-4Q averages — over the newest N = min(4, available)
 * quarters. Non-null values only; missing-estimate quarters are
 * excluded, never counted as 0. `null` if no non-null values exist.
 */
export function computeTrailingAverages(trailingQuarters: readonly QuarterSurprise[]): {
  epsSurpriseAvg: number | null;
  revenueSurpriseAvg: number | null;
} {
  const epsValues = trailingQuarters
    .map((q) => q.epsSurprisePercent)
    .filter((v): v is number => v !== null);
  const revValues = trailingQuarters
    .map((q) => q.revenueSurprisePercent)
    .filter((v): v is number => v !== null);
  return {
    epsSurpriseAvg: mean(epsValues),
    revenueSurpriseAvg: mean(revValues),
  };
}

interface CompositeResult {
  rankScore: number | null;
  /** Count of trailing quarters that had at least one non-null leg
   *  (i.e. were NOT dropped for "no signal") — drives confidence (§3.3). */
  signalCount: number;
}

/**
 * §3.3 Composite rank score — recency-weighted, EPS-tilted.
 *
 * Per-quarter blend sᵢ (symmetric null handling):
 *   both present              -> 0.6*eps + 0.4*rev
 *   revenue null, eps present -> eps only
 *   eps null, revenue present -> rev only
 *   both null                 -> quarter dropped entirely (no weight)
 *
 * Recency weights are positional over the trailing window, then
 * renormalized over the RETAINED (non-dropped) quarters only.
 * `rank_score = null` (never 0) when no trailing quarter has signal.
 */
export function computeComposite(trailingQuarters: readonly QuarterSurprise[]): CompositeResult {
  const weights = RANKING_CONFIG.RECENCY_WEIGHTS;
  type Retained = { weight: number; s: number };
  const retained: Retained[] = [];

  trailingQuarters.forEach((q, i) => {
    const eps = q.epsSurprisePercent === null ? null : winsor(q.epsSurprisePercent);
    const rev = q.revenueSurprisePercent === null ? null : winsor(q.revenueSurprisePercent);
    let s: number;
    if (eps === null && rev === null) {
      return; // no signal at all this quarter -> drop
    } else if (rev === null) {
      s = eps as number;
    } else if (eps === null) {
      s = rev;
    } else {
      s = RANKING_CONFIG.EPS_BLEND_WEIGHT * eps + RANKING_CONFIG.REVENUE_BLEND_WEIGHT * rev;
    }
    // Positional recency weight; index may exceed the configured weight
    // list only if TRAILING_QUARTERS were ever raised past its length —
    // treat any such overflow position as weight 0 rather than throwing.
    const weight = weights[i] ?? 0;
    retained.push({ weight, s });
  });

  const weightSum = retained.reduce((sum, r) => sum + r.weight, 0);
  if (retained.length === 0 || weightSum <= 0) {
    return { rankScore: null, signalCount: retained.length };
  }

  const rankScore = retained.reduce((sum, r) => sum + (r.weight / weightSum) * r.s, 0);
  return { rankScore, signalCount: retained.length };
}

function confidenceFor(signalCount: number): Confidence {
  if (signalCount >= RANKING_CONFIG.CONFIDENCE_HIGH_MIN) return "high";
  if (signalCount >= RANKING_CONFIG.CONFIDENCE_MEDIUM_MIN) return "medium";
  if (signalCount >= 1) return "low";
  // 0 quarters with signal: rank_score is null too (never fabricated) —
  // spec only defines high/medium/low (§3.3), so "no signal" gets no
  // confidence label rather than an invented default.
  return null;
}

/**
 * Combines §3.1-§3.3 into the per-ticker metrics the API route needs.
 * `allQuartersNewestFirst` must be ALL cached quarters for the ticker
 * (not pre-capped) so the beat streak can walk full history; this
 * function takes the trailing min(4, available) slice itself for the
 * averages and composite score.
 */
export function computeTickerMetrics(allQuartersNewestFirst: readonly QuarterSurprise[]): TickerMetrics {
  const quartersAvailable = allQuartersNewestFirst.length;
  const trailing = allQuartersNewestFirst.slice(0, RANKING_CONFIG.TRAILING_QUARTERS);

  const beatStreak = computeBeatStreak(allQuartersNewestFirst);
  const { epsSurpriseAvg, revenueSurpriseAvg } = computeTrailingAverages(trailing);
  const { rankScore, signalCount } = computeComposite(trailing);

  return {
    rankScore,
    beatStreak,
    // Invariant (§4): streak_is_capped <=> beat_streak = quarters_available.
    streakIsCapped: beatStreak === quartersAvailable,
    confidence: confidenceFor(signalCount),
    epsSurpriseAvg,
    revenueSurpriseAvg,
    quartersAvailable,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
