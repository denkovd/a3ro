import { CONSTRAINT_SOURCES, type DataCentresPayload, type DroughtPayload, type EiaPayload, type FredPayload, type SignalDatasets, type SignalSource } from "../signals/types";
import type { ValueChainSnapshot } from "../valueChain/types";

/**
 * Constraint gauges read the pressure on the AI build-out:
 *   easy  — not holding it back (a tailwind)
 *   watch — tightening; worth following
 *   tight — likely to slow it or raise its cost (a headwind)
 * Every threshold is written here and shown on the page as the gauge's rule.
 */
export type GaugeStatus = "easy" | "watch" | "tight" | "no_data";
export type GaugeUnit = "%" | "x" | "GW" | "USD/lb" | "USD/t";

export interface GaugeSeries { label: string; points: { period: string; value: number }[] }

export interface Gauge {
  id: "power_demand" | "power_price" | "buildout" | "water" | "uranium" | "copper" | "financing" | "compute";
  title: string;
  question: string;
  status: GaugeStatus;
  value: number | null;
  unit: GaugeUnit | null;
  detail: string;
  rule: string;
  whoGains: string;
  asOf: string | null;
  series: GaugeSeries[];
  source: { label: string; url: string };
}

const band = (value: number | null, watch: number, tight: number): GaugeStatus => value === null || !Number.isFinite(value) ? "no_data" : value >= tight ? "tight" : value >= watch ? "watch" : "easy";
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const monthIndex = (period: string) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;

// ── Electricity (EIA) ────────────────────────────────────────────

function monthly(rows: EiaPayload["rows"], state: string, sector: string, field: "sales" | "price") {
  return rows.filter(row => row.state === state && row.sector === sector && row[field] !== null).map(row => ({ period: row.period, value: row[field]! }));
}

/**
 * Change in the 12-month total (sales) or average (price) ending each month,
 * against the 12 months before. Needs 24 consecutive months.
 */
export function rollingYoY(points: { period: string; value: number }[]): { period: string; value: number }[] {
  const byIndex = new Map(points.map(point => [monthIndex(point.period), point.value]));
  const out: { period: string; value: number }[] = [];
  for (const point of points) {
    const end = monthIndex(point.period);
    let current = 0, prior = 0, complete = true;
    for (let offset = 0; offset < 12 && complete; offset++) {
      const a = byIndex.get(end - offset), b = byIndex.get(end - offset - 12);
      if (a === undefined || b === undefined) complete = false;
      else { current += a; prior += b; }
    }
    if (complete && prior > 0) out.push({ period: point.period, value: round((current / prior - 1) * 100) });
  }
  return out;
}

export function powerDemandGauge(eia: EiaPayload | undefined): Gauge {
  const us = eia ? rollingYoY(monthly(eia.rows, "US", "ALL", "sales")) : [];
  const va = eia ? rollingYoY(monthly(eia.rows, "VA", "COM", "sales")) : [];
  const latest = us.at(-1) ?? null;
  const vaLatest = va.at(-1) ?? null;
  return {
    id: "power_demand", title: "Electricity demand", question: "Is AI pushing up how much power the US uses?",
    status: band(latest?.value ?? null, 1, 2.5), value: latest?.value ?? null, unit: "%", asOf: latest?.period ?? null,
    detail: latest ? `US electricity sales grew ${latest.value.toFixed(1)}% over the last 12 months.${vaLatest ? ` Virginia commercial sales, the clearest data-centre signal (it hosts the world’s largest cluster), grew ${vaLatest.value.toFixed(1)}%.` : ""}` : "EIA data not loaded yet.",
    rule: "US 12-month electricity sales growth: under 1% easy, 1–2.5% watch, 2.5% or more tight. US demand was roughly flat through the 2010s, so sustained growth means new supply has to be built.",
    whoGains: "Tight: power producers and grid-equipment makers (the energy layer) gain pricing power; data-centre projects wait longer for connections.",
    series: [{ label: "US, all sectors", points: us.filter(point => point.period >= "2016-01") }, { label: "Virginia, commercial", points: va.filter(point => point.period >= "2016-01") }].filter(item => item.points.length),
    source: { label: "EIA retail electricity sales", url: "https://www.eia.gov/electricity/data/browser/" },
  };
}

