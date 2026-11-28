import { TREND_SETTINGS, SLEEVES, type AllocationInput, type Quadrant, type SleeveKey } from "./allocation";
import { backtestPrice, runAllocationBacktest, summarizeBacktest, type BacktestResult } from "./allocationBacktest";
import { RESEARCH_VERSION, REGIMES, type ResearchDataset } from "./backtestResearch";
import { analyzeMacroPhases, type PhaseBasis } from "./phaseResearch";
import { correlation, pairedSharpeRange } from "./researchCorrelation";
import type { VamsState } from "./vams";
import type { DailyVamsSignal } from "./vams21Backtest";

export const LAB_VERSION = "internal-regime-lab-v1";
/** Local daily trend signals for the lab (npm run backtest:trends). Kept out of the published file. */
export const LAB_TRENDS_PATH = "backend/.backtest-cache/lab-trends.json";
export interface LabTrends { through: string; generatedAt: string; vams21Signals: DailyVamsSignal[]; vams63Signals: DailyVamsSignal[] }
/** Overlay the lab's local trend signals on the published dataset (which has no 63-day daily history). */
export function withLabTrends(data: ResearchDataset, trends: LabTrends | null): ResearchDataset {
  if (!trends) return data;
  if (trends.through !== data.through) throw new Error(`Lab trend signals run to ${trends.through} but the history runs to ${data.through}; run npm --prefix backend run backtest:trends.`);
  return { ...data, vams21Signals: trends.vams21Signals, vams63Signals: trends.vams63Signals, vams21GeneratedAt: trends.generatedAt, vams63GeneratedAt: trends.generatedAt };
}
export const LAB_RULES = [
  { id: "trend", name: "Asset trend only", description: "Full / half / zero from each asset's own trend. No regime or cycle reductions." },
  { id: "regime", name: "Market regime only", description: "Full exposure when the selected regime favours the asset; otherwise cash. Ignores asset trend." },
  { id: "alignment", name: "Regime + trend alignment", description: "Full / half / zero trend sizing only while the regime favours the asset. Independent long-only hypothesis, not a replica of Dr. Mo." },
  { id: "headwind", name: "Trend + severe headwind guard", description: "Asset trend sizing; stocks and Bitcoin exit when the cycle headwind count reaches the selected threshold. Gold retains its own trend." },
  { id: "macro-entry", name: "Macro permits half exposure", description: "Asset trend sizing, with at least half exposure while the regime favours the asset. Severe headwinds still override stocks and Bitcoin. Tests early macro-led entry even against bearish momentum." },
] as const;
export type LabRule = typeof LAB_RULES[number]["id"];
export interface LabConfig {
  from: string; to: string; split: string; trendWindow: 21 | 63; confirmationWeeks: number;
  headwindLimit: number; horizon: 5 | 21 | 63; phaseBasis: PhaseBasis;
  costs: Record<SleeveKey | "cash", number>;
  favourable: Record<SleeveKey, Quadrant[]>;
}
export function defaultLabConfig(through: string): LabConfig {
  return { from: "2022-01-01", to: through, split: "2024-01-01", trendWindow: 63, confirmationWeeks: 3,
    headwindLimit: 4, horizon: 21, phaseBasis: "market", costs: { stocks: 10, gold: 10, bitcoin: 25, cash: 5 },
    favourable: { stocks: ["GOLDILOCKS", "REFLATION"], gold: ["GOLDILOCKS", "DEFLATION"], bitcoin: ["GOLDILOCKS", "REFLATION"] } };
}
const validDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export function validateLabConfig(value: unknown, through: string): LabConfig {
  if (!value || typeof value !== "object") throw new Error("Research settings are required.");
  const c = value as LabConfig;
  if (![c.from, c.to, c.split].every(validDate) || c.from < "2015-01-01" || c.from >= c.split || c.split >= c.to || c.to > through)
    throw new Error("Choose dates from 2015 onward, within history, with an earlier/later split inside the window.");
  if (![21, 63].includes(c.trendWindow) || ![5, 21, 63].includes(c.horizon) || !["market", "economic"].includes(c.phaseBasis) ||
      !Number.isInteger(c.confirmationWeeks) || c.confirmationWeeks < 1 || c.confirmationWeeks > 6 ||
      !Number.isInteger(c.headwindLimit) || c.headwindLimit < 1 || c.headwindLimit > 6) throw new Error("Invalid lookback, horizon, confirmation or headwind settings.");
  if (!c.costs || ["stocks", "gold", "bitcoin", "cash"].some(key => { const n = c.costs[key as keyof LabConfig["costs"]]; return !Number.isFinite(n) || n < 0 || n > 1000; }))
    throw new Error("Every one-way cost must be between 0 and 1,000 basis points.");
  if (!c.favourable || SLEEVES.some(s => !Array.isArray(c.favourable[s.key]) || c.favourable[s.key].some(q => !REGIMES.includes(q)) || new Set(c.favourable[s.key]).size !== c.favourable[s.key].length))
    throw new Error("Each asset needs an explicit, non-duplicated list of favourable regimes.");
  return structuredClone(c);
}
const week = (date: string) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
const fraction = (state?: VamsState) => state === "BULLISH" ? 1 : state === "NEUTRAL" ? 0.5 : 0;
const stateOf = (n: number): VamsState => n === 1 ? "BULLISH" : n === 0.5 ? "NEUTRAL" : "BEARISH";
const regimeOf = (input: AllocationInput, basis: PhaseBasis) => basis === "market" ? input.marketRegime : input.economicQuadrant;

