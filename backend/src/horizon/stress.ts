import { horizonFreshness, horizonPeriodEnd } from "./engine";
import { HORIZON_INDICATORS } from "./indicators";
import type { HorizonFrequency, HorizonPoint, HorizonSnapshot } from "./types";
import type { HorizonScenarioRun } from "./scenarios";

export const HORIZON_STRESS_VERSION = "horizon-stress-1.0.0";
export const STRESS_SETTING_RULES = {
  compensationFloor: { label: "Real compensation annual-change floor", min: -1, max: 1, step: 0.1, unit: "%" },
  unemploymentRise: { label: "Unemployment annual rise", min: 0.1, max: 1, step: 0.1, unit: "pp" },
  electricityRise: { label: "Electricity annual-price rise", min: 2, max: 10, step: 0.5, unit: "%" },
  wealthRise: { label: "Top 1% annual wealth-share rise", min: 0.1, max: 2, step: 0.1, unit: "pp" },
} as const;
export type StressSettingKey = keyof typeof STRESS_SETTING_RULES;
export type StressSettings = Record<StressSettingKey, number>;
export const DEFAULT_STRESS_SETTINGS: StressSettings = { compensationFloor: 0, unemploymentRise: 0.3, electricityRise: 4, wealthRise: 0.5 };
export type StressStatus = "watch" | "developing" | "no_flag" | "unverified" | "needs_data";
export const STRESS_STATUS_LABELS: Record<StressStatus, string> = { watch: "Proxy watch", developing: "Partial signal", no_flag: "No rule flag", unverified: "Cannot verify", needs_data: "Needs evidence" };

export interface StressSample {
  period: string;
  value: number | null;
  comparisonPeriod: string;
  comparisonValue: number | null;
  change: number | null;
  passes: boolean | null;
  sourceStatus: string | null;
}

export interface StressEvidence {
  key: string;
  title: string;
  frequency: HorizonFrequency;
  unit: "%" | "pp";
  sourceUrl: string;
  sourceSeries: string;
  verifiedAt: string | null;
  latestPeriod: string | null;
  samples: StressSample[];
  complete: boolean;
  persistent: boolean;
  issues: string[];
}

export interface StressWatch {
  id: string;
  title: string;
  scope: string;
  constraint: string;
  trigger: string;
  transmission: string;
  confirmation: string;
  relief: string;
  limitation: string;
  status: StressStatus;
  rawStatus: StressStatus;
  evidence: StressEvidence[];
}

export interface StressAssessment {
  ruleVersion: typeof HORIZON_STRESS_VERSION;
  evaluatedAt: string;
  snapshotGeneratedAt: string;
  settings: StressSettings;
  watches: StressWatch[];
}

export function validateStressSettings(input: unknown): StressSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid stress settings.");
  const values = input as Record<string, unknown>;
  if (Object.keys(values).some(key => !Object.hasOwn(STRESS_SETTING_RULES, key))) throw new Error("Unknown stress setting.");
  const result = {} as StressSettings;
  for (const key of Object.keys(STRESS_SETTING_RULES) as StressSettingKey[]) {
    const value = values[key];
    const rule = STRESS_SETTING_RULES[key];
    if (!Object.hasOwn(values, key) || typeof value !== "number" || !Number.isFinite(value) || value < rule.min || value > rule.max) throw new Error(`${key} is outside its allowed range.`);
    result[key] = value;
  }
  return result;
}

export function shiftHorizonPeriod(period: string, frequency: "quarterly" | "monthly", offset: number): string {
  if (!Number.isInteger(offset) || !horizonPeriodEnd(period, frequency)) throw new Error("Invalid period shift.");
  const count = frequency === "quarterly" ? 4 : 12;
  const index = Number(period.slice(0, 4)) * count + Number(period.slice(frequency === "quarterly" ? -1 : -2)) - 1 + offset;
  const year = Math.floor(index / count);
  const position = index - year * count + 1;
  return frequency === "quarterly" ? `${year}-Q${position}` : `${year}-${String(position).padStart(2, "0")}`;
}