export function powerPriceGauge(eia: EiaPayload | undefined): Gauge {
  const us = eia ? rollingYoY(monthly(eia.rows, "US", "COM", "price")) : [];
  const va = eia ? rollingYoY(monthly(eia.rows, "VA", "COM", "price")) : [];
  const latest = us.at(-1) ?? null;
  const vaLatest = va.at(-1) ?? null;
  return {
    id: "power_price", title: "Electricity prices", question: "Is power getting more expensive for businesses?",
    status: band(latest?.value ?? null, 2.5, 5), value: latest?.value ?? null, unit: "%", asOf: latest?.period ?? null,
    detail: latest ? `US commercial electricity prices are ${latest.value >= 0 ? "up" : "down"} ${Math.abs(latest.value).toFixed(1)}% on the year before (12-month averages).${vaLatest ? ` Virginia: ${vaLatest.value >= 0 ? "+" : "−"}${Math.abs(vaLatest.value).toFixed(1)}%.` : ""}` : "EIA data not loaded yet.",
    rule: "Change in the 12-month average US commercial price: under 2.5% easy, 2.5–5% watch, 5% or more tight.",
    whoGains: "Tight: generators gain; data centres, other businesses and households pay more. Household prices are in the Constraints baseline below.",
    series: [{ label: "US commercial", points: us.filter(point => point.period >= "2016-01") }, { label: "Virginia commercial", points: va.filter(point => point.period >= "2016-01") }].filter(item => item.points.length),
    source: { label: "EIA retail electricity prices", url: "https://www.eia.gov/electricity/data/browser/" },
  };
}

// ── Data-centre build-out and water (Epoch + US Drought Monitor) ──

const totalGw = (sites: DataCentresPayload["sites"]) => sites.reduce((total, site) => total + site.powerMw, 0) / 1000;

export function buildoutGauge(current: { retrievedAt: string; payload: DataCentresPayload } | undefined, previous?: { retrievedAt: string; payload: DataCentresPayload }): Gauge {
  const base = {
    id: "buildout" as const, title: "AI data-centre build-out", question: "How fast is AI computing power being built?",
    rule: "Annualised growth in the power drawn by the frontier AI data centres Epoch tracks: under 20% easy, 20–50% watch, 50% or more tight (that pace strains power, water, chips and finance at once).",
    whoGains: "Tight: chipmakers, builders, equipment and power suppliers; everyone else competes with it for grid capacity.",
    source: { label: "Epoch AI frontier data centres", url: "https://epoch.ai/data/data-centers" }, unit: "GW" as const, series: [],
  };
  if (!current) return { ...base, status: "no_data", value: null, asOf: null, detail: "Epoch data not loaded yet." };
  const sites = current.payload.sites;
  const gw = totalGw(sites);
  const us = sites.filter(site => site.country === "United States");
  const capex = sites.reduce((total, site) => total + (site.capexBn ?? 0), 0);
  const days = previous ? (Date.parse(current.retrievedAt) - Date.parse(previous.retrievedAt)) / 86_400_000 : 0;
  const before = previous ? totalGw(previous.payload.sites) : 0;
  const growth = previous && days >= 90 && before > 0 ? (Math.pow(gw / before, 365 / days) - 1) * 100 : null;
  return {
    ...base, value: round(gw, 1), asOf: current.retrievedAt.slice(0, 10),
    status: band(growth, 20, 50),
    detail: `${sites.length} tracked sites drawing ${gw.toFixed(1)} GW (${Math.round(totalGw(us) / gw * 100)}% in the US), built at about $${Math.round(capex)}B.${growth !== null ? ` Growing ${growth.toFixed(0)}% a year.` : " The growth rate appears once two snapshots are at least three months apart."}`,
  };
}

