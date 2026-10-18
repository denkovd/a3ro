import type { HorizonSnapshot } from "./types";
import { horizonFreshness, horizonPeriodEnd } from "./engine";

export const HORIZON_MODEL_VERSION = "horizon-scenarios-1.0.0";
export const HORIZON_END_YEAR = 2046;

export const ASSUMPTION_RULES = {
  baselineGrowth: { label: "Non-AI real hourly growth", min: -1, max: 3, step: 0.1, unit: "% / year" },
  aiPotential: { label: "AI productivity uplift at full diffusion", min: 0, max: 60, step: 1, unit: "% level gain" },
  diffusionYears: { label: "Additional diffusion half-life", min: 1, max: 15, step: 1, unit: "years" },
  adoptionLag: { label: "Productive-use delay", min: 0, max: 8, step: 1, unit: "years" },
  labourPassThrough: { label: "AI uplift reaching real hourly labour income", min: 0, max: 100, step: 5, unit: "%" },
  hoursLoss: { label: "Hours lost at full diffusion", min: 0, max: 30, step: 1, unit: "%" },
  capitalCapture: { label: "Capital-income response to AI uplift", min: 0, max: 4, step: 0.1, unit: "× uplift" },
  workloadGrowth: { label: "Desired compute workload growth", min: 0, max: 35, step: 1, unit: "% / year" },
  energyEfficiency: { label: "Energy per workload reduction", min: 0, max: 25, step: 1, unit: "% / year" },
  powerGrowth: { label: "Deliverable energy growth proxy", min: 0, max: 20, step: 1, unit: "% / year" },
  powerDelay: { label: "Energy delivery delay", min: 0, max: 8, step: 1, unit: "years" },
  energyPriceResponse: { label: "Extra energy-price growth per unit excess demand ratio", min: 0, max: 20, step: 1, unit: "% / year" },
  otherEssentialGrowth: { label: "Non-energy essentials above general inflation", min: -1, max: 4, step: 0.1, unit: "% / year" },
  inflation: { label: "General price deflator (not a policy forecast)", min: 0, max: 6, step: 0.1, unit: "% / year" },
  capitalLevy: { label: "Levy on additional AI capital income", min: 0, max: 50, step: 5, unit: "%" },
  policyDelay: { label: "Redistribution delivery delay", min: 0, max: 8, step: 1, unit: "years" },
} as const;

export type AssumptionKey = keyof typeof ASSUMPTION_RULES;
export type HorizonAssumptions = Record<AssumptionKey, number>;
export type ScenarioId = "broad" | "uneven" | "disruption";
export type HorizonScenarioInputs = Record<ScenarioId, HorizonAssumptions>;

export const HORIZON_SCENARIOS: { id: ScenarioId; title: string; color: string; description: string; assumptions: HorizonAssumptions }[] = [
  { id: "broad", title: "Broad gains", color: "#5fc9a4", description: "Faster diffusion, stronger labour transmission and energy delivery; more AI capital income is redistributed.", assumptions: { baselineGrowth: 1, aiPotential: 40, diffusionYears: 4, adoptionLag: 1, labourPassThrough: 85, hoursLoss: 3, capitalCapture: 1.5, workloadGrowth: 20, energyEfficiency: 15, powerGrowth: 6, powerDelay: 1, energyPriceResponse: 4, otherEssentialGrowth: 0.2, inflation: 2, capitalLevy: 30, policyDelay: 2 } },
  { id: "uneven", title: "Uneven gains", color: "#8b9dff", description: "AI lifts capacity, but weaker wage transmission, concentrated capital income and delivery friction limit household gains.", assumptions: { baselineGrowth: 1, aiPotential: 40, diffusionYears: 6, adoptionLag: 2, labourPassThrough: 35, hoursLoss: 10, capitalCapture: 3, workloadGrowth: 25, energyEfficiency: 12, powerGrowth: 7, powerDelay: 2, energyPriceResponse: 6, otherEssentialGrowth: 1, inflation: 2, capitalLevy: 10, policyDelay: 4 } },
  { id: "disruption", title: "Disruption", color: "#d4a157", description: "Slow delivery and institutional adjustment combine with lost hours and sustained essential-cost pressure.", assumptions: { baselineGrowth: 0.5, aiPotential: 40, diffusionYears: 8, adoptionLag: 3, labourPassThrough: 15, hoursLoss: 22, capitalCapture: 4, workloadGrowth: 30, energyEfficiency: 8, powerGrowth: 4, powerDelay: 4, energyPriceResponse: 10, otherEssentialGrowth: 2, inflation: 3, capitalLevy: 5, policyDelay: 6 } },
];

