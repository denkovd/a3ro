import type { CorridorMetricLatest, LatestQuote } from "@a3ro/oil-backend";

const DAY = 86_400_000;
/** Observation age, not fetch age. Allow the source's normal publication lag. */
export function metricFreshness(m: Pick<CorridorMetricLatest, "metric" | "periodDate">, now = Date.now()) {
  const chinaMonthly = ["crude_imports", "crude_processing", "crude_production"].includes(m.metric);
  const monthly = m.metric === "bunker_sales" || m.metric === "tanker_arrivals";
  const daily = m.metric.endsWith("_spot");
  // China periods are stored at month start; allow the next release's publication lag and holidays.
  const maxDays = chinaMonthly ? 90 : monthly ? 75 : daily ? 7 : 14;
  const date = Date.parse(`${m.periodDate.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date) && now - date <= maxDays * DAY && date <= now + DAY ? "current" : "stale";
}

export function currentMetrics(metrics: CorridorMetricLatest[] | null, now = Date.now()) {
  return (metrics ?? []).filter(m => Number.isFinite(m.value) && metricFreshness(m, now) === "current");
}

export function quoteStatus(q: LatestQuote | undefined, now = Date.now()) {
  if (!q) return "Unavailable";
  const age = now - Date.parse(q.observedAt);
  if (!Number.isFinite(age) || age > 4 * DAY) return "Stale";
  if ((q.kind === "live" || q.kind === "delayed") && (q.staleness === "stale" || q.staleness === "dead" || age > 30 * 60_000)) return "Last trade";
  if (q.kind === "delayed") return "Delayed";
  if (q.kind === "live") return q.staleness === "aging" || age > 30 * 60_000 ? "Last trade" : "Live";
  return "Settlement";
}

export function comparablePriorClose(q: LatestQuote, prior: { source: string }) {
  // Yahoo supplies front-month futures; EIA/FRED daily prices are physical spot.
  return !(q.source === "yfinance" && ["eia", "fred"].includes(prior.source));
}

export function quoteBasis(q: LatestQuote | undefined) {
  if (!q) return "Price unavailable";
  return q.source === "yfinance" ? "Front-month futures" : ["eia","fred"].includes(q.source) ? "Physical spot" : "Price observation";
}

/** Same-date, same-provider spot comparison; never mix stale or unmatched legs. */
export function crackSpread(metrics: CorridorMetricLatest[] | null, now = Date.now()) {
  const rows = currentMetrics(metrics, now).filter(m => m.corridor === "usgulf");
  const gas = rows.find(m => m.metric === "gasoline_spot");
  const heat = rows.find(m => m.metric === "heating_oil_spot");
  const crude = rows.find(m => m.metric === "wti_spot");
  if (!gas || !heat || !crude || gas.periodDate !== heat.periodDate || gas.periodDate !== crude.periodDate || gas.source !== heat.source || gas.source !== crude.source) return null;
  return { value: (2 * gas.value + heat.value) / 3 - crude.value, periodDate: crude.periodDate, source: crude.source };
}