export function proposedExposure(input: AllocationInput, rule: LabRule, config: LabConfig): Record<SleeveKey, number> {
  const regime = regimeOf(input, config.phaseBasis);
  return Object.fromEntries(SLEEVES.map(({ key }) => {
    const trend = fraction(input.states[key]), favoured = regime !== null && config.favourable[key].includes(regime);
    let exposure = rule === "regime" ? +favoured : rule === "alignment" ? (favoured ? trend : 0) : rule === "macro-entry" ? Math.max(trend, favoured ? 0.5 : 0) : trend;
    if ((rule === "headwind" || rule === "macro-entry") && key !== "gold" && input.headwinds >= config.headwindLimit) exposure = 0;
    if (input.unavailable?.includes(key) || !input.states[key] || input.states[key] === "PENDING") exposure = 0;
    return [key, exposure];
  })) as Record<SleeveKey, number>;
}

/** Each asset must propose the same new exposure at consecutive weekly reviews.
 * Unchanged targets never trigger a calendar rebalance. All counters are causal. */
export function weeklyExposurePlan(inputs: AllocationInput[], rule: LabRule, config: LabConfig): AllocationInput[] {
  const held: Record<SleeveKey, number> = { stocks: 0, gold: 0, bitcoin: 0 };
  const pending = { ...held }, counts = { ...held };
  let previousWeek = "";
  return inputs.map(input => {
    const currentWeek = week(input.date);
    if (currentWeek !== previousWeek) {
      const proposal = proposedExposure(input, rule, config);
      for (const { key } of SLEEVES) {
        counts[key] = proposal[key] === pending[key] ? counts[key] + 1 : 1;
        pending[key] = proposal[key];
        if (counts[key] >= config.confirmationWeeks) held[key] = proposal[key];
      }
      previousWeek = currentWeek;
    }
    return { ...input, states: Object.fromEntries(SLEEVES.map(({ key }) => [key, stateOf(held[key])])) };
  });
}