export const ILLUSTRATIVE_HOUSEHOLDS = [
  { id: "high", label: "High essential burden", labour: 95, capital: 5, essentials: 80, energy: 10 },
  { id: "lower", label: "Lower essential burden", labour: 70, capital: 30, essentials: 50, energy: 5 },
] as const;

export interface ScenarioAnchor {
  period: string;
  year: number;
  productivity: number;
  realCompensation: number;
  snapshotGeneratedAt: string;
  evidence: { key: string; sourceUrl: string; verifiedAt: string | null; freshness: string; sourceHealth: string }[];
}

export interface HouseholdPathPoint {
  id: "high" | "lower";
  labourReal: number;
  capitalReal: number;
  levyReal: number;
  transferReal: number;
  incomeReal: number;
  essentialsReal: number;
  energyReal: number;
  roomReal: number;
  roomIndex: number;
  essentialBurden: number;
  incomeNominal: number;
  essentialsNominal: number;
}

export interface ScenarioPathPoint {
  year: number;
  period: string;
  diffusion: number;
  effectiveDiffusion: number;
  productivityIndex: number;
  nonAiProductivityIndex: number;
  hourlyLabourIndex: number;
  hoursIndex: number;
  energyDemandIndex: number;
  energySupplyIndex: number;
  demandSupplyRatio: number;
  priceDeflator: number;
  households: HouseholdPathPoint[];
}

export interface HorizonScenarioRun {
  modelVersion: typeof HORIZON_MODEL_VERSION;
  anchor: ScenarioAnchor;
  assumptions: HorizonAssumptions;
  points: ScenarioPathPoint[];
}

export function scenarioAnchor(snapshot: HorizonSnapshot | null): ScenarioAnchor | null {
  if (!snapshot || !Number.isFinite(Date.parse(snapshot.generatedAt))) return null;
  const productivity = snapshot.indicators.find(item => item.key === "productivity");
  const compensation = snapshot.indicators.find(item => item.key === "real_compensation");
  if (!productivity || !compensation) return null;
  const validPeriod = (period: string) => /^20\d{2}-Q[1-4]$/.test(period) && Number(period.slice(0, 4)) < HORIZON_END_YEAR && horizonPeriodEnd(period, "quarterly")!.getTime() <= Date.parse(snapshot.generatedAt);
  const compensationPoints = new Map(compensation.points.filter(point => validPeriod(point.period) && Number.isFinite(point.value) && point.value > 0).map(point => [point.period, point.value]));
  const common = productivity.points.filter(point => validPeriod(point.period) && Number.isFinite(point.value) && point.value > 0 && compensationPoints.has(point.period)).sort((first, second) => first.period.localeCompare(second.period)).at(-1);
  if (!common) return null;
  return { period: common.period, year: Number(common.period.slice(0, 4)), productivity: common.value, realCompensation: compensationPoints.get(common.period)!, snapshotGeneratedAt: snapshot.generatedAt, evidence: [productivity, compensation].map(item => ({ key: item.key, sourceUrl: item.sourceUrl, verifiedAt: item.verifiedAt, freshness: horizonFreshness(common.period, "quarterly", new Date(snapshot.generatedAt)), sourceHealth: item.sourceHealth })) };
}

export function validateHorizonAssumptions(input: unknown): HorizonAssumptions {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Scenario assumptions must be an object.");
  const values = input as Record<string, unknown>;
  if (Object.keys(values).some(key => !Object.hasOwn(ASSUMPTION_RULES, key))) throw new Error("Unknown scenario assumption.");
  const validated = {} as HorizonAssumptions;
  for (const key of Object.keys(ASSUMPTION_RULES) as AssumptionKey[]) {
    const rule = ASSUMPTION_RULES[key];
    const value = values[key];
    if (!Object.hasOwn(values, key) || typeof value !== "number" || !Number.isFinite(value) || value < rule.min || value > rule.max) throw new Error(`${key} must be between ${rule.min} and ${rule.max}.`);
    if ((key === "adoptionLag" || key === "powerDelay" || key === "policyDelay" || key === "diffusionYears") && !Number.isInteger(value)) throw new Error(`${key} must be whole years.`);
    validated[key] = value;
  }
  return validated;
}

