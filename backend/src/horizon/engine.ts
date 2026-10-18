import { HORIZON_INDICATORS, HORIZON_SOURCES } from "./indicators";
import type { HorizonDataset, HorizonFrequency, HorizonFreshness, HorizonPoint, HorizonSnapshot, HorizonSourceState } from "./types";

export function horizonDatasetComplete(dataset: HorizonDataset): boolean {
  return HORIZON_INDICATORS.filter(indicator => indicator.source === dataset.source).every(indicator => dataset.series.some(series => series.key === indicator.key && series.points.length > 0));
}

export function horizonPeriodEnd(period: string, frequency: HorizonFrequency): Date | null {
  const pattern = frequency === "annual" ? /^(\d{4})$/ : frequency === "quarterly" ? /^(\d{4})-Q([1-4])$/ : /^(\d{4})-(0[1-9]|1[0-2])$/;
  const match = period.match(pattern);
  if (!match) return null;
  const month = frequency === "annual" ? 12 : frequency === "quarterly" ? Number(match[2]) * 3 : Number(match[2]);
  return new Date(Date.UTC(Number(match[1]), month, 0));
}

export function horizonFreshness(period: string | null, frequency: HorizonFrequency, now = new Date()): HorizonFreshness {
  if (!period) return "unavailable";
  const end = horizonPeriodEnd(period, frequency);
  if (!end || end > now) return "unavailable";
  const age = (now.getTime() - end.getTime()) / 86_400_000;
  const limits = { monthly: [75, 110], quarterly: [170, 230], annual: [660, 790] }[frequency];
  return age <= limits[0] ? "current" : age <= limits[1] ? "aging" : "stale";
}

export function annualHorizonChange(points: HorizonPoint[], kind: "percent" | "percentage_points"): { value: number | null; fromPeriod: string | null } {
  const latest = points.at(-1);
  if (!latest) return { value: null, fromPeriod: null };
  const priorPeriod = String(Number(latest.period.slice(0, 4)) - 1) + latest.period.slice(4);
  const previous = points.find(point => point.period === priorPeriod);
  if (!previous || (kind === "percent" && previous.value <= 0)) return { value: null, fromPeriod: null };
  return { value: kind === "percentage_points" ? latest.value - previous.value : (latest.value / previous.value - 1) * 100, fromPeriod: previous.period };
}

export function buildHorizonSnapshot(datasets: HorizonDataset[], states: HorizonSourceState[], now = new Date(), archive: HorizonSnapshot["archive"] = "unavailable"): HorizonSnapshot {
  const indicators = HORIZON_INDICATORS.map(indicator => {
    const dataset = datasets.find(item => item.source === indicator.source);
    const state = states.find(item => item.source === indicator.source);
    const byPeriod = new Map<string, HorizonPoint>();
    for (const point of dataset?.series.find(item => item.key === indicator.key)?.points ?? []) {
      const end = horizonPeriodEnd(point.period, indicator.frequency);
      if (Number.isFinite(point.value) && end && end <= now) byPeriod.set(point.period, point);
    }
    const points = [...byPeriod.values()].sort((first, second) => first.period.localeCompare(second.period));
    const latest = points.at(-1) ?? null;
    const change = annualHorizonChange(points, indicator.change);
    return {
      ...indicator, points, latest, annualChange: change.value, changeFromPeriod: change.fromPeriod,
      freshness: horizonFreshness(latest?.period ?? null, indicator.frequency, now),
      verifiedAt: dataset?.retrievedAt ?? null, publicationDate: dataset?.publicationDate ?? null,
      dataUrl: dataset?.dataUrl ?? null, sourceHealth: state?.health ?? "unavailable" as const,
    };
  });
  const available = indicators.filter(indicator => indicator.latest !== null).length;
  return {
    version: 1, stage: 1, generatedAt: now.toISOString(), archive,
    status: available === 0 ? "unavailable" : available === indicators.length ? "ready" : "partial",
    indicators,
    sources: HORIZON_SOURCES.map(source => states.find(state => state.source === source) ?? { source, health: "unavailable", checkedAt: null, error: null }),
    coverage: { available, current: indicators.filter(indicator => indicator.freshness === "current" && indicator.sourceHealth === "healthy").length, total: indicators.length },
  };
}
