/**
 * Australia Pulse — a deterministic, descriptive summary of the registry's series.
 *
 * Rules (see docs/australia-watch.md, "Australia Pulse"):
 * - Every number is recomputable by hand from stored observations. No forecasts, no weights.
 * - Direction is the change in each series' charted value (the registry transform) over a
 *   fixed window: 3 months for monthly series, 1 quarter for quarterly series.
 * - Growth diffusion counts LEADING primary series with a growth polarity; inflation diffusion
 *   counts every primary series in the inflation pillar. Steady, unavailable and stale series
 *   are reported but not counted.
 * - Measured lead times are correlations against later changes in the unemployment rate.
 *   They describe history; they do not predict.
 */
import { AUSTRALIA_REGISTRY, PILLAR_LABEL, isAustraliaIndicator, primaryByPillar, type AustraliaIndicatorDef, type AustraliaPillar } from "./registry";
import { estimateFreshness, historicalContext } from "./watch";
import type { AustraliaFrequency, AustraliaIndicator } from "./types";

export const PULSE_ENGINE_VERSION = 1;
export const DIRECTION_WINDOW = { monthly: 3, quarterly: 1 } as const;
/** Changes smaller than this (in the charted unit) count as steady. A$ millions use a wider band. */
export const STEADY_BAND = { default: 0.05, aud_millions: 50 } as const;
/** Measured lead search: 0–18 months, at least 48 pairs, shown only when r ≥ 0.3. */
export const LEAD_SEARCH = { maxLagMonths: 18, minPairs: 48, minCorrelation: 0.3, referenceIndicator: "unemployment_rate", excludeFrom: "2020-03", excludeTo: "2021-12" } as const;

type Row = { indicator: string; referencePeriod: string; value: number; frequency: AustraliaFrequency };
type Schedules = Record<string, { latestReferencePeriod: string | null } | undefined>;
type ContextRows = Parameters<typeof historicalContext>[0];
const defOf = (id: AustraliaIndicator): AustraliaIndicatorDef => AUSTRALIA_REGISTRY[id];

export type Direction = "rising" | "falling" | "steady" | "unavailable";
export interface IndicatorSignal {
  indicator: AustraliaIndicator;
  pillar: AustraliaPillar;
  role: AustraliaIndicatorDef["role"];
  period: string;
  /** Charted value (after transform) at the latest period and at the start of the window. */
  value: number | null;
  windowStartValue: number | null;
  windowStartPeriod: string;
  change: number | null;
  direction: Direction;
  /** +1 the move is growth-positive, -1 growth-negative, 0 steady, null not a growth series or unavailable. */
  growthSignal: 1 | -1 | 0 | null;
  inflationSignal: 1 | -1 | 0 | null;
  stale: boolean;
  z: number | null;
  zPrevious: number | null;
  zChange: number | null;
  unit: string;
}
export interface Diffusion { up: number; down: number; steady: number; excluded: AustraliaIndicator[]; members: AustraliaIndicator[]; share: number | null }
export interface MeasuredLead { lagMonths: number; r: number; pairs: number; from: string; to: string }
export interface Pulse {
  engineVersion: number;
  asOf: string;
  signals: IndicatorSignal[];
  growth: Diffusion;
  inflation: Diffusion;
  quadrant: { growth: "up" | "down" | "mixed" | null; inflation: "up" | "down" | "mixed" | null; label: string };
  pillars: { pillar: AustraliaPillar; label: string; leadingGrowth: Diffusion; directions: Record<Direction, number> }[];
  moved: { indicator: AustraliaIndicator; zChange: number; z: number; period: string }[];
  leads: Partial<Record<AustraliaIndicator, MeasuredLead | null>>;
  coverage: { primary: number; withData: number; stale: AustraliaIndicator[]; missing: AustraliaIndicator[] };
}

