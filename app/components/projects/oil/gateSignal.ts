/* ────────────────────────────────────────────────────────────────
   Gate signal — the one place that decides how a chokepoint's tanker
   traffic reads against its norm. Pure and import-free (types only),
   so the rail, the detail panels, the globe draw loop and the tests
   all share the same answer.

   A state describes TRAFFIC against a historical norm. It never
   describes whether a gate, route or facility is operating normally,
   and a missing or stale reading is never promoted to "typical".

   Three separate questions, three separate answers:
     1. WHICH NORM — the 1-year mean, unless it has drifted 25% or more
        from the 5-year mean. A disruption that lasts months drags the
        1-year mean down with it, until a shut gate looks ordinary
        against its own outage; the 5-year mean then takes over.
     2. HOW FAR — reading ÷ that norm. This percent sets the tier, the
        mark size and the label. It is the same arithmetic for every
        gate.
     3. IS THAT UNUSUAL FOR THIS GATE — the typical range. When the
        backend has stored the spread of the gate's own 7-day averages
        (CorridorBaseline.weekly) the range is norm ± this gate's usual
        weekly swing; until then it is the fixed 85–115% band every
        gate used before. Colour follows this state.
   A fourth, descriptive only: where the reading ranks among the 7-day
   averages of the reference window. It never drives state or colour —
   after a long outage the outage is part of that ranking.
──────────────────────────────────────────────────────────────── */
import type { CorridorBaseline, CorridorMetricLatest, WeeklySpread } from "@a3ro/oil-backend";

export type GateState = "below" | "above" | "typical" | "stale" | "no-norm" | "no-reading";
export type NormWindow = "1y" | "5y";

/** Fixed fallback band, used when a gate's own weekly spread is not on file.
 *  Keep equal to HEALTH_LOW / HEALTH_HIGH in oilTrackerShared.ts. */
export const GATE_NEUTRAL_LOW = 0.85;
export const GATE_NEUTRAL_HIGH = 1.15;
/** A baseline window that ended longer ago than this no longer describes "the norm". */
export const GATE_NORM_MAX_AGE_DAYS = 45;
/** The 1-year norm's own year-on-year drift is called out at or beyond this size. */
export const GATE_NORM_DRIFT_PCT = 15;
/** The 1-year norm hands over to the 5-year norm once it has drifted this far from it
 *  (as a fraction). Keep equal to NORM_SWITCH_DRIFT in backend/src/scores/engine.ts. */
export const GATE_NORM_SWITCH_DRIFT = 0.25;
/** Typical half-width = this × the median absolute deviation of the gate's 7-day
 *  averages. 1.9 × MAD spans the middle 80% of weeks for a steady gate, and unlike
 *  a percentile band it is not stretched by a long outage. */
export const GATE_SPREAD_MAD_FACTOR = 1.9;
/** The gate's own band is never tighter than ±5% or wider than ±50% of its norm:
 *  a hair-trigger band flags noise, and a band past 50% would call half-normal traffic typical. */
export const GATE_SPREAD_MIN = 0.05;
export const GATE_SPREAD_MAX = 0.5;

const DAY = 86_400_000;

type NormInput = Pick<CorridorBaseline, "meanValue" | "sampleTo"> & { yoyPct?: number | null; weekly?: WeeklySpread | null };

export type GateSignalInput = {
  /** Latest 7-day-average reading on file, whatever its age. null = nothing stored. */
  reading: Pick<CorridorMetricLatest, "value" | "periodDate"> | null;
  /** True only when the reading is inside its source's publication cadence (dataQuality.metricFreshness). */
  fresh: boolean;
  norm1y: NormInput | null;
  norm5y: NormInput | null;
  now?: number;
};

/** Where a reading sits among the reference window's 7-day averages. */
export type GateRankPosition = "lowest" | "low5" | "low10" | "low25" | "mid" | "high25" | "high10" | "high5" | "highest";
export type GateRank = { position: GateRankPosition; win: NormWindow; n: number };