export function stressSeries(snapshot: HorizonSnapshot, key: string, evaluatedAt: string): HorizonPoint[] {
  const definition = HORIZON_INDICATORS.find(item => item.key === key);
  const reading = snapshot.indicators.find(item => item.key === key);
  if (!definition || !reading || reading.frequency !== definition.frequency || reading.unit !== definition.unit) return [];
  const points = new Map<string, HorizonPoint>();
  for (const point of reading.points) {
    const end = horizonPeriodEnd(point.period, definition.frequency);
    if (end && end.getTime() <= Date.parse(evaluatedAt) && Number.isFinite(point.value) && (definition.unit === "percent" ? point.value >= 0 && point.value <= 100 : point.value > 0)) points.set(point.period, point);
  }
  return [...points.values()].sort((first, second) => first.period.localeCompare(second.period));
}

export function stressEvidenceIssues(snapshot: HorizonSnapshot, key: string, evaluatedAt: string): string[] {
  const reading = snapshot.indicators.find(item => item.key === key);
  const latest = stressSeries(snapshot, key, evaluatedAt).at(-1);
  const issues: string[] = [];
  const now = Date.parse(evaluatedAt);
  if (!Number.isFinite(Date.parse(snapshot.generatedAt)) || Date.parse(snapshot.generatedAt) > now) issues.push("Snapshot date is invalid or later than the assessment.");
  if (!reading || !latest) return [...issues, "No valid observations."];
  if (reading.sourceHealth !== "healthy" || snapshot.sources.find(source => source.source === reading.source)?.health !== "healthy") issues.push("The source is not verified healthy.");
  if (horizonFreshness(latest.period, reading.frequency, new Date(evaluatedAt)) !== "current") issues.push("The latest observation is outside the current freshness window.");
  const verified = Date.parse(reading.verifiedAt ?? "");
  if (!Number.isFinite(verified) || verified > now || now - verified > 7 * 86_400_000) issues.push("Successful source verification is missing, future-dated or over seven days old.");
  return issues;
}

function evidence(snapshot: HorizonSnapshot, key: string, count: number, evaluatedAt: string, test: (change: number) => boolean): StressEvidence {
  const definition = HORIZON_INDICATORS.find(item => item.key === key)!;
  const reading = snapshot.indicators.find(item => item.key === key);
  const points = stressSeries(snapshot, key, evaluatedAt);
  const latest = points.at(-1);
  const byPeriod = new Map(points.map(point => [point.period, point]));
  const frequency = definition.frequency as "quarterly" | "monthly";
  const samples: StressSample[] = latest ? Array.from({ length: count }, (_, index) => {
    const period = shiftHorizonPeriod(latest.period, frequency, index - count + 1);
    const comparisonPeriod = shiftHorizonPeriod(period, frequency, frequency === "quarterly" ? -4 : -12);
    const point = byPeriod.get(period);
    const prior = byPeriod.get(comparisonPeriod);
    const change = point && prior ? definition.change === "percentage_points" ? point.value - prior.value : (point.value / prior.value - 1) * 100 : null;
    return { period, value: point?.value ?? null, comparisonPeriod, comparisonValue: prior?.value ?? null, change, passes: change === null ? null : test(change), sourceStatus: point?.status ?? null };
  }) : [];
  const complete = samples.length === count && samples.every(sample => sample.change !== null);
  const issues = stressEvidenceIssues(snapshot, key, evaluatedAt);
  if (!complete) issues.push(`Exact prior-year comparisons are required for ${count} consecutive ${frequency === "monthly" ? "months" : "quarters"}.`);
  return { key, title: definition.title, frequency, unit: definition.change === "percentage_points" ? "pp" : "%", sourceUrl: definition.sourceUrl, sourceSeries: definition.sourceSeries, verifiedAt: reading?.verifiedAt ?? null, latestPeriod: latest?.period ?? null, samples, complete, persistent: complete && samples.every(sample => sample.passes), issues };
}

function setWatchState(watch: Omit<StressWatch, "status" | "rawStatus">): StressWatch {
  const rawStatus = watch.evidence.some(item => !item.complete) ? "unverified" : watch.evidence.every(item => item.persistent) ? "watch" : watch.evidence.some(item => item.samples.some(sample => sample.passes)) ? "developing" : "no_flag";
  return { ...watch, rawStatus, status: watch.evidence.some(item => item.issues.length > 0) ? "unverified" : rawStatus };
}

