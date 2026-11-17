import type { AustraliaFrequency, AustraliaIndicator, AustraliaObservation, ObservationFreshness } from "./types";
import { AUSTRALIA_REGISTRY } from "./registry";

/** @deprecated use AUSTRALIA_REGISTRY from ./registry. Kept so existing imports keep working. */
export const AUSTRALIA_SERIES = AUSTRALIA_REGISTRY;

const DEFAULT_LAG_DAYS: Record<AustraliaFrequency, number> = { monthly: 21, quarterly: 45 };

export function startPeriodFor(indicator: AustraliaIndicator, now: Date): string {
  const s = AUSTRALIA_REGISTRY[indicator];
  if (s.frequency === "monthly") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - s.rollingPeriods, 1));
    return d.toISOString().slice(0, 7);
  }
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - s.rollingPeriods * 3, 1));
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function expectedPeriod(frequency: AustraliaFrequency, now: Date, lagDays = DEFAULT_LAG_DAYS[frequency]): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (frequency === "monthly") {
    const deadline = new Date(Date.UTC(y, m, lagDays)); // prior month end + estimated lag
    const d = new Date(Date.UTC(y, m - (now >= deadline ? 1 : 2), 1));
    return d.toISOString().slice(0, 7);
  }
  const q = Math.floor(m / 3);
  const endMonth = q * 3 + 2;
  const deadline = new Date(Date.UTC(y, q * 3, lagDays)); // previous quarter end + estimated lag
  const d = new Date(Date.UTC(y, endMonth - (now >= deadline ? 3 : 6), 1));
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** Release-based when the ABS calendar supplied the published period; otherwise an estimated lag (per indicator when given). */
export function estimateFreshness(frequency: AustraliaFrequency, referencePeriod: string | null, now = new Date(), publishedPeriod?: string | null, lagDays?: number): ObservationFreshness {
  if (!referencePeriod) return "unavailable";
  const expected = publishedPeriod ?? expectedPeriod(frequency, now, lagDays);
  if (referencePeriod >= expected) return "fresh";
  const gap = frequency === "monthly"
    ? (Number(expected.slice(0, 4)) - Number(referencePeriod.slice(0, 4))) * 12 + Number(expected.slice(5)) - Number(referencePeriod.slice(5))
    : (Number(expected.slice(0, 4)) - Number(referencePeriod.slice(0, 4))) * 4 + Number(expected.slice(-1)) - Number(referencePeriod.slice(-1));
  return gap === 1 ? "aging" : "stale";
}

export function comparableChange(rows: AustraliaObservation[]): { current: AustraliaObservation; previous: AustraliaObservation | null; delta: number | null } | null {
  const sorted = [...rows].sort((a, b) => b.referencePeriod.localeCompare(a.referencePeriod));
  const current = sorted[0];
  if (!current) return null;
  const previous = sorted.find((r) => r.referencePeriod < current.referencePeriod) ?? null;
  return { current, previous, delta: previous ? current.value - previous.value : null };
}

export function isRevision(previous: Pick<AustraliaObservation, "value" | "unit" | "unitMultiplier" | "sourceStatus" | "sourceComment">, next: Pick<AustraliaObservation, "value" | "unit" | "unitMultiplier" | "sourceStatus" | "sourceComment">): boolean {
  return previous.value !== next.value || previous.unit !== next.unit || previous.unitMultiplier !== next.unitMultiplier || previous.sourceStatus !== next.sourceStatus || previous.sourceComment !== next.sourceComment;
}

/**
 * Historical context is descriptive. Level-trending series (transform "yoy_from_level", e.g. hours)
 * use YoY growth to avoid comparing trending levels to a stationary norm. The baseline window and
 * the minimum sample come from the registry, so short-history series (monthly CPI) withhold a norm.
 */
export function historicalContext(rows: Pick<AustraliaObservation, "indicator" | "referencePeriod" | "value" | "frequency">[]) {
  const sorted = [...rows].sort((a,b) => a.referencePeriod.localeCompare(b.referencePeriod));
  const latest = sorted.at(-1);
  if (!latest) return null;
  const def = AUSTRALIA_REGISTRY[latest.indicator as AustraliaIndicator];
  const growth = def?.transform === "yoy_from_level";
  const baselineYears = def?.baselineYears ?? 10;
  const minimum = def?.minimumBaseline ?? (latest.frequency === "monthly" ? 60 : 20);
  const unit = growth ? "% YoY" : "%";
  const values = new Map(sorted.map(o => [o.referencePeriod,o.value]));
  const points = sorted.flatMap(o => {
    const priorYear = `${Number(o.referencePeriod.slice(0,4))-1}${o.referencePeriod.slice(4)}`;
    const base = values.get(priorYear);
    if (growth && (base === undefined || base === 0)) return [];
    return [{period:o.referencePeriod,value:growth ? (o.value / base! - 1)*100 : o.value}];
  });
  const current = points.find(p => p.period === latest.referencePeriod);
  if (!current) return {points,baseline:[],mean:null,sd:null,z:null,direction:"Unavailable",unit,minimum,baselineYears};
  const lower = `${Number(current.period.slice(0,4))-baselineYears}${current.period.slice(4)}`;
  const baseline = points.filter(p => p.period >= lower && p.period < current.period);
  const mean = baseline.length >= minimum ? baseline.reduce((s,p)=>s+p.value,0)/baseline.length : null;
  const sd = mean === null ? null : Math.sqrt(baseline.reduce((s,p)=>s+(p.value-mean)**2,0)/(baseline.length-1));
  const priorPeriod = latest.frequency === "quarterly"
    ? (current.period.endsWith("Q1") ? `${Number(current.period.slice(0,4))-1}-Q4` : `${current.period.slice(0,6)}${Number(current.period.at(-1))-1}`)
    : new Date(Date.UTC(Number(current.period.slice(0,4)),Number(current.period.slice(5))-2,1)).toISOString().slice(0,7);
  const previous = points.find(p=>p.period===priorPeriod);
  const direction = !previous ? "Unavailable" : Math.abs(current.value-previous.value)<0.05 ? "Broadly steady" : current.value > previous.value ? "Rising" : "Falling";
  return {points,baseline,mean,sd,z:sd && mean!==null ? (current.value-mean)/sd : null,direction,unit,minimum,baselineYears};
}