/** Shift a YYYY-MM or YYYY-Qn period by n periods of its own frequency. */
export function shiftPeriod(period: string, n: number): string {
  const y = Number(period.slice(0, 4));
  if (period.includes("Q")) {
    const idx = y * 4 + Number(period.slice(-1)) - 1 + n;
    return `${Math.floor(idx / 4)}-Q${(idx % 4 + 4) % 4 + 1}`;
  }
  const idx = y * 12 + Number(period.slice(5)) - 1 + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12 + 12) % 12 + 1).padStart(2, "0")}`;
}

const sign = (v: number): 1 | -1 => (v > 0 ? 1 : -1);

export function indicatorSignal(indicator: AustraliaIndicator, rows: Row[], now = new Date(), schedules: Schedules = {}): IndicatorSignal | null {
  const def: AustraliaIndicatorDef = AUSTRALIA_REGISTRY[indicator];
  const sorted = rows.filter((r) => r.indicator === indicator).sort((a, b) => a.referencePeriod.localeCompare(b.referencePeriod));
  const latest = sorted.at(-1);
  if (!latest) return null;
  const ctx = historicalContext(sorted as ContextRows)!;
  const window = DIRECTION_WINDOW[def.frequency];
  const startPeriod = shiftPeriod(latest.referencePeriod, -window);
  const current = ctx.points.find((p) => p.period === latest.referencePeriod)?.value ?? null;
  const start = ctx.points.find((p) => p.period === startPeriod)?.value ?? null;
  const change = current !== null && start !== null ? current - start : null;
  const band = def.display === "aud_millions" ? STEADY_BAND.aud_millions : STEADY_BAND.default;
  const direction: Direction = change === null ? "unavailable" : Math.abs(change) < band ? "steady" : change > 0 ? "rising" : "falling";
  const signalFor = (polarity: number): 1 | -1 | 0 | null => polarity === 0 || direction === "unavailable" ? null : direction === "steady" ? 0 : (sign(change!) * polarity) as 1 | -1;
  const prevCtx = sorted.length > 1 ? historicalContext(sorted.slice(0, -1) as ContextRows) : null;
  const zPrevious = prevCtx?.z ?? null;
  const stale = estimateFreshness(def.frequency, latest.referencePeriod, now, schedules[indicator]?.latestReferencePeriod ?? null, def.releaseLagDays) === "stale";
  return {
    indicator, pillar: def.pillar, role: def.role, period: latest.referencePeriod, value: current, windowStartValue: start, windowStartPeriod: startPeriod,
    change, direction, growthSignal: signalFor(def.growthPolarity), inflationSignal: signalFor(def.inflationPolarity), stale,
    z: ctx.z, zPrevious, zChange: ctx.z !== null && zPrevious !== null ? ctx.z - zPrevious : null, unit: ctx.unit,
  };
}

function diffuse(signals: IndicatorSignal[], members: AustraliaIndicator[], pick: (s: IndicatorSignal) => 1 | -1 | 0 | null): Diffusion {
  const out: Diffusion = { up: 0, down: 0, steady: 0, excluded: [], members, share: null };
  for (const id of members) {
    const s = signals.find((x) => x.indicator === id);
    const v = s && !s.stale ? pick(s) : null;
    if (v === null) out.excluded.push(id);
    else if (v === 1) out.up += 1;
    else if (v === -1) out.down += 1;
    else out.steady += 1;
  }
  out.share = out.up + out.down > 0 ? out.up / (out.up + out.down) : null;
  return out;
}

/** At least three counted series are needed before an axis of the quadrant is described. */
const axis = (d: Diffusion): "up" | "down" | "mixed" | null =>
  d.up + d.down < 3 || d.share === null ? null : d.share > 0.5 ? "up" : d.share < 0.5 ? "down" : "mixed";

export function quadrantLabel(growth: ReturnType<typeof axis>, inflation: ReturnType<typeof axis>): string {
  if (growth === null || inflation === null) return "Not enough current readings";
  if (growth === "mixed" || inflation === "mixed") return "Mixed readings";
  const g = growth === "up" ? "Leading indicators improving" : "Leading indicators weakening";
  const i = inflation === "up" ? "price pressure building" : "price pressure easing";
  return `${g}, ${i}`;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/**
 * Lag (0–18 months) at which a monthly leading series, signed by its growth polarity, best
 * correlates with the later fall in unemployment (unemployment 12 months earlier minus now).
 * Mar 2020–Dec 2021 is excluded so pandemic swings do not dominate. Null when no lag reaches
 * r ≥ 0.3 with at least 48 pairs.
 */
export function measuredLead(indicator: AustraliaIndicator, rows: Row[]): MeasuredLead | null {
  const def: AustraliaIndicatorDef = AUSTRALIA_REGISTRY[indicator];
  if (def.frequency !== "monthly" || def.role !== "leading" || def.growthPolarity === 0 || indicator === LEAD_SEARCH.referenceIndicator) return null;
  const x = historicalContext(rows.filter((r) => r.indicator === indicator) as ContextRows)?.points ?? [];
  const u = new Map(rows.filter((r) => r.indicator === LEAD_SEARCH.referenceIndicator).map((r) => [r.referencePeriod, r.value]));
  const ref = new Map<string, number>();
  for (const [p, v] of u) { const prior = u.get(shiftPeriod(p, -12)); if (prior !== undefined) ref.set(p, prior - v); }
  const excluded = (p: string) => p >= LEAD_SEARCH.excludeFrom && p <= LEAD_SEARCH.excludeTo;
  let best: MeasuredLead | null = null;
  for (let k = 0; k <= LEAD_SEARCH.maxLagMonths; k++) {
    const xs: number[] = [], ys: number[] = [], periods: string[] = [];
    for (const p of x) {
      const target = shiftPeriod(p.period, k);
      const y = ref.get(target);
      if (y === undefined || excluded(p.period) || excluded(target)) continue;
      xs.push(p.value * def.growthPolarity); ys.push(y); periods.push(p.period);
    }
    if (xs.length < LEAD_SEARCH.minPairs) continue;
    const r = pearson(xs, ys);
    if (r !== null && (best === null || r > best.r)) best = { lagMonths: k, r, pairs: xs.length, from: periods[0], to: periods[periods.length - 1] };
  }
  return best && best.r >= LEAD_SEARCH.minCorrelation ? best : null;
}

export function computePulse(observations: Row[], opts: { now?: Date; schedules?: Schedules } = {}): Pulse {
  const now = opts.now ?? new Date();
  const rows = observations.filter((o) => isAustraliaIndicator(o.indicator));
  const groups = primaryByPillar();
  const primary = groups.flatMap((g) => g.indicators);
  const signals = primary.flatMap((id) => { const s = indicatorSignal(id, rows, now, opts.schedules); return s ? [s] : []; });
  const growthMembers = primary.filter((id) => defOf(id).role === "leading" && defOf(id).growthPolarity !== 0);
  const inflationMembers = primary.filter((id) => defOf(id).pillar === "inflation" && defOf(id).inflationPolarity !== 0);
  const growth = diffuse(signals, growthMembers, (s) => s.growthSignal);
  const inflation = diffuse(signals, inflationMembers, (s) => s.inflationSignal);
  const g = axis(growth), i = axis(inflation);
  const pillars = groups.map(({ pillar, indicators }) => {
    const directions: Record<Direction, number> = { rising: 0, falling: 0, steady: 0, unavailable: 0 };
    for (const id of indicators) directions[signals.find((s) => s.indicator === id)?.direction ?? "unavailable"] += 1;
    return { pillar, label: PILLAR_LABEL[pillar], leadingGrowth: diffuse(signals, indicators.filter((id) => growthMembers.includes(id)), (s) => s.growthSignal), directions };
  });
  const moved = signals.filter((s) => s.zChange !== null && s.z !== null && !s.stale)
    .sort((a, b) => Math.abs(b.zChange!) - Math.abs(a.zChange!) || a.indicator.localeCompare(b.indicator))
    .slice(0, 5).map((s) => ({ indicator: s.indicator, zChange: s.zChange!, z: s.z!, period: s.period }));
  const leads: Pulse["leads"] = {};
  for (const id of growthMembers) leads[id] = measuredLead(id, rows);
  const withData = new Set(signals.map((s) => s.indicator));
  return {
    engineVersion: PULSE_ENGINE_VERSION, asOf: now.toISOString(), signals, growth, inflation,
    quadrant: { growth: g, inflation: i, label: quadrantLabel(g, i) }, pillars, moved, leads,
    coverage: { primary: primary.length, withData: withData.size, stale: signals.filter((s) => s.stale).map((s) => s.indicator), missing: primary.filter((id) => !withData.has(id)) },
  };
}