export interface Campaign {
  from: string; to: string; direction: "Defensive" | "Rebuilding" | "Rotation"; legs: number;
  fromExposure: number; toExposure: number; dates: string[];
}
export function countCampaigns(plan: AllocationInput[]): Campaign[] {
  const campaigns: Campaign[] = [];
  const exposure = (input: AllocationInput) => SLEEVES.reduce((v, s) => v + s.cap * fraction(input.states[s.key]), 0);
  // Initial deployment and the final mark with no following holding period are excluded.
  for (let i = 1; i < plan.length - 1; i++) {
    const deltas = SLEEVES.map(s => fraction(plan[i].states[s.key]) - fraction(plan[i - 1].states[s.key])).filter(d => d !== 0);
    if (!deltas.length) continue;
    const direction = deltas.every(d => d <= 0) ? "Defensive" : deltas.every(d => d >= 0) ? "Rebuilding" : "Rotation";
    const last = campaigns.at(-1);
    if (last && last.direction === direction && direction !== "Rotation") {
      last.to = plan[i].date; last.toExposure = exposure(plan[i]); last.legs++; last.dates.push(plan[i].date);
    } else campaigns.push({ from: plan[i].date, to: plan[i].date, direction, legs: 1, dates: [plan[i].date], fromExposure: exposure(plan[i - 1]), toExposure: exposure(plan[i]) });
  }
  return campaigns;
}

export function expandLabInputs(data: ResearchDataset, config: LabConfig): AllocationInput[] {
  const trends = config.trendWindow === 21 ? data.vams21Signals : data.vams63Signals;
  if (!trends?.length) throw new Error(`Daily ${config.trendWindow}-observation history is unavailable. Run npm --prefix backend run backtest:trends.`);
  const byDate = new Map(trends.map(s => [s.date, s]));
  const latest = SLEEVES.reduce((date, s) => { const d = data.prices[s.key]?.at(-1)?.date; if (!d) throw new Error(`Missing ${s.label} history.`); return d < date ? d : date; }, config.to);
  const out: AllocationInput[] = [];
  let cursor = -1;
  for (const bar of data.prices.stocks ?? []) {
    if (bar.date < "2015-01-01" || bar.date > latest) continue;
    while (cursor + 1 < data.signals.length && data.signals[cursor + 1].date <= bar.date) cursor++;
    if (cursor < 0) continue;
    const signal = data.signals[cursor], trend = byDate.get(bar.date);
    if (!signal.signalDate || signal.signalDate >= bar.date) throw new Error(`Macro observation cannot execute on ${bar.date}.`);
    if (!trend || !trend.signalDate || trend.signalDate >= bar.date || SLEEVES.some(s => trend.unavailable.includes(s.key) || !trend.states[s.key] || trend.states[s.key] === "PENDING"))
      throw new Error(`Missing warmed prior-date trend for ${bar.date}.`);
    out.push({ ...signal, date: bar.date, states: trend.states });
  }
  return out;
}
const compounded = (steps: BacktestResult["steps"], field: "periodReturn" | "cashReturn" = "periodReturn") => steps.reduce((v, s) => v * (1 + s[field]), 1) - 1;

export function forwardObservations(inputs: AllocationInput[], results: Record<string, BacktestResult>, data: ResearchDataset, horizon: number) {
  const out: { from: string; to: string; features: Record<string, number>; outcomes: Record<string, number> }[] = [];
  const reference = Object.values(results)[0];
  for (let i = 0; i + horizon < inputs.length; i += horizon) {
    const input = inputs[i], to = inputs[i + horizon].date;
    const cash = compounded(reference.steps.slice(i, i + horizon), "cashReturn");
    const features: Record<string, number> = { "Market risk-on": +(input.marketRegime === "GOLDILOCKS" || input.marketRegime === "REFLATION"), "Cycle headwinds": input.headwinds };
    // Missing regimes do not silently become an all-zero known class.
    for (const q of REGIMES) { features[`Market: ${q}`] = input.marketRegime ? +(input.marketRegime === q) : NaN; features[`Economic: ${q}`] = input.economicQuadrant ? +(input.economicQuadrant === q) : NaN; }
    if (!input.marketRegime) features["Market risk-on"] = NaN;
    for (const { key, label } of SLEEVES) features[`${label} trend`] = input.states[key] === "BULLISH" ? 1 : input.states[key] === "NEUTRAL" ? 0 : input.states[key] === "BEARISH" ? -1 : NaN;
    const outcomes: Record<string, number> = {};
    for (const { key, label } of SLEEVES) {
      const a = backtestPrice(data.prices[key], input.date, true), b = backtestPrice(data.prices[key], to, true);
      outcomes[label] = a !== null && b !== null ? (b / a) / (1 + cash) - 1 : NaN;
    }
    for (const [id, result] of Object.entries(results)) outcomes[id] = (1 + compounded(result.steps.slice(i, i + horizon))) / (1 + cash) - 1;
    out.push({ from: input.date, to, features, outcomes });
  }
  return out;
}

