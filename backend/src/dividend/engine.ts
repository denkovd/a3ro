import { DIVIDEND_INDICATORS, DIVIDEND_SOURCES } from "./indicators";
import type { DividendDataset, DividendFrequency, DividendFreshness, DividendPoint, DividendSnapshot, DividendSourceState } from "./types";

export function dividendDatasetComplete(dataset: DividendDataset): boolean {
  return DIVIDEND_INDICATORS.filter(indicator => indicator.source === dataset.source).every(indicator => dataset.series.some(series => series.key === indicator.key && series.points.length > 0));
}

export function dividendPeriodEnd(period: string, frequency: DividendFrequency): Date | null {
  const pattern = frequency === "annual" ? /^(\d{4})$/ : frequency === "quarterly" ? /^(\d{4})-Q([1-4])$/ : /^(\d{4})-(0[1-9]|1[0-2])$/;
  const match = period.match(pattern);
  if (!match) return null;
  const month = frequency === "annual" ? 12 : frequency === "quarterly" ? Number(match[2]) * 3 : Number(match[2]);
  return new Date(Date.UTC(Number(match[1]), month, 0));
}

export function dividendFreshness(period: string | null, frequency: DividendFrequency, now = new Date()): DividendFreshness {
  if (!period) return "unavailable";
  const end = dividendPeriodEnd(period, frequency);
  if (!end || end > now) return "unavailable";
  const age = (now.getTime() - end.getTime()) / 86_400_000;
  const limits = { monthly: [75, 110], quarterly: [170, 230], annual: [660, 790] }[frequency];
  return age <= limits[0] ? "current" : age <= limits[1] ? "aging" : "stale";
}

export function annualDividendChange(points: DividendPoint[], kind: "percent" | "percentage_points"): { value: number | null; fromPeriod: string | null } {
  const latest = points.at(-1);
  if (!latest) return { value: null, fromPeriod: null };
  const priorPeriod = String(Number(latest.period.slice(0, 4)) - 1) + latest.period.slice(4);
  const previous = points.find(point => point.period === priorPeriod);
  if (!previous || (kind === "percent" && previous.value <= 0)) return { value: null, fromPeriod: null };
  return { value: kind === "percentage_points" ? latest.value - previous.value : (latest.value / previous.value - 1) * 100, fromPeriod: previous.period };
}

export function buildDividendSnapshot(datasets: DividendDataset[], states: DividendSourceState[], now = new Date(), archive: DividendSnapshot["archive"] = "unavailable"): DividendSnapshot {
  const indicators = DIVIDEND_INDICATORS.map(indicator => {
    const dataset = datasets.find(item => item.source === indicator.source);
    const state = states.find(item => item.source === indicator.source);
    const byPeriod = new Map<string, DividendPoint>();
    for (const point of dataset?.series.find(item => item.key === indicator.key)?.points ?? []) {
      const end = dividendPeriodEnd(point.period, indicator.frequency);
      if (Number.isFinite(point.value) && end && end <= now) byPeriod.set(point.period, point);
    }
    const points = [...byPeriod.values()].sort((first, second) => first.period.localeCompare(second.period));
    const latest = points.at(-1) ?? null;
    const change = annualDividendChange(points, indicator.change);
    return {
      ...indicator, points, latest, annualChange: change.value, changeFromPeriod: change.fromPeriod,
      freshness: dividendFreshness(latest?.period ?? null, indicator.frequency, now),
      verifiedAt: dataset?.retrievedAt ?? null, publicationDate: dataset?.publicationDate ?? null,
      dataUrl: dataset?.dataUrl ?? null, sourceHealth: state?.health ?? "unavailable" as const,
    };
  });
  const available = indicators.filter(indicator => indicator.latest !== null).length;
  return {
    version: 1, stage: 1, generatedAt: now.toISOString(), archive,
    status: available === 0 ? "unavailable" : available === indicators.length ? "ready" : "partial",
    indicators,
    sources: DIVIDEND_SOURCES.map(source => states.find(state => state.source === source) ?? { source, health: "unavailable", checkedAt: null, error: null }),
    coverage: { available, current: indicators.filter(indicator => indicator.freshness === "current" && indicator.sourceHealth === "healthy").length, total: indicators.length },
  };
}