export type GateSignal = {
  state: GateState;
  /** The reading itself; present for every state except "no-reading". */
  value: number | null;
  periodDate: string | null;
  /** Which window is the reference norm. null when there is no comparison. */
  ref: NormWindow | null;
  /** The reference mean — what ratio, tier, size and the gap are measured against. */
  norm: number | null;
  /** Reading ÷ reference norm. Set only for below / above / typical. */
  ratio: number | null;
  /** Reading ÷ each window's mean, as context. */
  ratio1y: number | null;
  ratio5y: number | null;
  norm1y: number | null;
  norm5y: number | null;
  /** 1-year mean against the 5-year mean, percent. null unless both are on file. */
  normGapPct: number | null;
  /** True when the 5-year norm is the reference because the 1-year norm has drifted from it. */
  switched: boolean;
  /** Year-on-year change of the 1-year mean itself, when the source supplied it. */
  normYoyPct: number | null;
  /** Typical range as ratios of the reference norm. null when there is no comparison. */
  bandLow: number | null;
  bandHigh: number | null;
  /** "own" = from this gate's weekly spread; "fixed" = the 85–115% fallback. */
  bandBasis: "own" | "fixed" | null;
  /** Rank among the reference window's 7-day averages — description only. */
  rank: GateRank | null;
  /** Distance from the norm (|1 − ratio|) for ranking; 0 when there is no comparison. */
  severity: number;
};

function usableNorm(norm: NormInput | null, now: number): number | null {
  if (!norm || !Number.isFinite(norm.meanValue) || norm.meanValue <= 0) return null;
  const ended = Date.parse(norm.sampleTo);
  if (!Number.isFinite(ended) || now - ended > GATE_NORM_MAX_AGE_DAYS * DAY) return null;
  return norm.meanValue;
}

/** Which window a gate is read against: 1y, or 5y once the 1y mean has drifted from it. */
export function referenceWindow(mean1y: number | null, mean5y: number | null): NormWindow | null {
  if (mean1y !== null && mean5y !== null) return Math.abs(mean1y / mean5y - 1) >= GATE_NORM_SWITCH_DRIFT ? "5y" : "1y";
  return mean1y !== null ? "1y" : mean5y !== null ? "5y" : null;
}

const SPREAD_KEYS = ["n", "min", "p05", "p10", "p25", "p50", "p75", "p90", "p95", "max", "mad"] as const;
function usableSpread(w: WeeklySpread | null | undefined): WeeklySpread | null {
  if (!w) return null;
  return SPREAD_KEYS.every(k => typeof w[k] === "number" && Number.isFinite(w[k])) && w.mad >= 0 ? w : null;
}

/** Half-width of a gate's typical range as a fraction of its norm, from its own weekly spread. */
export function typicalSpread(weekly: WeeklySpread | null | undefined, norm: number): number | null {
  const w = usableSpread(weekly);
  if (!w || !(norm > 0)) return null;
  return Math.min(GATE_SPREAD_MAX, Math.max(GATE_SPREAD_MIN, (GATE_SPREAD_MAD_FACTOR * w.mad) / norm));
}

/** Position of a value among a window's 7-day averages, from its stored quantiles. */
export function weeklyRankPosition(value: number, w: WeeklySpread): GateRankPosition {
  if (value < w.min) return "lowest";
  if (value > w.max) return "highest";
  if (value <= w.p05) return "low5";
  if (value <= w.p10) return "low10";
  if (value <= w.p25) return "low25";
  if (value >= w.p95) return "high5";
  if (value >= w.p90) return "high10";
  if (value >= w.p75) return "high25";
  return "mid";
}

