import { SIGNAL_SOURCES, type EciModel, type SignalDatasets, type SignalSource } from "./types";
import type { SignalSourceState } from "../../storage/signalRepo";

export interface MonthPoint { period: string; value: number }

/**
 * Occupation groups for Indeed's postings. Grouped by how much of the work is
 * done at a computer with text, code or data (the tasks studies such as
 * Eloundou et al., "GPTs are GPTs" (2023), rate as most exposed to language
 * models) versus hands-on work. Our grouping; every occupation is also shown
 * on its own so it can be checked.
 */
export const EXPOSURE_GROUPS = {
  exposed: ["Software Development", "Data & Analytics", "IT Systems & Solutions", "IT Infrastructure, Operations & Support", "Marketing", "Media & Communications", "Administrative Assistance", "Customer Service", "Accounting", "Banking & Finance", "Insurance", "Legal", "Human Resources"],
  handsOn: ["Nursing", "Personal Care & Home Health", "Construction", "Installation & Maintenance", "Cleaning & Sanitation", "Food Preparation & Service", "Driving", "Loading & Stocking", "Production & Manufacturing", "Therapy", "Childcare", "Dental"],
} as const;

/** ChatGPT's public launch: the reference point for "since generative AI". */
export const AI_ERA_START = { month: "2022-11", quarter: "2022-Q4" };

const monthAdd = (period: string, months: number) => {
  const index = Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1 + months;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
};

/** Best score released by the end of each month (a running maximum). */
export function frontierByMonth(models: EciModel[], filter: (model: EciModel) => boolean = () => true): (MonthPoint & { model: string })[] {
  const eligible = models.filter(filter).sort((a, b) => a.date.localeCompare(b.date));
  if (!eligible.length) return [];
  const out: (MonthPoint & { model: string })[] = [];
  const last = models.map(model => model.date.slice(0, 7)).sort().at(-1)!;
  let best: EciModel | null = null;
  let index = 0;
  for (let month = eligible[0].date.slice(0, 7); month <= last; month = monthAdd(month, 1)) {
    while (index < eligible.length && eligible[index].date.slice(0, 7) <= month) {
      if (!best || eligible[index].score > best.score) best = eligible[index];
      index++;
    }
    if (best) out.push({ period: month, value: best.score, model: best.name });
  }
  return out;
}

export function capabilitySummary(models: EciModel[]) {
  const frontier = frontierByMonth(models);
  const openFrontier = frontierByMonth(models, model => model.open);
  if (!frontier.length) return null;
  const latest = frontier.at(-1)!;
  const yearAgo = frontier.find(point => point.period === monthAdd(latest.period, -12));
  // The index starts after ChatGPT's launch, so "since" means since the first scored month on or after it.
  const start = frontier.find(point => point.period >= AI_ERA_START.month) ?? frontier[0];
  const openLatest = openFrontier.at(-1) ?? null;
  const leader = models.filter(model => model.score === latest.value).sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    frontier: frontier.map(({ period, value }) => ({ period, value })),
    openFrontier: openFrontier.map(({ period, value }) => ({ period, value })),
    leader: { name: leader.name, organization: leader.organization, date: leader.date, score: leader.score },
    openLeader: openLatest ? { name: openLatest.model, score: openLatest.value } : null,
    gainLast12Months: yearAgo ? latest.value - yearAgo.value : null,
    gainSinceStart: { from: start.period, value: latest.value - start.value },
    openGap: openLatest ? latest.value - openLatest.value : null,
    models: models.length,
  };
}

export function adoptionSummary(points: { period: string; use: number | null; expected: number | null }[], question: string) {
  const withUse = points.filter(point => point.use !== null);
  if (!withUse.length) return null;
  // Monthly series: the last fortnight in each month.
  const byMonth = new Map<string, { use: number | null; expected: number | null }>();
  for (const point of points) byMonth.set(point.period.slice(0, 7), { use: point.use, expected: point.expected });
  const latest = withUse.at(-1)!;
  const sixMonthsBefore = withUse.filter(point => point.period <= monthAdd(latest.period.slice(0, 7), -6) + "-31").at(-1) ?? null;
  return {
    monthly: [...byMonth.entries()].map(([period, value]) => ({ period, ...value })),
    latest,
    first: withUse[0],
    changeSixMonths: sixMonthsBefore ? latest.use! - sixMonthsBefore.use! : null,
    sixMonthsBefore,
    question,
  };
}