export function waterGauge(centres: DataCentresPayload | undefined, drought: DroughtPayload | undefined): Gauge {
  const base = {
    id: "water" as const, title: "Water", question: "Are AI data centres being built where water is short?",
    rule: "Share of tracked US data-centre power in states where 25% or more of the land is in severe drought or worse: under 10% easy, 10–30% watch, 30% or more tight.",
    whoGains: "Tight: water-efficient cooling suppliers gain; projects in dry states face local opposition and permit delays, and compete with farms and towns.",
    source: { label: "US Drought Monitor + Epoch AI", url: "https://droughtmonitor.unl.edu/" }, unit: "%" as const, series: [],
  };
  if (!centres || !drought) return { ...base, status: "no_data", value: null, asOf: null, detail: !centres ? "Data-centre locations not loaded yet." : "Drought data not loaded yet." };
  const us = centres.sites.filter(site => site.state);
  const byState = new Map(drought.states.map(item => [item.state, item]));
  const total = us.reduce((sum, site) => sum + site.powerMw, 0);
  const dry = us.filter(site => (byState.get(site.state!)?.severeOrWorse ?? 0) >= 25);
  const share = total > 0 ? dry.reduce((sum, site) => sum + site.powerMw, 0) / total * 100 : null;
  const dryStates = [...new Set(dry.map(site => site.state!))].map(state => `${state} (${Math.round(byState.get(state)!.severeOrWorse)}%)`);
  const asOf = drought.states.map(item => item.date).sort().at(-1) ?? null;
  return {
    ...base, value: share === null ? null : round(share, 1), status: band(share, 10, 30), asOf,
    detail: share === null ? "No tracked US sites with a known state." : dryStates.length ? `${share.toFixed(0)}% of tracked US data-centre power is in states with widespread severe drought: ${dryStates.join(", ")}.` : "None of the tracked US data-centre power is in a state with widespread severe drought right now.",
  };
}

// ── Commodities (IMF via FRED) ───────────────────────────────────

export function commodityGauge(id: "uranium" | "copper", points: { date: string; value: number }[] | undefined): Gauge {
  const meta = id === "uranium"
    ? { title: "Uranium", question: "Is nuclear fuel getting scarce?", unit: "USD/lb" as const, whoGains: "Tight: uranium miners and enrichers (e.g. Centrus in the energy layer) gain; new reactors and restarts that AI firms are signing for cost more.", source: { label: "IMF uranium price (FRED PURANUSDM)", url: "https://fred.stlouisfed.org/series/PURANUSDM" } }
    : { title: "Copper", question: "Is the metal for grids and data centres getting scarce?", unit: "USD/t" as const, whoGains: "Tight: copper miners (e.g. Freeport in the energy layer) gain; grid upgrades and data centres cost more to build.", source: { label: "IMF copper price (FRED PCOPPUSDM)", url: "https://fred.stlouisfed.org/series/PCOPPUSDM" } };
  const rule = "Latest monthly price against its 5-year average: under 1.15× easy, 1.15–1.5× watch, 1.5× or more tight.";
  if (!points || points.length < 60) return { id, ...meta, rule, status: "no_data", value: null, asOf: null, detail: "Price history not loaded yet.", series: [] };
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1)!;
  const window = sorted.slice(-60);
  const average = window.reduce((total, point) => total + point.value, 0) / window.length;
  const yearAgo = sorted.find(point => point.date.slice(0, 7) === `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4, 7)}`);
  const ratio = latest.value / average;
  return {
    id, ...meta, rule, status: band(ratio, 1.15, 1.5), value: round(ratio, 2), asOf: latest.date.slice(0, 7),
    detail: `$${latest.value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${meta.unit.split("/")[1] === "lb" ? "a pound" : "a tonne"}, ${ratio.toFixed(2)}× its 5-year average${yearAgo ? `, ${latest.value >= yearAgo.value ? "up" : "down"} ${Math.abs((latest.value / yearAgo.value - 1) * 100).toFixed(0)}% on a year earlier` : ""}.`,
    series: [{ label: `${meta.title} price`, points: sorted.filter(point => point.date >= "2016-01-01").map(point => ({ period: point.date.slice(0, 7), value: point.value })) }],
  };
}

// ── Financing (value chain) ──────────────────────────────────────

