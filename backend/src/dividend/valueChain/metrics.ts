import { VALUE_CHAIN_COMPANIES } from "./companies";
import { FINANCIAL_METRICS, type CompanyRead, type DurationFact, type FilingsLayerId, type FinancialMetric, type LayerTotals, type TtmValue, type ValueChainDataset, type ValueChainSnapshot } from "./types";

const DAY = 86_400_000;
const FILING_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "10-KT"]);
/** A company whose latest trailing period ended longer ago than this is shown but left out of layer totals. */
export const STALE_AFTER_DAYS = 200;
export const FILINGS_LAYERS: FilingsLayerId[] = ["energy", "infrastructure", "hyperscalers", "adopters"];

/**
 * XBRL concepts tried for each metric. When a company reports several at the
 * same latest period end, the largest is used: total revenue includes
 * non-contract revenue, and gross capex is the cash actually spent.
 */
export const METRIC_CONCEPTS: Record<FinancialMetric, string[]> = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
  operatingIncome: ["OperatingIncomeLoss"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
};

const time = (date: string) => Date.parse(date + "T00:00:00Z");
const days = (fact: DurationFact) => Math.round((time(fact.end) - time(fact.start)) / DAY) + 1;
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance * DAY;
const isAnnual = (fact: DurationFact) => days(fact) >= 350 && days(fact) <= 380;

/** Keep 10-K/10-Q USD duration facts; for a repeated period keep the latest filing (restatements win). */
export function cleanFacts(raw: unknown): DurationFact[] {
  if (!Array.isArray(raw)) return [];
  const byPeriod = new Map<string, DurationFact>();
  for (const item of raw as Record<string, unknown>[]) {
    const { start, end, val, form, filed } = item ?? {};
    if (typeof start !== "string" || typeof end !== "string" || typeof form !== "string" || typeof filed !== "string") continue;
    if (typeof val !== "number" || !Number.isFinite(val) || !FILING_FORMS.has(form)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || time(end) <= time(start)) continue;
    const key = start + "|" + end;
    const existing = byPeriod.get(key);
    if (!existing || filed > existing.filed) byPeriod.set(key, { start, end, val, form, filed });
  }
  return [...byPeriod.values()];
}

/**
 * Trailing twelve months ending on `end`. 10-Qs report year-to-date figures, so
 * TTM = last full fiscal year + this year-to-date − the same year-to-date a year earlier.
 */
export function ttmAt(facts: DurationFact[], end: string): { value: number; basis: TtmValue["basis"]; filed: string } | null {
  const annual = facts.find(fact => fact.end === end && isAnnual(fact));
  if (annual) return { value: annual.val, basis: "annual", filed: annual.filed };
  const ytd = facts.filter(fact => fact.end === end && days(fact) >= 80 && days(fact) < 350).sort((a, b) => days(b) - days(a))[0];
  if (!ytd) return null;
  const length = days(ytd);
  const prior = facts.find(fact => near(time(fact.end), time(end) - 365 * DAY, 10) && Math.abs(days(fact) - length) <= 10);
  const fiscalYear = facts.find(fact => isAnnual(fact) && near(time(fact.end), time(ytd.start) - DAY, 10));
  if (!prior || !fiscalYear) return null;
  const filed = [ytd.filed, prior.filed, fiscalYear.filed].sort().at(-1)!;
  return { value: fiscalYear.val + ytd.val - prior.val, basis: "derived", filed };
}

/** Latest TTM a concept supports, and the TTM one year before it. */
export function latestTtm(facts: DurationFact[], concept: string): { current: TtmValue; prior: TtmValue | null } | null {
  const ends = [...new Set(facts.map(fact => fact.end))].sort().reverse();
  for (const end of ends) {
    const current = ttmAt(facts, end);
    if (!current) continue;
    const priorEnd = ends.find(candidate => near(time(candidate), time(end) - 365 * DAY, 10));
    const prior = priorEnd ? ttmAt(facts, priorEnd) : null;
    return { current: { ...current, end, concept }, prior: prior && priorEnd ? { ...prior, end: priorEnd, concept } : null };
  }
  return null;
}

/**
 * Companies sometimes move a line to a different XBRL concept part-way through
 * a year (Arista's capex moved from PaymentsToAcquireProductiveAssets to
 * PaymentsToAcquirePropertyPlantAndEquipment in 2026), which leaves neither
 * concept with a complete trailing 12 months. Two concepts are joined only if
 * they report the same value (within 0.5%) for at least one shared period, so
 * a concept that covers a different scope is never mixed in.
 */
export function joinRenamedConcepts(newer: DurationFact[], older: DurationFact[]): DurationFact[] | null {
  const olderByPeriod = new Map(older.map(fact => [fact.start + "|" + fact.end, fact.val]));
  const shared = newer.filter(fact => olderByPeriod.has(fact.start + "|" + fact.end));
  if (!shared.length) return null;
  const same = shared.every(fact => { const other = olderByPeriod.get(fact.start + "|" + fact.end)!; return Math.abs(fact.val - other) <= 0.005 * Math.max(Math.abs(fact.val), Math.abs(other), 1); });
  if (!same) return null;
  const merged = new Map(older.map(fact => [fact.start + "|" + fact.end, fact]));
  for (const fact of newer) merged.set(fact.start + "|" + fact.end, fact);
  return [...merged.values()];
}

type TtmResult = ReturnType<typeof latestTtm>;
const better = (a: TtmResult, b: TtmResult): TtmResult => !b ? a : !a ? b : b.current.end > a.current.end || (b.current.end === a.current.end && b.current.value > a.current.value) ? b : a;

