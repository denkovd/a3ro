import type { GoldFlowMetric, GoldFlowData } from "./useGoldFlowData";

const DAY = 86_400_000;

export function reportTime(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : NaN;
}

export function validMetric(raw: unknown): raw is GoldFlowMetric {
  if (!raw || typeof raw !== "object") return false;
  const m = raw as Partial<GoldFlowMetric>;
  return typeof m.value === "number" && Number.isFinite(m.value)
    && typeof m.locus === "string" && typeof m.metric === "string"
    && typeof m.unit === "string" && typeof m.source === "string"
    && typeof m.observedAt === "string" && typeof m.periodDate === "string"
    && Number.isFinite(reportTime(m.periodDate));
}

export function reportStatus(
  metric: GoldFlowMetric | null,
  state: GoldFlowData["status"],
  refreshFailed = false,
  now = Date.now(),
): string {
  if (!metric) return state === "loading" ? "Loading" : "Unavailable";
  const age = now - reportTime(metric.periodDate);
  // Allow weekends/holidays for daily warehouse reports and publication lag for weekly ETFs.
  const allowance = metric.metric.startsWith("comex_") ? 7 : 14;
  return !Number.isFinite(age) || age < -DAY || age > allowance * DAY || refreshFailed
    ? "Outdated" : "Latest report";
}

export function sourceLabel(source: string): string {
  if (/cme|comex/i.test(source)) return "CME warehouse report";
  if (/wgc|goldhub|gold\.org/i.test(source)) return "World Gold Council";
  return source || "Published report";
}

export function sortedHistory(raw: unknown, locus: string, metric: string): GoldFlowMetric[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, GoldFlowMetric>();
  for (const row of raw) {
    if (!validMetric(row) || row.locus !== locus || row.metric !== metric) continue;
    const previous = byDate.get(row.periodDate);
    if (!previous || row.observedAt > previous.observedAt) byDate.set(row.periodDate, row);
  }
  return [...byDate.values()].sort((a, b) => a.periodDate.localeCompare(b.periodDate));
}

export function historyStart(months: number, now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function mineReading(mine: { productionT: number; share: number }, mode: string): string {
  return mode === "production" ? `~${mine.productionT} t/yr` : `~${(mine.share * 100).toFixed(0)}%`;
}