export function financingGauge(valueChain: ValueChainSnapshot | null): Gauge {
  const base = {
    id: "financing" as const, title: "Financing", question: "Can the biggest spenders keep paying for it from their own cash?",
    rule: "Hyperscaler capex as a share of their operating cash flow (last 12 months): under 65% easy, 65–85% watch, 85% or more tight (spending close to all the cash the business makes, so more must come from debt).",
    whoGains: "Tight: lenders and suppliers still get paid, but the build-out becomes sensitive to interest rates and investor patience; a pullback would hit the infrastructure layer first.",
    source: { label: "SEC filings (value chain, step 2)", url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces" }, unit: "x" as const, series: [],
  };
  const companies = valueChain?.companies.filter(company => company.layer === "hyperscalers" && !company.stale && company.ttm.capex && company.ttm.operatingCashFlow) ?? [];
  if (!companies.length) return { ...base, status: "no_data", value: null, asOf: null, detail: "Company filings not loaded yet." };
  const capex = companies.reduce((total, company) => total + company.ttm.capex!.value, 0);
  const cash = companies.reduce((total, company) => total + company.ttm.operatingCashFlow!.value, 0);
  const ratio = cash > 0 ? capex / cash : null;
  const layer = valueChain!.layers.find(item => item.layer === "hyperscalers");
  const highest = [...companies].sort((a, b) => b.ttm.capex!.value / b.ttm.operatingCashFlow!.value - a.ttm.capex!.value / a.ttm.operatingCashFlow!.value)[0];
  return {
    ...base, value: ratio === null ? null : round(ratio, 2), status: band(ratio === null ? null : ratio * 100, 65, 85),
    asOf: companies.map(company => company.periodEnd!).sort().at(-1) ?? null,
    detail: ratio === null ? "Operating cash flow was not positive." : `${companies.length} hyperscalers spent ${Math.round(ratio * 100)}% of their operating cash flow on capex.${layer?.capexGrowth != null && layer.revenueGrowth != null ? ` Capex grew ${Math.round(layer.capexGrowth * 100)}% while revenue grew ${Math.round(layer.revenueGrowth * 100)}%.` : ""} Highest: ${highest.name} at ${Math.round(highest.ttm.capex!.value / highest.ttm.operatingCashFlow!.value * 100)}%.`,
  };
}

export function computeGauge(): Gauge {
  return {
    id: "compute", title: "Chips and memory", question: "Can enough AI chips and memory be made?",
    status: "no_data", value: null, unit: null, asOf: null, series: [],
    detail: "No public, regularly updated data on chip or high-bandwidth-memory lead times. Infrastructure revenue and margins in the value chain (step 2) are the closest public signal: margins near record highs suggest supply is still short.",
    rule: "Not scored: no reliable source.",
    whoGains: "When chips are short, NVIDIA, the memory makers and TSMC capture the most value.",
    source: { label: "Value chain, infrastructure layer", url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces" },
  };
}

export interface ConstraintsSnapshot {
  version: 1;
  generatedAt: string;
  gauges: Gauge[];
  summary: { tight: number; watch: number; easy: number; noData: number };
  /** Last check per constraint source, so an empty gauge says whether its source was never checked or failed. */
  sources: { source: SignalSource; health: "healthy" | "unavailable"; checkedAt: string | null; loaded: boolean }[];
}

export function buildConstraintsSnapshot(datasets: SignalDatasets, previousCentres: SignalDatasets["datacentres"] | undefined, valueChain: ValueChainSnapshot | null, now = new Date(), states: { source: SignalSource; health: "healthy" | "unavailable"; checkedAt: string | null }[] = []): ConstraintsSnapshot {
  const fred = datasets.fred?.payload as FredPayload | undefined;
  const gauges = [
    powerDemandGauge(datasets.eia?.payload),
    powerPriceGauge(datasets.eia?.payload),
    buildoutGauge(datasets.datacentres, previousCentres),
    waterGauge(datasets.datacentres?.payload, datasets.drought?.payload),
    commodityGauge("uranium", fred?.series.uranium),
    commodityGauge("copper", fred?.series.copper),
    financingGauge(valueChain),
    computeGauge(),
  ];
  const count = (status: GaugeStatus) => gauges.filter(gauge => gauge.status === status).length;
  const sources = CONSTRAINT_SOURCES.map(source => {
    const state = states.find(item => item.source === source);
    return { source, health: state?.health ?? "unavailable" as const, checkedAt: state?.checkedAt ?? null, loaded: Boolean(datasets[source]) };
  });
  return { version: 1, generatedAt: now.toISOString(), gauges, summary: { tight: count("tight"), watch: count("watch"), easy: count("easy"), noData: count("no_data") }, sources };
}