function basket(sectors: { sector: string; points: MonthPoint[] }[], names: readonly string[]): MonthPoint[] {
  const members = sectors.filter(item => names.includes(item.sector));
  if (members.length !== names.length) return [];
  const months = members[0].points.map(point => point.period).filter(period => members.every(item => item.points.some(point => point.period === period)));
  return months.map(period => ({ period, value: Math.round(members.reduce((total, item) => total + item.points.find(point => point.period === period)!.value, 0) / members.length * 100) / 100 }));
}

export function postingsSummary(sectors: { sector: string; points: MonthPoint[] }[], latestDay: string) {
  const exposed = basket(sectors, EXPOSURE_GROUPS.exposed);
  const handsOn = basket(sectors, EXPOSURE_GROUPS.handsOn);
  if (!exposed.length || !handsOn.length) return null;
  const at = (series: MonthPoint[], period: string) => series.find(point => point.period === period)?.value ?? null;
  const latestMonth = exposed.at(-1)!.period;
  const group = (sector: string) => (EXPOSURE_GROUPS.exposed as readonly string[]).includes(sector) ? "exposed" : (EXPOSURE_GROUPS.handsOn as readonly string[]).includes(sector) ? "handsOn" : "other";
  return {
    exposed, handsOn, latestDay, latestMonth,
    gap: at(exposed, latestMonth)! - at(handsOn, latestMonth)!,
    gapAtLaunch: at(exposed, AI_ERA_START.month) !== null && at(handsOn, AI_ERA_START.month) !== null ? at(exposed, AI_ERA_START.month)! - at(handsOn, AI_ERA_START.month)! : null,
    sectors: sectors.map(item => ({
      sector: item.sector,
      group: group(item.sector),
      latest: item.points.at(-1)?.value ?? null,
      atLaunch: at(item.points, AI_ERA_START.month),
    })).sort((a, b) => (a.latest ?? 0) - (b.latest ?? 0)),
  };
}

/**
 * The conversion gap: annualised US productivity growth since ChatGPT's launch
 * quarter, minus the pre-pandemic trend (2017–2019). Positive means faster than
 * before generative AI; it does not prove AI caused the difference.
 */
export function conversionGap(points: { period: string; value: number }[]) {
  const find = (period: string) => points.find(point => point.period === period)?.value ?? null;
  const quarters = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 4 + Number(to.slice(-1)) - Number(from.slice(-1));
  const annualised = (from: string, to: string) => {
    const a = find(from), b = find(to), n = quarters(from, to);
    return a && b && n > 0 ? (Math.pow(b / a, 4 / n) - 1) * 100 : null;
  };
  const latest = points.filter(point => /^\d{4}-Q[1-4]$/.test(point.period)).at(-1);
  if (!latest || latest.period <= AI_ERA_START.quarter) return null;
  const trendFrom = find("2016-Q4") !== null ? "2016-Q4" : "2017-Q1";
  const since = annualised(AI_ERA_START.quarter, latest.period);
  const trend = annualised(trendFrom, "2019-Q4");
  if (since === null || trend === null) return null;
  return { from: AI_ERA_START.quarter, to: latest.period, trendFrom, trendTo: "2019-Q4", annualSince: since, annualTrend: trend, gap: since - trend };
}

export interface SignalsSnapshot {
  version: 1;
  generatedAt: string;
  capability: (ReturnType<typeof capabilitySummary> & { retrievedAt: string; dataUrl: string }) | null;
  adoption: (ReturnType<typeof adoptionSummary> & { retrievedAt: string; dataUrl: string }) | null;
  postings: (ReturnType<typeof postingsSummary> & { retrievedAt: string; dataUrl: string }) | null;
  sources: SignalSourceState[];
}

export function buildSignalsSnapshot(datasets: SignalDatasets, states: SignalSourceState[], now = new Date()): SignalsSnapshot {
  const meta = (source: SignalSource) => ({ retrievedAt: datasets[source]!.retrievedAt, dataUrl: datasets[source]!.dataUrl });
  const capability = datasets.epoch ? capabilitySummary(datasets.epoch.payload.models) : null;
  const adoption = datasets.btos ? adoptionSummary(datasets.btos.payload.points, datasets.btos.payload.useQuestion) : null;
  const postings = datasets.indeed ? postingsSummary(datasets.indeed.payload.sectors, datasets.indeed.payload.latestDay) : null;
  return {
    version: 1,
    generatedAt: now.toISOString(),
    capability: capability ? { ...capability, ...meta("epoch") } : null,
    adoption: adoption ? { ...adoption, ...meta("btos") } : null,
    postings: postings ? { ...postings, ...meta("indeed") } : null,
    sources: SIGNAL_SOURCES.map(source => states.find(state => state.source === source) ?? { source, health: "unavailable", checkedAt: null, error: null }),
  };
}
