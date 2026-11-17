/* ────────────────────────────────────────────────────────────────
   Gate signal — the one place that decides how a chokepoint's tanker
   traffic reads against its norm. Pure and import-free (types only),
   so the rail, the detail panels, the globe draw loop and the tests
   all share the same answer.

   A state describes TRAFFIC against a historical norm. It never
   describes whether a gate, route or facility is operating normally,
   and a missing or stale reading is never promoted to "typical".

   The neutral band mirrors the flowHealth colour scale in
   oilTrackerShared.ts (85–115% of the 1-year mean); a test asserts
   the two stay in step. Colour stays on the 1-year ratio — the 5-year
   norm is context text only.
──────────────────────────────────────────────────────────────── */
import type { CorridorBaseline, CorridorMetricLatest } from "@a3ro/oil-backend";

export type GateState = "below" | "above" | "typical" | "stale" | "no-norm" | "no-reading";

/** Neutral band edges — keep equal to HEALTH_LOW / HEALTH_HIGH in oilTrackerShared.ts. */
export const GATE_NEUTRAL_LOW = 0.85;
export const GATE_NEUTRAL_HIGH = 1.15;
/** A baseline window that ended longer ago than this no longer describes "the norm". */
export const GATE_NORM_MAX_AGE_DAYS = 45;
/** The 1-year norm's own year-on-year drift is called out at or beyond this size. */
export const GATE_NORM_DRIFT_PCT = 15;

const DAY = 86_400_000;

export type GateSignalInput = {
  /** Latest 7-day-average reading on file, whatever its age. null = nothing stored. */
  reading: Pick<CorridorMetricLatest, "value" | "periodDate"> | null;
  /** True only when the reading is inside its source's publication cadence (dataQuality.metricFreshness). */
  fresh: boolean;
  norm1y: Pick<CorridorBaseline, "meanValue" | "yoyPct" | "sampleTo"> | null;
  norm5y: Pick<CorridorBaseline, "meanValue" | "sampleTo"> | null;
  now?: number;
};

export type GateSignal = {
  state: GateState;
  /** The reading itself; present for every state except "no-reading". */
  value: number | null;
  periodDate: string | null;
  /** Reading ÷ 1-year mean. Set only for below / above / typical. */
  ratio: number | null;
  /** Reading ÷ 5-year mean — context only, never drives state or colour. */
  ratio5y: number | null;
  norm1y: number | null;
  norm5y: number | null;
  /** Year-on-year change of the 1-year mean itself, when the source supplied it. */
  normYoyPct: number | null;
  /** Distance from the norm (|1 − ratio|) for ranking; 0 when there is no comparison. */
  severity: number;
};

function usableNorm(norm: { meanValue: number; sampleTo: string } | null, now: number): number | null {
  if (!norm || !Number.isFinite(norm.meanValue) || norm.meanValue <= 0) return null;
  const ended = Date.parse(norm.sampleTo);
  if (!Number.isFinite(ended) || now - ended > GATE_NORM_MAX_AGE_DAYS * DAY) return null;
  return norm.meanValue;
}

export function gateSignal({ reading, fresh, norm1y, norm5y, now = Date.now() }: GateSignalInput): GateSignal {
  const empty: GateSignal = { state: "no-reading", value: null, periodDate: null, ratio: null, ratio5y: null, norm1y: null, norm5y: null, normYoyPct: null, severity: 0 };
  if (!reading || !Number.isFinite(reading.value)) return empty;
  const base = { ...empty, value: reading.value, periodDate: reading.periodDate.slice(0, 10) };
  // A stale reading is shown with its date and never compared, coloured or ranked.
  if (!fresh) return { ...base, state: "stale" };
  const mean1y = usableNorm(norm1y, now);
  const mean5y = usableNorm(norm5y, now);
  const ratio5y = mean5y === null ? null : reading.value / mean5y;
  if (mean1y === null) return { ...base, state: "no-norm", norm5y: mean5y, ratio5y };
  const ratio = reading.value / mean1y;
  const yoy = norm1y?.yoyPct;
  return {
    ...base,
    state: ratio < GATE_NEUTRAL_LOW ? "below" : ratio > GATE_NEUTRAL_HIGH ? "above" : "typical",
    ratio, ratio5y, norm1y: mean1y, norm5y: mean5y,
    normYoyPct: typeof yoy === "number" && Number.isFinite(yoy) ? yoy : null,
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

/** Headline status for a gate, e.g. "8% of 1-yr norm" or "Stale · 2026-07-19". */
export function gateStatusText(s: GateSignal): string {
  if (s.ratio !== null) return `${pct(s.ratio)} of 1-yr norm`;
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

/** Context parts shown under the headline: the longer norm and any drift in the 1-year norm. */
export function gateContextParts(s: GateSignal, unit = "/d"): string[] {
  const parts: string[] = [];
  if (s.ratio5y !== null && s.norm5y !== null) parts.push(`${pct(s.ratio5y)} of 5-yr norm (${s.norm5y.toFixed(1)}${unit})`);
  if (s.ratio !== null && s.normYoyPct !== null && Math.abs(s.normYoyPct) >= GATE_NORM_DRIFT_PCT) {
    parts.push(`1-yr norm itself ${s.normYoyPct > 0 ? "+" : "−"}${Math.abs(s.normYoyPct).toFixed(0)}% YoY`);
  }
  return parts;
}

/** Outside-range gates first (largest departure first), then typical, then gates with no comparison. */
export function rankGateSignals<T extends { signal: GateSignal }>(rows: T[]): T[] {
  const tier = (s: GateSignal) => (isOutsideTypical(s) ? 0 : s.state === "typical" ? 1 : 2);
  return [...rows].sort((a, b) => tier(a.signal) - tier(b.signal) || b.signal.severity - a.signal.severity);
}

export type RouteFlowState = "flowing" | "interrupted" | "unobserved";

/**
 * How a route may be drawn, from the traffic at its gates:
 *  - interrupted: any gate reads below the neutral band → no pulse.
 *  - flowing: every gate has a current comparison at or above the band → pulse allowed.
 *  - unobserved: no gates, or any gate without a current comparison → static, illustrative.
 * Gate traffic is not route cargo; this only stops the globe implying flow it cannot see.
 */
export function routeFlowState(gates: (GateSignal | undefined)[]): RouteFlowState {
  if (gates.some(g => g?.state === "below")) return "interrupted";
  if (gates.length === 0 || gates.some(g => !g || !hasComparison(g))) return "unobserved";
  return "flowing";
}

/** Lowest gate ratio on a route — the reading that sets an interrupted route's colour. */
export function routeWorstRatio(gates: (GateSignal | undefined)[]): number | null {
  const ratios = gates.map(g => g?.ratio).filter((r): r is number => typeof r === "number");
  return ratios.length ? Math.min(...ratios) : null;
}