export function gateSignal({ reading, fresh, norm1y, norm5y, now = Date.now() }: GateSignalInput): GateSignal {
  const empty: GateSignal = {
    state: "no-reading", value: null, periodDate: null, ref: null, norm: null, ratio: null, ratio1y: null, ratio5y: null,
    norm1y: null, norm5y: null, normGapPct: null, switched: false, normYoyPct: null, bandLow: null, bandHigh: null, bandBasis: null, rank: null, severity: 0,
  };
  if (!reading || !Number.isFinite(reading.value)) return empty;
  const base = { ...empty, value: reading.value, periodDate: reading.periodDate.slice(0, 10) };
  // A stale reading is shown with its date and never compared, coloured or ranked.
  if (!fresh) return { ...base, state: "stale" };
  const mean1y = usableNorm(norm1y, now);
  const mean5y = usableNorm(norm5y, now);
  const ref = referenceWindow(mean1y, mean5y);
  if (ref === null) return { ...base, state: "no-norm" };
  const norm = (ref === "5y" ? mean5y : mean1y) as number;
  const ratio = reading.value / norm;
  const weekly = usableSpread((ref === "5y" ? norm5y : norm1y)?.weekly);
  const own = typicalSpread(weekly, norm);
  const bandLow = own === null ? GATE_NEUTRAL_LOW : 1 - own;
  const bandHigh = own === null ? GATE_NEUTRAL_HIGH : 1 + own;
  const yoy = norm1y?.yoyPct;
  return {
    ...base,
    state: ratio < bandLow ? "below" : ratio > bandHigh ? "above" : "typical",
    ref, norm, ratio,
    ratio1y: mean1y === null ? null : reading.value / mean1y,
    ratio5y: mean5y === null ? null : reading.value / mean5y,
    norm1y: mean1y, norm5y: mean5y,
    normGapPct: mean1y !== null && mean5y !== null ? (mean1y / mean5y - 1) * 100 : null,
    switched: ref === "5y" && mean1y !== null,
    normYoyPct: mean1y !== null && typeof yoy === "number" && Number.isFinite(yoy) ? yoy : null,
    bandLow, bandHigh, bandBasis: own === null ? "fixed" : "own",
    rank: weekly ? { position: weeklyRankPosition(reading.value, weekly), win: ref, n: weekly.n } : null,
    severity: Math.abs(1 - ratio),
  };
}

export const isOutsideTypical = (s: GateSignal) => s.state === "below" || s.state === "above";
export const hasComparison = (s: GateSignal) => s.ratio !== null;

/** Direction glyph that travels with every colour, so colour is never the only cue. */
export function gateArrow(s: GateSignal): string {
  return s.state === "below" ? "▼" : s.state === "above" ? "▲" : "";
}

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const winLabel = (win: NormWindow) => (win === "5y" ? "5-yr" : "1-yr");

/** Headline status for a gate, e.g. "8% of 1-yr norm" or "Stale · 2026-07-19". */
export function gateStatusText(s: GateSignal): string {
  if (s.ratio !== null && s.ref !== null) return `${pct(s.ratio)} of ${winLabel(s.ref)} norm`;
  if (s.state === "stale") return `Stale reading · ${s.periodDate}`;
  if (s.state === "no-norm") return "No current norm on file";
  return "No reading";
}

/** One-word band for lists and screen readers. */
export function gateBandText(s: GateSignal): string {
  return s.state === "below" ? "Below typical range"
    : s.state === "above" ? "Above typical range"
    : s.state === "typical" ? "Within typical range"
    : s.state === "stale" ? "Stale — not compared"
    : s.state === "no-norm" ? "Not compared — no norm"
    : "No reading";
}

/** The typical range in words, e.g. "typical for this gate is 88–112% of the 1-yr norm". "" without a comparison. */
export function gateTypicalText(s: GateSignal): string {
  if (s.bandLow === null || s.bandHigh === null || s.ref === null) return "";
  const range = `${Math.round(s.bandLow * 100)}–${pct(s.bandHigh)} of the ${winLabel(s.ref)} norm`;
  return s.bandBasis === "own" ? `typical for this gate is ${range}` : `typical is ${range} (fixed band)`;
}

const RANK_WORDS: Record<GateRankPosition, string> = {
  lowest: "Lower than every week", low5: "Lowest 5% of weeks", low10: "Lowest 10% of weeks", low25: "Lowest quarter of weeks",
  mid: "Middle half of weeks", high25: "Highest quarter of weeks", high10: "Highest 10% of weeks", high5: "Highest 5% of weeks", highest: "Higher than every week",
};

/** Rank among the reference window's 7-day averages, e.g. "Lowest 10% of weeks in 5 yrs". "" when no spread is on file. */
export function gateRankText(s: GateSignal): string {
  return s.rank ? `${RANK_WORDS[s.rank.position]} in ${s.rank.win === "5y" ? "5 yrs" : "the past yr"}` : "";
}

