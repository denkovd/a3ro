// AI Dividend — step 5: the outlook to 2031.
//
// Three parts, all computed from the live readings of stages 1–5:
//   1. Signposts: which scenario does the evidence so far lean toward?
//   2. Scenarios: what productivity and pay look like by 2031 under each one.
//   3. Prediction ledger: dated, checkable calls, scored as data arrives.
// Nothing here is a probability. Scenarios are conditional ("if this, then
// that"); the lean is a count of signposts, each with a written rule.

import { conversionGap } from "../signals/snapshot";

export type ScenarioId = "dividend" | "bubble" | "upstream";
export const OUTLOOK_END = { year: 2031, quarter: "2031-Q4" };

type Point = { period: string; value: number };

/** Everything the outlook reads, gathered from the module's four live snapshots. */
export interface OutlookInputs {
  productivity: Point[];
  realCompensation: Point[];
  unemployment20to24: Point[];
  unemployment25to54: Point[];
  capability: { frontier: Point[]; gainLast12Months: number | null } | null;
  adoption: { monthly: { period: string; use: number | null }[]; changeSixMonths: number | null } | null;
  postings: { exposed: Point[]; handsOn: Point[]; gap: number; gapAtLaunch: number | null } | null;
  infrastructure: { operatingMargin: number | null } | null;
  labsOperatingIncome: number | null;
  /** Hyperscaler capex ÷ operating cash flow, and the latest period it covers. */
  financing: { ratio: number; asOf: string } | null;
}

// ── Shared arithmetic ────────────────────────────────────────────

const quarterIndex = (period: string) => Number(period.slice(0, 4)) * 4 + Number(period.slice(-1)) - 1;
const quarterLabel = (index: number) => `${Math.floor(index / 4)}-Q${index % 4 + 1}`;

export function annualised(points: Point[], from: string, to: string): number | null {
  const a = points.find(point => point.period === from)?.value, b = points.find(point => point.period === to)?.value;
  const quarters = quarterIndex(to) - quarterIndex(from);
  return a && b && quarters > 0 ? (Math.pow(b / a, 4 / quarters) - 1) * 100 : null;
}

const latestQuarter = (points: Point[]) => points.filter(point => /^\d{4}-Q[1-4]$/.test(point.period)).at(-1) ?? null;

/**
 * Share of productivity growth that reached real hourly pay, since ChatGPT's
 * launch quarter and over the pre-pandemic trend window, for comparison.
 */
export function passThrough(productivity: Point[], compensation: Point[]) {
  const to = latestQuarter(productivity)?.period;
  const gap = conversionGap(productivity);
  if (!to || !gap) return null;
  const prodSince = annualised(productivity, "2022-Q4", to), compSince = annualised(compensation, "2022-Q4", to);
  const prodTrend = annualised(productivity, gap.trendFrom, "2019-Q4"), compTrend = annualised(compensation, gap.trendFrom, "2019-Q4");
  if (prodSince === null || compSince === null || prodTrend === null || compTrend === null || prodSince <= 0 || prodTrend <= 0) return null;
  return { since: compSince / prodSince, trend: compTrend / prodTrend, to };
}

const valueAt = (points: Point[], period: string) => points.find(point => point.period === period)?.value ?? null;
const monthGap = (a: Point[], b: Point[], period: string) => {
  const x = valueAt(a, period), y = valueAt(b, period);
  return x !== null && y !== null ? x - y : null;
};

// ── 1. Signposts ─────────────────────────────────────────────────

export interface Signpost {
  id: string;
  title: string;
  reading: string;
  rule: string;
  supports: ScenarioId[];
  available: boolean;
}