export function runHorizonScenario(anchor: ScenarioAnchor, input: unknown): HorizonScenarioRun {
  const assumptions = validateHorizonAssumptions(input);
  if (!/^20\d{2}-Q[1-4]$/.test(anchor.period) || anchor.year !== Number(anchor.period.slice(0, 4)) || anchor.year >= HORIZON_END_YEAR || !Number.isFinite(anchor.productivity) || anchor.productivity <= 0 || !Number.isFinite(anchor.realCompensation) || anchor.realCompensation <= 0 || !Number.isFinite(Date.parse(anchor.snapshotGeneratedAt)) || horizonPeriodEnd(anchor.period, "quarterly")!.getTime() > Date.parse(anchor.snapshotGeneratedAt)) throw new Error("A valid shared quarterly baseline is required.");
  const points: ScenarioPathPoint[] = [];
  let energyRelativePrice = 1;
  for (let year = anchor.year; year <= HORIZON_END_YEAR; year += 1) {
    const elapsed = year - anchor.year;
    const diffusion = 1 - Math.pow(0.5, Math.max(0, elapsed - assumptions.adoptionLag) / assumptions.diffusionYears);
    const energyDemandIndex = 100 * Math.pow((1 + assumptions.workloadGrowth / 100) * (1 - assumptions.energyEfficiency / 100), elapsed);
    const energySupplyIndex = 100 * Math.pow(1 + assumptions.powerGrowth / 100, Math.max(0, elapsed - assumptions.powerDelay));
    const demandSupplyRatio = energyDemandIndex / energySupplyIndex;
    const effectiveDiffusion = diffusion * Math.min(1, 1 / demandSupplyRatio);
    const uplift = assumptions.aiPotential / 100 * effectiveDiffusion;
    const baselineFactor = Math.pow(1 + assumptions.baselineGrowth / 100, elapsed);
    const hoursFactor = 1 - assumptions.hoursLoss / 100 * effectiveDiffusion;
    const hourlyFactor = baselineFactor * (1 + uplift * assumptions.labourPassThrough / 100);
    const priceDeflator = Math.pow(1 + assumptions.inflation / 100, elapsed);
    if (elapsed > 0) energyRelativePrice *= 1 + Math.min(0.08, assumptions.energyPriceResponse / 100 * Math.max(0, demandSupplyRatio - 1));
    const capitalAiFactor = baselineFactor * uplift * assumptions.capitalCapture;
    const levies = ILLUSTRATIVE_HOUSEHOLDS.map(household => elapsed >= assumptions.policyDelay ? household.capital * capitalAiFactor * assumptions.capitalLevy / 100 : 0);
    const revenue = levies.reduce((total, levy) => total + levy, 0);
    const households = ILLUSTRATIVE_HOUSEHOLDS.map((household, index) => {
      const labourReal = household.labour * hourlyFactor * hoursFactor;
      const capitalReal = household.capital * (baselineFactor + capitalAiFactor);
      const transferReal = household.id === "high" ? revenue : 0;
      const incomeReal = labourReal + capitalReal - levies[index] + transferReal;
      const energyReal = household.energy * energyRelativePrice;
      const essentialsReal = (household.essentials - household.energy) * Math.pow(1 + assumptions.otherEssentialGrowth / 100, elapsed) + energyReal;
      const roomReal = incomeReal - essentialsReal;
      return { id: household.id, labourReal, capitalReal, levyReal: levies[index], transferReal, incomeReal, essentialsReal, energyReal, roomReal, roomIndex: roomReal / (100 - household.essentials) * 100, essentialBurden: essentialsReal / incomeReal * 100, incomeNominal: incomeReal * priceDeflator, essentialsNominal: essentialsReal * priceDeflator };
    });
    points.push({ year, period: `${year}${anchor.period.slice(4)}`, diffusion, effectiveDiffusion, productivityIndex: 100 * baselineFactor * (1 + uplift), nonAiProductivityIndex: 100 * baselineFactor, hourlyLabourIndex: 100 * hourlyFactor, hoursIndex: 100 * hoursFactor, energyDemandIndex, energySupplyIndex, demandSupplyRatio, priceDeflator, households });
  }
  return { modelVersion: HORIZON_MODEL_VERSION, anchor: structuredClone(anchor), assumptions, points };
}

export function horizonSensitivity(anchor: ScenarioAnchor, assumptions: HorizonAssumptions) {
  const keys: AssumptionKey[] = ["labourPassThrough", "otherEssentialGrowth", "powerGrowth", "diffusionYears", "hoursLoss", "capitalLevy"];
  return keys.map(key => {
    const rule = ASSUMPTION_RULES[key];
    const step = key === "labourPassThrough" ? 10 : key === "otherEssentialGrowth" ? 0.5 : key === "powerGrowth" ? 2 : key === "diffusionYears" ? 2 : 5;
    const low = Math.max(rule.min, assumptions[key] - step);
    const high = Math.min(rule.max, assumptions[key] + step);
    const room = (value: number) => runHorizonScenario(anchor, { ...assumptions, [key]: value }).points.at(-1)!.households[0].roomReal;
    const lowRoom = room(low);
    const highRoom = room(high);
    return { key, low, high, lowRoom, highRoom, spread: Math.abs(highRoom - lowRoom) };
  }).sort((first, second) => second.spread - first.spread);
}