/** Context parts shown under the headline: rank, the other norm, and why the reference is what it is. */
export function gateContextParts(s: GateSignal, unit = "/d"): string[] {
  const parts: string[] = [];
  if (s.ratio === null || s.ref === null) {
    if (s.ratio5y !== null && s.norm5y !== null) parts.push(`${pct(s.ratio5y)} of 5-yr norm (${s.norm5y.toFixed(1)}${unit})`);
    return parts;
  }
  const rank = gateRankText(s);
  if (rank) parts.push(rank);
  if (s.ref === "1y" && s.ratio5y !== null && s.norm5y !== null) parts.push(`${pct(s.ratio5y)} of 5-yr norm (${s.norm5y.toFixed(1)}${unit})`);
  if (s.ref === "5y" && s.ratio1y !== null && s.norm1y !== null) parts.push(`${pct(s.ratio1y)} of 1-yr norm (${s.norm1y.toFixed(1)}${unit})`);
  if (s.switched && s.normGapPct !== null) {
    parts.push(`5-yr norm used: 1-yr norm is ${Math.abs(s.normGapPct).toFixed(0)}% ${s.normGapPct < 0 ? "below" : "above"} it`);
  } else if (s.normYoyPct !== null && Math.abs(s.normYoyPct) >= GATE_NORM_DRIFT_PCT) {
    parts.push(`1-yr norm itself ${s.normYoyPct > 0 ? "+" : "−"}${Math.abs(s.normYoyPct).toFixed(0)}% YoY`);
  }
  return parts;
}

/* Colour. The shared flowHealth scale (oilTrackerShared.ts) is neutral
   between 85% and 115%, full red at 50% and full teal at 150%. A gate
   with its own band is mapped onto that scale so its band edges land on
   the scale's edges — colour then always agrees with the state. With
   the fixed band this is the identity. */
const SCALE_LOW = GATE_NEUTRAL_LOW, SCALE_HIGH = GATE_NEUTRAL_HIGH, SCALE_RED = 0.5, SCALE_TEAL = 1.5;

/** The ratio to hand to flowHealth() for this gate. null when there is no comparison. */
export function gateColourRatio(s: GateSignal): number | null {
  if (s.ratio === null || s.bandLow === null || s.bandHigh === null) return null;
  if (s.state === "typical") return 1;
  if (s.state === "below") {
    if (s.ratio <= SCALE_RED || s.bandLow <= SCALE_RED) return Math.min(s.ratio, SCALE_RED);
    // (SCALE_RED, bandLow) → (SCALE_RED, SCALE_LOW); the tiny offset keeps a just-outside reading off the neutral edge
    return Math.min(SCALE_LOW - 1e-6, SCALE_RED + ((s.ratio - SCALE_RED) / (s.bandLow - SCALE_RED)) * (SCALE_LOW - SCALE_RED));
  }
  if (s.ratio >= SCALE_TEAL || s.bandHigh >= SCALE_TEAL) return Math.max(s.ratio, SCALE_TEAL);
  return Math.max(SCALE_HIGH + 1e-6, SCALE_HIGH + ((s.ratio - s.bandHigh) / (SCALE_TEAL - s.bandHigh)) * (SCALE_TEAL - SCALE_HIGH));
}

/** Outside-range gates first (largest departure first), then typical, then gates with no comparison. */
export function rankGateSignals<T extends { signal: GateSignal }>(rows: T[]): T[] {
  const tier = (s: GateSignal) => (isOutsideTypical(s) ? 0 : s.state === "typical" ? 1 : 2);
  return [...rows].sort((a, b) => tier(a.signal) - tier(b.signal) || b.signal.severity - a.signal.severity);
}

export type RouteFlowState = "flowing" | "interrupted" | "unobserved";

/**
 * How a route may be drawn, from the traffic at its gates:
 *  - interrupted: any gate reads below its typical range → no pulse.
 *  - flowing: every gate has a current comparison at or above its range → pulse allowed.
 *  - unobserved: no gates, or any gate without a current comparison → static, illustrative.
 * Gate traffic is not route cargo; this only stops the globe implying flow it cannot see.
 */
export function routeFlowState(gates: (GateSignal | undefined)[]): RouteFlowState {
  if (gates.some(g => g?.state === "below")) return "interrupted";
  if (gates.length === 0 || gates.some(g => !g || !hasComparison(g))) return "unobserved";
  return "flowing";
}

/** Colour ratio of the route's lowest-reading gate — what sets an interrupted route's colour. */
export function routeWorstRatio(gates: (GateSignal | undefined)[]): number | null {
  const compared = gates.filter((g): g is GateSignal => !!g && g.ratio !== null);
  if (compared.length === 0) return null;
  return gateColourRatio(compared.reduce((a, b) => ((b.ratio as number) < (a.ratio as number) ? b : a)));
}