const GAPS: Omit<StressWatch, "status" | "rawStatus" | "evidence">[] = [
  { id: "cash_budgets", title: "Matched household purchasing power", scope: "US household groups · not yet measurable", constraint: "Cash income and essential expenses are not matched for the same households.", trigger: "Requires a compatible real cash-budget series plus independent employment or distress deterioration, at an explicitly matched frequency.", transmission: "Less room after essentials can reduce discretionary consumption or increase arrears.", confirmation: "Matched spending room deteriorates persistently alongside independent hours, employment or arrears evidence.", relief: "Sustained recovery in matched real cash income or lower essential burden, with distress easing.", limitation: "BEA national-accounts median income, BLS average compensation and synthetic budgets cannot substitute for matched cash data." },
  { id: "regional_power", title: "Regional power deliverability", scope: "Regional grids · no verified location feed", constraint: "No commissioned dependable-capacity, peak-load and operator-threshold series is connected.", trigger: "Requires a named region and its operator's reserve/reliability standard, not a global price index.", transmission: "Connection delays, curtailment or local price pressure can restrict productive use.", confirmation: "Operator evidence of inadequate reserves, actual connection delays or sustained local delivery pressure.", relief: "Commissioned accredited capacity, verified demand response, restored transmission or lower actual load.", limitation: "Electricity CPI does not establish a grid shortage. Scenario energy indices are not MW, TWh or reliability estimates." },
  { id: "hydrocarbons", title: "Oil and gas replacement pressure", scope: "Oil and gas separately · regional feeds needed", constraint: "No reconciled field decline, additions, outages, spare capacity and demand ledger is connected.", trigger: "Requires a commodity-specific replacement or delivery shortfall, then inventory/spare-capacity confirmation.", transmission: "Higher delivered fuel costs can reach transport, industrial inputs and household essentials.", confirmation: "Persistent regional inventory depletion or spare-capacity pressure alongside a verified supply/demand imbalance.", relief: "Verified new supply, restored routes, substitution or weaker demand.", limitation: "No geological depletion date or hydrocarbon wall is inferred from reserves ratios or AI demand." },
  { id: "ai_economics", title: "AI investment economics", scope: "Firms and projects · no reconciled cash-flow feed", constraint: "Commitments, realised revenue, utilisation, debt and cash generation are not linked.", trigger: "Requires dated firm/project economics with consistent scope and no duplicated facilities.", transmission: "Unsustainable returns or funding needs can cause cancellations, impairments or lower deployment.", confirmation: "Verified underutilisation, cancellations, impairments or financing distress rather than announced capex alone.", relief: "Paid demand, improving unit economics and sufficient realised cash generation.", limitation: "High investment or a strong technology narrative alone is not a distress signal or a buy/sell rule." },
  { id: "policy_delivery", title: "Institutional delivery", scope: "Named policies and beneficiaries · register needed", constraint: "No funded enactment, delivery deadline and beneficiary-uptake register is connected.", trigger: "Requires an enacted, financed commitment and an observable missed delivery milestone.", transmission: "Delayed support, retraining or infrastructure can prolong household or productive-capacity pressure.", confirmation: "The stated delivery window is missed and the targeted pressure persists in compatible outcome data.", relief: "Actual funded delivery and measured beneficiary uptake/outcome improvement.", limitation: "Announcements and modelled transfers do not establish a delivered policy response." },
];