/** Pick the concept with the most recent TTM; on a tie, the largest value. Falls back to joining a renamed concept. */
export function metricFromFacts(usGaap: Record<string, { units?: { USD?: unknown } }> | undefined, metric: FinancialMetric): TtmResult {
  const facts = METRIC_CONCEPTS[metric].map(concept => ({ concept, facts: cleanFacts(usGaap?.[concept]?.units?.USD) })).filter(item => item.facts.length);
  let best: TtmResult = null;
  for (const item of facts) best = better(best, latestTtm(item.facts, item.concept));
  const newestEnd = facts.flatMap(item => item.facts.map(fact => fact.end)).sort().at(-1);
  if (newestEnd && (!best || best.current.end < newestEnd)) {
    for (const newer of facts) for (const older of facts) {
      if (newer === older) continue;
      const joined = joinRenamedConcepts(newer.facts, older.facts);
      if (joined) best = better(best, latestTtm(joined, `${newer.concept} (joined with earlier ${older.concept})`));
    }
  }
  return best;
}

const ratio = (top: number | null | undefined, bottom: number | null | undefined) => top != null && bottom != null && bottom > 0 ? top / bottom : null;
const growth = (current: TtmValue | null, prior: TtmValue | null) => current && prior && prior.value > 0 ? current.value / prior.value - 1 : null;

export function readCompany(company: ValueChainDataset["companies"][number], now: Date): CompanyRead {
  const meta = VALUE_CHAIN_COMPANIES.find(item => item.ticker === company.ticker);
  const { ttm, prior } = company;
  const freeCashFlow = ttm.operatingCashFlow && ttm.capex && ttm.operatingCashFlow.end === ttm.capex.end ? ttm.operatingCashFlow.value - ttm.capex.value : null;
  const marginAligned = ttm.operatingIncome && ttm.revenue && ttm.operatingIncome.end === ttm.revenue.end;
  return {
    ...company,
    name: meta?.name ?? company.entityName,
    role: meta?.role ?? "",
    stale: !company.periodEnd || now.getTime() - time(company.periodEnd) > STALE_AFTER_DAYS * DAY,
    operatingMargin: marginAligned ? ratio(ttm.operatingIncome!.value, ttm.revenue!.value) : null,
    freeCashFlow,
    revenueGrowth: growth(ttm.revenue, prior.revenue),
    capexGrowth: growth(ttm.capex, prior.capex),
  };
}

function sum(values: (number | null | undefined)[]): number | null {
  const present = values.filter((value): value is number => value != null);
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
}

/** Layer totals over non-stale companies. Ratios only use companies that report both sides. */
export function layerTotals(layer: FilingsLayerId, companies: CompanyRead[]): LayerTotals {
  const all = companies.filter(company => company.layer === layer);
  const live = all.filter(company => !company.stale && company.ttm.revenue);
  const withMargin = live.filter(company => company.operatingMargin !== null);
  const withRevenueGrowth = live.filter(company => company.revenueGrowth !== null);
  const withCapexGrowth = live.filter(company => company.capexGrowth !== null);
  const withCapex = live.filter(company => company.ttm.capex);
  const ends = live.map(company => company.periodEnd!).sort();
  const revenue = sum(live.map(company => company.ttm.revenue?.value));
  return {
    layer,
    companies: VALUE_CHAIN_COMPANIES.filter(company => company.layer === layer).length,
    included: live.length,
    revenue,
    revenueGrowth: withRevenueGrowth.length ? ratio(sum(withRevenueGrowth.map(company => company.ttm.revenue!.value)), sum(withRevenueGrowth.map(company => company.prior.revenue!.value)))! - 1 : null,
    operatingIncome: sum(withMargin.map(company => company.ttm.operatingIncome!.value)),
    operatingMargin: ratio(sum(withMargin.map(company => company.ttm.operatingIncome!.value)), sum(withMargin.map(company => company.ttm.revenue!.value))),
    capex: sum(withCapex.map(company => company.ttm.capex!.value)),
    capexGrowth: withCapexGrowth.length ? ratio(sum(withCapexGrowth.map(company => company.ttm.capex!.value)), sum(withCapexGrowth.map(company => company.prior.capex!.value)))! - 1 : null,
    capexIntensity: ratio(sum(withCapex.map(company => company.ttm.capex!.value)), sum(withCapex.map(company => company.ttm.revenue!.value))),
    freeCashFlow: sum(live.map(company => company.freeCashFlow)),
    periodRange: ends.length ? { from: ends[0], to: ends.at(-1)! } : null,
  };
}

export function buildValueChainSnapshot(dataset: ValueChainDataset | null, now = new Date()): ValueChainSnapshot {
  if (!dataset) return { version: 1, status: "unavailable", generatedAt: now.toISOString(), retrievedAt: null, layers: [], companies: [], failures: [] };
  const companies = dataset.companies.map(company => readCompany(company, now));
  const usable = companies.filter(company => !company.stale && company.ttm.revenue).length;
  return {
    version: 1,
    status: usable === 0 ? "unavailable" : usable === VALUE_CHAIN_COMPANIES.length ? "ready" : "partial",
    generatedAt: now.toISOString(),
    retrievedAt: dataset.retrievedAt,
    layers: FILINGS_LAYERS.map(layer => layerTotals(layer, companies)),
    companies,
    failures: dataset.failures,
  };
}

export function emptyMetrics<T>(value: T): Record<FinancialMetric, T> {
  return Object.fromEntries(FINANCIAL_METRICS.map(metric => [metric, value])) as Record<FinancialMetric, T>;
}