const fmt = (value: number, digits = 1, suffix = "") => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}${suffix}`;

export function signposts(inputs: OutlookInputs): Signpost[] {
  const out: Signpost[] = [];
  const add = (id: string, title: string, rule: string, reading: string | null, supports: ScenarioId[]) => out.push({ id, title, rule, reading: reading ?? "No data yet", supports: reading === null ? [] : supports, available: reading !== null });

  const capability = inputs.capability?.gainLast12Months ?? null;
  add("capability", "Capability keeps rising", "Frontier gain over 12 months: 10+ points supports dividend and upstream; under 5 supports bubble.",
    capability === null ? null : `${fmt(capability)} points on the Epoch index in 12 months`,
    capability === null ? [] : capability >= 10 ? ["dividend", "upstream"] : capability < 5 ? ["bubble"] : []);

  const adoption = inputs.adoption?.changeSixMonths ?? null;
  add("adoption", "Businesses keep adopting", "Six-month change in businesses using AI: 3+ points supports dividend and upstream; under 1 supports bubble.",
    adoption === null ? null : `${fmt(adoption)} points of US businesses in six months`,
    adoption === null ? [] : adoption >= 3 ? ["dividend", "upstream"] : adoption < 1 ? ["bubble"] : []);

  const gap = conversionGap(inputs.productivity);
  add("conversion", "Productivity beats its old trend", "Productivity growth since 2022-Q4 minus the pre-pandemic trend: +0.5 points or more supports dividend and upstream; zero or below supports bubble.",
    gap ? `${fmt(gap.gap, 2)} points a year (${gap.annualSince.toFixed(2)}% vs ${gap.annualTrend.toFixed(2)}%)` : null,
    !gap ? [] : gap.gap >= 0.5 ? ["dividend", "upstream"] : gap.gap <= 0 ? ["bubble"] : []);

  const pass = passThrough(inputs.productivity, inputs.realCompensation);
  add("pass_through", "Workers share the gains", "Share of productivity growth reaching real hourly pay since 2022-Q4, against the pre-pandemic share: within 0.05 supports dividend; 0.15 or more below supports upstream.",
    pass ? `${pass.since.toFixed(2)} now vs ${pass.trend.toFixed(2)} before the pandemic` : null,
    !pass ? [] : pass.since - pass.trend >= -0.05 ? ["dividend"] : pass.since - pass.trend <= -0.15 ? ["upstream"] : []);

  const postings = inputs.postings && inputs.postings.gapAtLaunch !== null ? inputs.postings.gap - inputs.postings.gapAtLaunch : null;
  add("entry_jobs", "Entry-level jobs hold up", "Change in the gap between AI-exposed and hands-on job postings since Nov 2022: widening by 5+ points supports upstream; narrowing by 5+ supports dividend.",
    postings === null ? null : `Gap ${postings < 0 ? "widened" : "narrowed"} by ${Math.abs(postings).toFixed(0)} points since ChatGPT launched`,
    postings === null ? [] : postings <= -5 ? ["upstream"] : postings >= 5 ? ["dividend"] : []);

  const infra = inputs.infrastructure?.operatingMargin ?? null;
  const labs = inputs.labsOperatingIncome;
  add("profit_pool", "Where profit pools", "Infrastructure operating margin of 40%+ while the frontier labs lose money supports upstream; labs turning a profit supports dividend.",
    infra === null || labs === null ? null : `Infrastructure margin ${(infra * 100).toFixed(0)}%; labs ${labs < 0 ? "losing" : "making"} money at the operating line`,
    infra === null || labs === null ? [] : labs >= 0 ? ["dividend"] : infra >= 0.4 ? ["upstream"] : []);

  const financing = inputs.financing?.ratio ?? null;
  add("financing", "Spending is affordable", "Hyperscaler capex as a share of operating cash flow: 85%+ supports bubble (spending outruns cash); under 65% supports dividend.",
    financing === null ? null : `${Math.round(financing * 100)}% of operating cash flow spent on capex`,
    financing === null ? [] : financing >= 0.85 ? ["bubble"] : financing < 0.65 ? ["dividend"] : []);

  return out;
}

export function lean(items: Signpost[]) {
  const counts: Record<ScenarioId, number> = { dividend: 0, bubble: 0, upstream: 0 };
  for (const item of items) for (const scenario of item.supports) counts[scenario]++;
  const ranked = (Object.keys(counts) as ScenarioId[]).sort((a, b) => counts[b] - counts[a]);
  const leader = counts[ranked[0]] > counts[ranked[1]] ? ranked[0] : null;
  return { counts, leader, available: items.filter(item => item.available).length, total: items.length };
}

// ── 2. Scenarios to 2031 ─────────────────────────────────────────

export interface Scenario {
  id: ScenarioId;
  title: string;
  story: string;
  /** Productivity growth above the pre-pandemic trend, percentage points a year. */
  excessProductivity: number;
  /** Share of productivity growth reaching real hourly pay. */
  passThrough: number;
  /** What you'd expect to see by 2031 if this scenario is playing out. */
  expect: { adoption: string; financing: string; capability: string; jobs: string };
}

export const SCENARIOS: Scenario[] = [
  {
    id: "dividend", title: "The dividend arrives",
    story: "AI spreads through ordinary businesses, productivity runs well above its old trend, and pay keeps up. Spending gets paid back by AI revenue, so the build-out slows without a crash.",
    excessProductivity: 1.0, passThrough: 0.75,
    expect: { adoption: "About 60% of US businesses using AI", financing: "Capex back under 70% of hyperscaler cash flow", capability: "Steady gains, ~15 index points a year", jobs: "Entry-level postings recover as new roles appear" },
  },
  {
    id: "bubble", title: "The build-out deflates",
    story: "Spending outruns revenue. Hyperscalers cut capex, chip and data-centre profits fall back, and productivity stays near its old trend. The infrastructure is cheap and useful later, as after the 2000 fibre bust.",
    excessProductivity: 0.0, passThrough: 0.65,
    expect: { adoption: "Adoption stalls around 35% of businesses", financing: "Capex cut to around half of cash flow", capability: "Gains slow to ~5 points a year", jobs: "Postings drift with the business cycle" },
  },
  {
    id: "upstream", title: "Gains pool upstream",
    story: "Productivity does rise, but most of the gain goes to the owners of chips, clouds and models, and to the workers who use AI well. Pay lags output and entry-level office work keeps shrinking.",
    excessProductivity: 0.8, passThrough: 0.35,
    expect: { adoption: "About 55% of businesses using AI", financing: "Capex stays at 85%+ of cash flow, debt-funded", capability: "Steady gains, ~15 points a year", jobs: "The exposed-vs-hands-on postings gap keeps widening" },
  },
];

export interface Projection {
  from: string;
  trend: number;
  productivityGrowth: number;
  payGrowth: number;
  productivity: Point[];
  pay: Point[];
  /** By the end of 2031, relative to the latest reading. */
  productivityChange: number;
  payChange: number;
  /** Extra output per hour by 2031 versus staying on the old trend. */
  extraOutputVsTrend: number;
}

/**
 * Compounds the latest productivity and real-pay readings quarter by quarter
 * to 2031-Q4: productivity at trend + excess, pay at pass-through × productivity.
 * History is included so the chart shows one continuous line per measure.
 */
export function project(productivity: Point[], compensation: Point[], excess: number, share: number): Projection | null {
  const gap = conversionGap(productivity);
  const start = latestQuarter(productivity);
  const payStart = start ? compensation.find(point => point.period === start.period) : undefined;
  if (!gap || !start || !payStart) return null;
  const productivityGrowth = gap.annualTrend + excess;
  const payGrowth = share * productivityGrowth;
  const qProd = Math.pow(1 + productivityGrowth / 100, 0.25), qPay = Math.pow(1 + payGrowth / 100, 0.25), qTrend = Math.pow(1 + gap.annualTrend / 100, 0.25);
  const end = quarterIndex(OUTLOOK_END.quarter);
  const history = (points: Point[]) => points.filter(point => /^\d{4}-Q[1-4]$/.test(point.period) && point.period <= start.period).map(({ period, value }) => ({ period, value }));
  const prodPath = history(productivity), payPath = history(compensation);
  let p = start.value, w = payStart.value, t = start.value;
  for (let index = quarterIndex(start.period) + 1; index <= end; index++) {
    p *= qProd; w *= qPay; t *= qTrend;
    prodPath.push({ period: quarterLabel(index), value: Math.round(p * 1000) / 1000 });
    payPath.push({ period: quarterLabel(index), value: Math.round(w * 1000) / 1000 });
  }
  return {
    from: start.period, trend: gap.annualTrend, productivityGrowth, payGrowth,
    productivity: prodPath, pay: payPath.filter(point => prodPath.some(item => item.period === point.period)),
    productivityChange: (p / start.value - 1) * 100,
    payChange: (w / payStart.value - 1) * 100,
    extraOutputVsTrend: (p / t - 1) * 100,
  };
}

// ── 3. Prediction ledger ─────────────────────────────────────────

export type PredictionMetric = "business_ai_use" | "conversion_gap" | "postings_gap" | "capex_to_cash" | "frontier_capability" | "youth_unemployment_gap";

export interface Prediction {
  id: string;
  madeOn: string;
  call: string;
  metric: PredictionMetric;
  comparator: ">=" | "<=";
  threshold: number;
  unit: string;
  /** Scored on the first reading for this period (month YYYY-MM or quarter YYYY-Qn). */
  resolvesAt: string;
  scenario: ScenarioId;
}

/**
 * The module's dated calls. Committed to git, so the history proves when each
 * was made. Add new calls with a new `madeOn`; never edit one after it's made.
 */
export const PREDICTIONS: Prediction[] = [
  { id: "2026-11-btos", madeOn: "2026-11-19", call: "At least 30% of US businesses will be using AI by mid-2027", metric: "business_ai_use", comparator: ">=", threshold: 30, unit: "%", resolvesAt: "2027-06", scenario: "dividend" },
  { id: "2026-11-conversion", madeOn: "2026-11-19", call: "Productivity will still be running 0.5 points a year or more above its pre-pandemic trend in 2027-Q2", metric: "conversion_gap", comparator: ">=", threshold: 0.5, unit: "pts", resolvesAt: "2027-Q2", scenario: "upstream" },
  { id: "2026-11-postings", madeOn: "2026-11-19", call: "AI-exposed job postings will still trail hands-on postings by 30 points or more in June 2027", metric: "postings_gap", comparator: "<=", threshold: -30, unit: "pts", resolvesAt: "2027-06", scenario: "upstream" },
  { id: "2026-11-capex", madeOn: "2026-11-19", call: "Hyperscalers will still be spending 85% or more of operating cash flow on capex in mid-2027", metric: "capex_to_cash", comparator: ">=", threshold: 0.85, unit: "×", resolvesAt: "2027-Q2", scenario: "bubble" },
  { id: "2026-11-capability", madeOn: "2026-11-19", call: "The frontier will reach 190 on the Epoch Capabilities Index by November 2027", metric: "frontier_capability", comparator: ">=", threshold: 190, unit: "pts", resolvesAt: "2027-11", scenario: "upstream" },
  { id: "2026-11-youth", madeOn: "2026-11-19", call: "Unemployment for ages 20–24 will be 4 points or more above ages 25–54 in October 2027", metric: "youth_unemployment_gap", comparator: ">=", threshold: 4, unit: "pts", resolvesAt: "2027-10", scenario: "upstream" },
  { id: "2026-11-conversion-2031", madeOn: "2026-11-19", call: "By the end of 2031, productivity growth since ChatGPT will still be 0.5 points a year above its pre-pandemic trend", metric: "conversion_gap", comparator: ">=", threshold: 0.5, unit: "pts", resolvesAt: "2031-Q4", scenario: "dividend" },
];

export interface PredictionRead extends Prediction {
  status: "hit" | "miss" | "pending";
  /** For pending calls: the latest reading and whether it is currently on the right side of the line. */
  reading: { value: number; asOf: string } | null;
  /**
   * For pending calls. Level calls ("still above X"): is the latest reading past the line?
   * Pace calls (a rising measure that must reach X): does its recent pace reach the line by the date?
   */
  onTrack: boolean | null;
  /** Pace calls only: the value the last 12 months' pace reaches by the settle date. */
  projected: number | null;
}

/**
 * Measures that rise over time, so a call on them asks whether they will get
 * there, not whether they are there yet. These are judged on pace. The rest
 * are "will it still be true" calls and are judged on the latest reading.
 */
export const PACE_METRICS: ReadonlySet<PredictionMetric> = new Set(["business_ai_use", "frontier_capability"]);
const PACE_WINDOW = 12;

const periodIndex = (period: string) => /^\d{4}-Q[1-4]$/.test(period)
  ? Number(period.slice(0, 4)) * 12 + (Number(period.slice(-1)) - 1) * 3 + 2
  : Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;

/** Straight-line pace over the last 12 months, carried forward to `target`. Null if under 6 months of history. */
export function projectAtPace(series: Point[], target: string): number | null {
  const latest = series.at(-1);
  if (!latest) return null;
  const end = periodIndex(latest.period);
  const start = [...series].reverse().find(point => end - periodIndex(point.period) >= PACE_WINDOW)
    ?? series.find(point => end - periodIndex(point.period) >= 6);
  if (!start) return null;
  const perMonth = (latest.value - start.value) / (end - periodIndex(start.period));
  return latest.value + perMonth * Math.max(0, periodIndex(target) - end);
}

const monthOf = (period: string) => period.slice(0, 7);
const quarterOfMonth = (month: string) => `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`;

/** The metric's series as (period, value) pairs, with periods in the prediction's own format. */
function metricSeries(inputs: OutlookInputs, metric: PredictionMetric): Point[] {
  switch (metric) {
    case "business_ai_use": return (inputs.adoption?.monthly ?? []).filter(point => point.use !== null).map(point => ({ period: monthOf(point.period), value: point.use! }));
    case "frontier_capability": return inputs.capability?.frontier ?? [];
    case "postings_gap": return (inputs.postings?.exposed ?? []).flatMap(point => { const gap = monthGap(inputs.postings!.exposed, inputs.postings!.handsOn, point.period); return gap === null ? [] : [{ period: point.period, value: Math.round(gap * 100) / 100 }]; });
    case "youth_unemployment_gap": return inputs.unemployment20to24.flatMap(point => { const gap = monthGap(inputs.unemployment20to24, inputs.unemployment25to54, point.period); return gap === null ? [] : [{ period: point.period, value: Math.round(gap * 100) / 100 }]; });
    case "conversion_gap": {
      // The gap as it stood at each quarter since the launch quarter.
      const quarters = inputs.productivity.filter(point => /^\d{4}-Q[1-4]$/.test(point.period) && point.period > "2022-Q4");
      return quarters.flatMap(point => { const gap = conversionGap(inputs.productivity.filter(item => item.period <= point.period)); return gap ? [{ period: point.period, value: Math.round(gap.gap * 1000) / 1000 }] : []; });
    }
    case "capex_to_cash": return inputs.financing ? [{ period: quarterOfMonth(monthOf(inputs.financing.asOf)), value: inputs.financing.ratio }] : [];
  }
}

export function scorePredictions(inputs: OutlookInputs, predictions = PREDICTIONS): PredictionRead[] {
  return predictions.map(prediction => {
    const series = metricSeries(inputs, prediction.metric).sort((a, b) => a.period.localeCompare(b.period));
    const passes = (value: number) => prediction.comparator === ">=" ? value >= prediction.threshold : value <= prediction.threshold;
    const resolved = series.find(point => point.period >= prediction.resolvesAt);
    const latest = series.at(-1) ?? null;
    if (resolved) return { ...prediction, status: passes(resolved.value) ? "hit" : "miss", reading: { value: resolved.value, asOf: resolved.period }, onTrack: null, projected: null };
    const projected = PACE_METRICS.has(prediction.metric) ? projectAtPace(series, prediction.resolvesAt) : null;
    const onTrack = !latest ? null : PACE_METRICS.has(prediction.metric) ? (projected === null ? null : passes(projected)) : passes(latest.value);
    return { ...prediction, status: "pending", reading: latest ? { value: latest.value, asOf: latest.period } : null, onTrack, projected };
  });
}

export function buildOutlook(inputs: OutlookInputs) {
  const items = signposts(inputs);
  return {
    signposts: items,
    lean: lean(items),
    scenarios: SCENARIOS.map(scenario => ({ ...scenario, projection: project(inputs.productivity, inputs.realCompensation, scenario.excessProductivity, scenario.passThrough) })),
    predictions: scorePredictions(inputs),
  };
}