export function evaluateHorizonStress(snapshot: HorizonSnapshot, input: unknown, evaluatedAt: string): StressAssessment {
  if (!Number.isFinite(Date.parse(evaluatedAt))) throw new Error("A valid assessment date is required.");
  const settings = validateStressSettings(input);
  const wealthTop = evidence(snapshot, "wealth_top1", 2, evaluatedAt, value => value >= settings.wealthRise - 1e-9);
  const wealthBottom = evidence(snapshot, "wealth_bottom50", 2, evaluatedAt, value => value <= 1e-9);
  if (wealthTop.latestPeriod !== wealthBottom.latestPeriod) {
    for (const item of [wealthTop, wealthBottom]) {
      item.complete = false;
      item.issues.push("Both wealth series must end in the same quarter.");
    }
  }
  const watches: StressWatch[] = [
    setWatchState({ id: "worker_proxy", title: "Worker purchasing-power proxy", scope: "US nonfarm business workers + national civilian labour force", constraint: "Weak real hourly compensation combined with persistent labour-market deterioration.", trigger: `Compensation annual change < ${settings.compensationFloor}% for two consecutive quarters AND unemployment annual rise ≥ ${settings.unemploymentRise} pp for three consecutive months.`, transmission: "Weaker compensation and employment conditions can pressure worker purchasing power.", confirmation: "Both separately dated proxy conditions persist; a confirmed household-budget watch still requires matched cash/expense or distress evidence.", relief: "Either persistent proxy condition ceases with fresh, healthy, complete source data. That retracts this rule, not proof of broad recovery.", limitation: "Compensation includes benefits and is an average; unemployment uses a different population. This is not matched household spending room, a recession declaration or AI attribution.", evidence: [evidence(snapshot, "real_compensation", 2, evaluatedAt, value => value < settings.compensationFloor - 1e-9), evidence(snapshot, "unemployment", 3, evaluatedAt, value => value >= settings.unemploymentRise - 1e-9)] }),
    setWatchState({ id: "electricity_proxy", title: "Household electricity-price pressure", scope: "US urban consumers · electricity CPI-U", constraint: "Persistent nominal electricity-price growth above the selected screening threshold.", trigger: `Electricity annual-price change ≥ ${settings.electricityRise}% for three consecutive months.`, transmission: "Higher bills may burden energy-intensive household budgets, depending on income, contracts and usage.", confirmation: "The price condition persists. Real affordability and regional grid adequacy require separate evidence.", relief: "The three-month price rule ceases on fresh, healthy, complete data; lower inflation does not mean the price level has fallen.", limitation: "Nominal component inflation is not a real bill, a wholesale power price, or proof of grid scarcity.", evidence: [evidence(snapshot, "electricity_prices", 3, evaluatedAt, value => value >= settings.electricityRise - 1e-9)] }),
    setWatchState({ id: "ownership_proxy", title: "Wealth concentration drift", scope: "US households ranked by net worth · top 1% and bottom 50%", constraint: "Top wealth share rising while the bottom wealth share does not improve.", trigger: `Top 1% annual wealth-share rise ≥ ${settings.wealthRise} pp AND bottom 50% annual change ≤ 0 pp, in each of two consecutive quarters.`, transmission: "Different ownership exposures can amplify divergence in asset-linked income and financial buffers.", confirmation: "Both distribution conditions persist. A claim about lower/middle living standards still needs separate compatible income/budget outcomes.", relief: "Either distribution condition ceases on fresh, healthy, complete data; this does not establish that every household improves.", limitation: "Net worth is not cash income. Wealth ranks change membership and differ from income ranks; a share shift does not identify AI causation.", evidence: [wealthTop, wealthBottom] }),
    ...GAPS.map(gap => ({ ...gap, evidence: [], status: "needs_data" as const, rawStatus: "needs_data" as const })),
  ];
  return { ruleVersion: HORIZON_STRESS_VERSION, evaluatedAt, snapshotGeneratedAt: snapshot.generatedAt, settings, watches };
}

export function retrospectiveStressDiagnostics(snapshot: HorizonSnapshot, settings: StressSettings, evaluatedAt: string) {
  return stressSeries(snapshot, "real_compensation", evaluatedAt).slice(-8).map(point => {
    const cutoff = horizonPeriodEnd(point.period, "quarterly")!.toISOString();
    const assessment = evaluateHorizonStress(snapshot, settings, cutoff);
    return { period: point.period, states: assessment.watches.filter(watch => watch.evidence.length > 0).map(watch => ({ id: watch.id, status: watch.rawStatus })) };
  });
}

export function scenarioStressWindows(run: HorizonScenarioRun) {
  const rules = [
    { id: "high_budget", label: "High-burden budget gap", predicate: (point: HorizonScenarioRun["points"][number]) => point.households[0].roomReal < 0 },
    { id: "lower_budget", label: "Lower-burden budget gap", predicate: (point: HorizonScenarioRun["points"][number]) => point.households[1].roomReal < 0 },
    { id: "energy_screen", label: "Desired energy / delivery > 1.1", predicate: (point: HorizonScenarioRun["points"][number]) => point.demandSupplyRatio > 1.1 + 1e-9 },
  ];
  return rules.map(rule => {
    const firstIndex = run.points.findIndex(rule.predicate);
    const sustainedIndex = run.points.findIndex((point, index) => index > 0 && point.year === run.points[index - 1].year + 1 && rule.predicate(point) && rule.predicate(run.points[index - 1]));
    const startIndex = sustainedIndex > 0 ? sustainedIndex - 1 : firstIndex;
    return { id: rule.id, label: rule.label, firstSample: firstIndex >= 0 ? run.points[firstIndex].period : null, windowAfter: startIndex > 0 ? run.points[startIndex - 1].period : null, windowBy: startIndex >= 0 ? run.points[startIndex].period : null, secondSample: sustainedIndex > 0 ? run.points[sustainedIndex].period : null };
  });
}
