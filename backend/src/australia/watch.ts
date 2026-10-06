import type { AustraliaFrequency, AustraliaIndicator, AustraliaObservation, ObservationFreshness } from "./types";

export const AUSTRALIA_SERIES: Record<AustraliaIndicator, {
  title: string; dataflow: string; key: string; frequency: AustraliaFrequency; adjustment: string;
  unit: string; unitMultiplier: number | null; rollingPeriods: number;
}> = {
  trimmed_mean_cpi_yoy: {
    title: "Trimmed mean CPI — annual change", dataflow: "ABS,CPI_Q,1.0.0", key: "3.999902.20.50.Q",
    frequency: "quarterly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: null, rollingPeriods: 44,
  },
  headline_cpi_yoy: {
    title: "Headline CPI — annual change", dataflow: "ABS,CPI_Q,1.0.0", key: "3.999901.20.50.Q",
    frequency: "quarterly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: null, rollingPeriods: 44,
  },
  unemployment_rate: {
    title: "Unemployment rate", dataflow: "ABS,LF,1.0.0", key: "M13.3.1599.20.AUS.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Percent", unitMultiplier: 0, rollingPeriods: 132,
  },
  hours_worked: {
    title: "Employed persons — monthly hours worked in all jobs", dataflow: "ABS,LF_HOURS,1.0.0", key: "M18.3.1599.TOT.20.AUS.M",
    frequency: "monthly", adjustment: "Seasonally Adjusted", unit: "Hours", unitMultiplier: 3, rollingPeriods: 132,
  },
};

export function startPeriodFor(indicator: AustraliaIndicator, now: Date): string {
  const s = AUSTRALIA_SERIES[indicator];
  if (s.frequency === "monthly") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - s.rollingPeriods, 1));
    return d.toISOString().slice(0, 7);
  }
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - s.rollingPeriods * 3, 1));
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function expectedPeriod(frequency: AustraliaFrequency, now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (frequency === "monthly") {
    const deadline = new Date(Date.UTC(y, m, 21)); // prior month end + estimated 21 days
    const d = new Date(Date.UTC(y, m - (now >= deadline ? 1 : 2), 1));
    return d.toISOString().slice(0, 7);
  }
  const q = Math.floor(m / 3);
  const endMonth = q * 3 + 2;
  const deadline = new Date(Date.UTC(y, q * 3, 45)); // previous quarter end + estimated 45 days
  const d = new Date(Date.UTC(y, endMonth - (now >= deadline ? 3 : 6), 1));
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function estimateFreshness(frequency: AustraliaFrequency, referencePeriod: string | null, now = new Date()): ObservationFreshness {
  if (!referencePeriod) return "unavailable";
  const expected = expectedPeriod(frequency, now);
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

/** Historical context is descriptive. Hours use YoY growth to avoid comparing trending levels to a stationary norm. */
export function historicalContext(rows: Pick<AustraliaObservation, "indicator" | "referencePeriod" | "value" | "frequency">[]) {
  const sorted = [...rows].sort((a,b) => a.referencePeriod.localeCompare(b.referencePeriod));
  const latest = sorted.at(-1);
  if (!latest) return null;
  const hours = latest.indicator === "hours_worked";
  const values = new Map(sorted.map(o => [o.referencePeriod,o.value]));
  const points = sorted.flatMap(o => {
    const priorYear = `${Number(o.referencePeriod.slice(0,4))-1}${o.referencePeriod.slice(4)}`;
    const base = values.get(priorYear);
    if (hours && (base === undefined || base === 0)) return [];
    return [{period:o.referencePeriod,value:hours ? (o.value / base! - 1)*100 : o.value}];
  });
  const current = points.find(p => p.period === latest.referencePeriod);
  if (!current) return {points,baseline:[],mean:null,sd:null,z:null,direction:"Unavailable",unit:hours?"% YoY":"%"};
  const lower = `${Number(current.period.slice(0,4))-10}${current.period.slice(4)}`;
  const baseline = points.filter(p => p.period >= lower && p.period < current.period);
  const minimum = latest.frequency === "monthly" ? 60 : 20;
  const mean = baseline.length >= minimum ? baseline.reduce((s,p)=>s+p.value,0)/baseline.length : null;
  const sd = mean === null ? null : Math.sqrt(baseline.reduce((s,p)=>s+(p.value-mean)**2,0)/(baseline.length-1));
  const priorPeriod = latest.frequency === "quarterly"
    ? (current.period.endsWith("Q1") ? `${Number(current.period.slice(0,4))-1}-Q4` : `${current.period.slice(0,6)}${Number(current.period.at(-1))-1}`)
    : new Date(Date.UTC(Number(current.period.slice(0,4)),Number(current.period.slice(5))-2,1)).toISOString().slice(0,7);
  const previous = points.find(p=>p.period===priorPeriod);
  const direction = !previous ? "Unavailable" : Math.abs(current.value-previous.value)<0.05 ? "Broadly steady" : current.value > previous.value ? "Rising" : "Falling";
  return {points,baseline,mean,sd,z:sd && mean!==null ? (current.value-mean)/sd : null,direction,unit:hours?"% YoY":"%"};
}