/* ── severity: how far outside the typical range ───────────────────
   Tiers and mark size both follow the percent departure from the
   reference norm — the same arithmetic for every gate, whatever its
   own typical range. They describe how far traffic is from normal, not
   how many barrels are affected — the absolute shortfall travels
   alongside as text. A gate has a tier only once it is outside its
   typical range. */

/** 0 = not outside the typical range; 1–3 = increasing departure. */
export type GateTier = 0 | 1 | 2 | 3;
/** Departure from the norm at which a gate moves to tier 2 and tier 3. */
export const GATE_TIER_2_DEPARTURE = 0.4;
export const GATE_TIER_3_DEPARTURE = 0.7;

export function gateTier(s: GateSignal): GateTier {
  if (!isOutsideTypical(s)) return 0;
  // the epsilon keeps the boundaries symmetric: 60% and 140% of norm are both exactly tier 2
  const departure = s.severity + 1e-9;
  return departure >= GATE_TIER_3_DEPARTURE ? 3 : departure >= GATE_TIER_2_DEPARTURE ? 2 : 1;
}

const TIER_WORDS = { below: ["", "Below", "Well below", "Severe"], above: ["", "Above", "Well above", "Far above"] } as const;

/** Tier in words: Below / Well below / Severe, or Above / Well above / Far above. */
export function gateTierText(s: GateSignal): string {
  const tier = gateTier(s);
  return tier === 0 ? gateBandText(s) : TIER_WORDS[s.state === "above" ? "above" : "below"][tier];
}

/** Globe mark radius in px. Outside the typical range it grows linearly with
 *  the departure from the norm: 10% → 8px, 50% → 16px, 100% or more → 26px. */
export const GATE_MARK_MIN_PX = 6;
export const GATE_MARK_SPAN_PX = 20;
export function gateMarkRadius(s: GateSignal | null | undefined): number {
  if (!s || !hasComparison(s)) return 5;
  if (!isOutsideTypical(s)) return 5.5;
  return GATE_MARK_MIN_PX + GATE_MARK_SPAN_PX * Math.min(1, s.severity);
}

/** Tankers a day against the reference norm: positive = fewer than the norm. null without a comparison. */
export function gateShortfall(s: GateSignal): number | null {
  return s.ratio !== null && s.norm !== null && s.value !== null ? s.norm - s.value : null;
}

const approx = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

/** The absolute gap in words, e.g. "about 12 fewer tankers a day"; "" when there is no comparison. */
export function gateShortfallText(s: GateSignal): string {
  const gap = gateShortfall(s);
  if (gap === null) return "";
  return `about ${approx(Math.abs(gap))} ${gap >= 0 ? "fewer" : "more"} tankers a day`;
}

/** Compact form for the globe label, e.g. "≈12 FEWER/D". */
export function gateShortfallShort(s: GateSignal): string {
  const gap = gateShortfall(s);
  if (gap === null) return "";
  return `≈${approx(Math.abs(gap))} ${gap >= 0 ? "FEWER" : "MORE"}/D`;
}

/* ── week-on-week tier movement ──────────────────────────────────── */

export type TierMove = "new" | "worse" | "eased" | "cleared" | null;

/**
 * How a gate's tier moved against the week before, both read against the
 * same norm. "new" = entered (or flipped side of) the typical range's
 * outside; "worse"/"eased" = same side, different tier; "cleared" = back
 * inside the typical range. null when nothing changed or either week has
 * no comparison.
 */
export function tierMove(current: GateSignal, prior: GateSignal | null): TierMove {
  if (!prior || !hasComparison(current) || !hasComparison(prior)) return null;
  const now = gateTier(current), was = gateTier(prior);
  if (now === 0) return was === 0 ? null : "cleared";
  if (was === 0 || prior.state !== current.state) return "new";
  return now > was ? "worse" : now < was ? "eased" : null;
}

export function tierMoveText(move: TierMove): string {
  return move === "new" ? "New this week" : move === "worse" ? "Worse this week" : move === "eased" ? "Eased this week" : move === "cleared" ? "Back in range this week" : "";
}