export function runInternalResearch(data: ResearchDataset, value: unknown) {
  if (data.version !== RESEARCH_VERSION) throw new Error("Unsupported history version.");
  const config = validateLabConfig(value, data.through), allInputs = expandLabInputs(data, config), inputs = allInputs.filter(i => i.date >= config.from);
  if (inputs.length < 253) throw new Error("Choose at least one year of common history.");
  const split = inputs.find(i => i.date >= config.split)?.date ?? config.split;
  if (inputs.filter(i => i.date < split).length < 63 || inputs.filter(i => i.date >= split).length < 64) throw new Error("Allow at least 63 sessions on either side of the split.");
  const opts = { settings: TREND_SETTINGS, costBpsByAsset: config.costs, costBps: 10, cashMode: "treasury-bills" as const, strictPrices: true, benchmarkPrices: data.benchmarkPrices, benchmarks: {} };
  const staticInputs = inputs.map(i => ({ ...i, states: { stocks: "BULLISH", gold: "BULLISH", bitcoin: "BULLISH" } as const }));
  const results: Record<string, BacktestResult> = {
    static: runAllocationBacktest(staticInputs, data.prices, { ...opts, rebalance: "monthly" }),
    hold: runAllocationBacktest(staticInputs, data.prices, { ...opts, rebalance: "signal" }),
  };
  const campaigns: Record<string, Campaign[]> = { static: [], hold: [] };
  for (const rule of LAB_RULES) {
    const plan = weeklyExposurePlan(allInputs, rule.id, config).filter(i => i.date >= config.from);
    results[rule.id] = runAllocationBacktest(plan, data.prices, { ...opts, rebalance: "signal" });
    campaigns[rule.id] = countCampaigns(plan);
  }
  const base = results.static, baseReturns = base.steps.map(s => s.periodReturn), cash = base.steps.map(s => s.cashReturn);
  const earlier = (r: BacktestResult) => summarizeBacktest(r.steps.filter(s => s.endDate <= split));
  const later = (r: BacktestResult) => summarizeBacktest(r.steps.filter(s => s.date >= split));
  const rows = Object.entries(results).map(([id, r]) => {
    const metrics = r.metrics, deltaSharpe = metrics.sharpe !== null && base.metrics.sharpe !== null ? metrics.sharpe - base.metrics.sharpe : null;
    const interval = id === "static" ? [0, 0] as [number, number] : pairedSharpeRange(r.steps.map(s => s.periodReturn), baseReturns, cash, metrics.steps / metrics.years);
    const active = id !== "static" && id !== "hold";
    const years = [...new Set(r.steps.map(s => s.endDate.slice(0, 4)))].map(year => ({ year, metrics: summarizeBacktest(r.steps.filter(s => s.endDate.startsWith(year))),
      campaigns: campaigns[id].filter(e => e.from.startsWith(year)).length, tradeDates: r.steps.filter(s => s.date.startsWith(year) && s.turnover > 1e-10).length }));
    return { id, name: id === "static" ? "Static 60/30/10 · monthly" : id === "hold" ? "60/30/10 · buy and hold" : LAB_RULES.find(rule => rule.id === id)!.name,
      description: id === "static" ? "Monthly restoration to 60/30/10; the primary benchmark." : id === "hold" ? "Buy 60/30/10 once; allow weights to drift." : LAB_RULES.find(rule => rule.id === id)!.description,
      metrics, earlier: earlier(r), later: later(r), deltaSharpe, sharpeAdvantageRange: interval,
      screen: !active ? "Benchmark" : metrics.sharpe === null || metrics.sharpe <= 1 ? "Below Sharpe 1" : deltaSharpe === null || deltaSharpe <= 0 ? "No benchmark advantage" : interval === null || interval[0] <= 0 ? "Advantage uncertain" : years.some(y => y.campaigns > 3) ? "Too many directional moves" : "Clears exploratory screen",
      campaigns: campaigns[id], campaignsPerYear: campaigns[id].length / metrics.years,
      frequencyWithinTarget: active ? years.every(y => y.campaigns <= 3) : null,
      tradeDates: r.steps.filter(s => s.turnover > 1e-10).length, years,
      curve: [{ date: r.steps[0].date, equity: 1, invested: r.steps[0].allocation.invested }, ...r.steps.map(s => ({ date: s.endDate, equity: s.equity, invested: s.allocation.invested }))],
    };
  });
  const observations = forwardObservations(inputs, results, data, config.horizon);
  const correlations = Object.keys(observations[0]?.features ?? {}).flatMap(feature => Object.keys(observations[0]?.outcomes ?? {}).map(outcome => {
    const summary = (sample: typeof observations) => correlation(sample.map(s => s.features[feature]), sample.map(s => s.outcomes[outcome]));
    return { feature, outcome, ...summary(observations), earlier: summary(observations.filter(s => s.to <= split)), later: summary(observations.filter(s => s.from >= split)) };
  }));
  const dailySeries = Object.fromEntries([
    ...SLEEVES.map(s => [s.label, inputs.slice(0, -1).map((input, i) => backtestPrice(data.prices[s.key], inputs[i + 1].date, true)! / backtestPrice(data.prices[s.key], input.date, true)! - 1)] as const),
    ...Object.entries(results).map(([id, r]) => [id, r.steps.map(s => s.periodReturn)] as const),
  ]);
  const returnCorrelations = Object.keys(dailySeries).flatMap(a => Object.keys(dailySeries).map(b => ({ a, b, ...correlation(dailySeries[a], dailySeries[b]) })));
  const phases = analyzeMacroPhases(inputs, data.prices, base, Object.fromEntries(LAB_RULES.map(r => [r.id, results[r.id]])), config.phaseBasis, split);
  return { version: LAB_VERSION, config, split, through: base.metrics.to, generatedAt: new Date().toISOString(),
    dataset: { generatedAt: data.generatedAt, through: data.through, vams21GeneratedAt: data.vams21GeneratedAt, vams63GeneratedAt: data.vams63GeneratedAt },
    rows, phases, correlations, returnCorrelations, observations: observations.map(o => ({ ...o, features: Object.fromEntries(Object.entries(o.features).map(([k, v]) => [k, Number.isFinite(v) ? v : null])) })),
    warnings: [
      "Historical market regimes and cycle counts are monthly reconstructions from the existing engine, using revised data and approximate release lags. They are not archived weekly or real-time signals.",
      "The 21/63-observation trend signals are our own volatility-adjusted momentum proxies. None of these rules is a verified replica of 42 Macro's Dr. Mo.",
      "Weekly reviews use prior-date signals at the first equity-session close. New exposure must persist for the selected consecutive reviews. Unchanged targets do not rebalance; asset weights may drift beyond their entry targets.",
      "One directional campaign can contain several execution dates. Initial deployment is excluded; reversing direction starts another campaign. Simultaneous increases and reductions are counted as rotations. Campaigns spanning years are assigned to their starting year. Every execution incurs costs.",
      "Forward correlations use disjoint holding windows, with features known at each window's start. Outcomes are subsequent relative returns versus cash. Observations can remain dependent and a repeated monthly label does not create independent macro events.",
      "Correlations with rule returns partly reflect rules that themselves use those signals. Raw asset outcomes offer a more direct check of predictive content; neither establishes incremental portfolio value without the benchmark comparison.",
      "Sharpe advantage ranges are exploratory paired 21-session block bootstrap ranges from 500 draws. They are not corrected for model selection or repeated testing. Clearing the screen is not proof of a deployable edge.",
      "Cost inputs are editable all-in one-way estimates, not verified broker quotes. BIL returns include distributions and fund expenses. Taxes, intraday extremes and Bitcoin weekend drawdown extremes are excluded. Asset closes are asynchronous.",
    ] };
}
export type InternalResearchResult = ReturnType<typeof runInternalResearch>;
