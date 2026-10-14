import { BASELINE_SETTINGS, SLEEVES, type AllocationInput, type AllocationSettings,
  type Quadrant, type SleeveKey } from "./allocation";
import { runAllocationBacktest, summarizeBacktest, type BacktestOptions,
  type BacktestResult, type BenchmarkPriceSeries, type PriceSeries } from "./allocationBacktest";
import { availableBenchmarks, researchBenchmarks, SP_BENCHMARK } from "./researchBenchmarks";
import { runVams21Backtest, VAMS_21_NAME, VAMS_21_TWO_ASSET_NAME, type DailyVamsSignal } from "./vams21Backtest";

export const RESEARCH_VERSION = "regime-allocation-v1";
export const REGIMES: Quadrant[] = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"];
export interface ResearchDataset {
  version: string; generatedAt: string; through: string;
  signals: (AllocationInput & { signalDate: string })[];
  prices: PriceSeries;
  benchmarkPrices?: BenchmarkPriceSeries;
  benchmarkGeneratedAt?: string;
  vams21Signals?: DailyVamsSignal[];
  vams21GeneratedAt?: string;
  sources: string[];
  warnings: string[];
}
export interface ResearchConfig {
  from: string; to: string; testFrom: string;
  universe: "stocks-gold" | "all";
  settings: AllocationSettings;
  rebalance: NonNullable<BacktestOptions["rebalance"]>;
  costBps: number; cashRate: number;
}
export function defaultResearchConfig(through: string): ResearchConfig {
  return { from: "2015-01-01", to: through, testFrom: "2022-01-01", universe: "all",
    settings: structuredClone(BASELINE_SETTINGS), rebalance: "monthly-regime", costBps: 10, cashRate: 0 };
}
export function runResearch(dataset: ResearchDataset, config: ResearchConfig) {
  if (dataset.version !== RESEARCH_VERSION) throw new Error("Unsupported history version. Refresh the data.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.from) || !/^\d{4}-\d{2}-\d{2}$/.test(config.to) ||
      config.from >= config.to || config.to > dataset.through) throw new Error("Choose a valid date range within the available history.");
  if (config.testFrom <= config.from || config.testFrom >= config.to) throw new Error("The validation split must fall inside the test window.");
  const sleeves: SleeveKey[] = config.universe === "all" ? ["stocks", "gold", "bitcoin"] : ["stocks", "gold"];
  const excluded = SLEEVES.filter(s => !sleeves.includes(s.key)).map(s => s.key);
  const latestCommonPrice = sleeves.reduce((latest, sleeve) => {
    const last = dataset.prices[sleeve]?.at(-1)?.date;
    if (!last) throw new Error(`Missing ${sleeve} portfolio price history.`);
    return last < latest ? last : latest;
  }, config.to);
  // Expand monthly signals onto the equity trading calendar. Retain daily
  // marks so drawdowns and drifting weights aren't hidden by monthly sampling.
  const inputs: AllocationInput[] = [];
  let signalIndex = -1;
  for (const bar of dataset.prices.stocks ?? []) {
    if (bar.date < config.from || bar.date > latestCommonPrice) continue;
    while (signalIndex + 1 < dataset.signals.length && dataset.signals[signalIndex + 1].date <= bar.date) signalIndex++;
    if (signalIndex < 0) continue;
    const signal = dataset.signals[signalIndex];
    if (signal.signalDate >= bar.date) throw new Error("A signal cannot execute on or before its observation date.");
    if (sleeves.some(key => signal.unavailable?.includes(key))) throw new Error("This window predates usable history for a selected asset. Use 2015+ for all assets or 2005+ for stocks and gold.");
    inputs.push({ ...signal, date: bar.date, unavailable: excluded });
  }
  if (inputs.length < 252) throw new Error("Choose at least one year of overlapping price and signal history.");
  const benchmarkAvailability = availableBenchmarks(researchBenchmarks(config.universe), dataset.prices,
    dataset.benchmarkPrices ?? {}, inputs.map(input => input.date));
  const vamsName = config.universe === "all" ? VAMS_21_NAME : VAMS_21_TWO_ASSET_NAME;
  let vams21: BacktestResult | null = null, vamsReason: string | null = null;
  try {
    if (!dataset.vams21Signals?.length) throw new Error("Daily 21-day VAMS signals have not been loaded.");
    vams21 = runVams21Backtest(inputs, dataset.vams21Signals, dataset.prices, config.universe,
      { costBps: config.costBps, cashRate: config.cashRate });
  } catch (error) { vamsReason = error instanceof Error ? error.message : "Unable to simulate 21-day VAMS."; }
  const vamsDefinition = { name: vamsName,
    description: "21-observation volatility-adjusted momentum per asset, ±0.5 threshold. Caps: stocks 60%, gold 30%, Bitcoin 10%. Bullish holds 100% of its cap, neutral 50%, bearish 0%; unused exposure is cash. Signals use prior-date index/gold-futures/Bitcoin bars, execute at the next equity-session close and rebalance on signal changes plus monthly. No macro regime or cycle reductions. In the two-asset window, Bitcoin's 10% stays in cash.",
    weights: { stocks: 0.6, gold: 0.3, bitcoin: config.universe === "all" ? 0.1 : 0 },
    available: vams21 !== null, reason: vamsReason };
  const options: BacktestOptions = { costBps: config.costBps, cashRate: config.cashRate, strictPrices: true,
    benchmarkPrices: dataset.benchmarkPrices,
    benchmarks: Object.fromEntries(benchmarkAvailability.filter(b => b.available).map(b => [b.name, b.weights])) };
  const baseline = runAllocationBacktest(inputs, dataset.prices, { ...options, settings: BASELINE_SETTINGS, rebalance: "monthly-regime" });
  const candidate = runAllocationBacktest(inputs, dataset.prices, { ...options, settings: config.settings, rebalance: config.rebalance });
  // Attach the independently simulated daily strategy to the same ledger, so
  // charts, period diagnostics and exports all use identical holding dates.
  if (vams21) {
    for (const result of [baseline, candidate]) {
      result.benchmarks[vamsName] = vams21.metrics;
      result.steps.forEach((step, index) => {
        const dynamic = vams21!.steps[index];
        step.benchmarkEquity[vamsName] = dynamic.equity;
        step.benchmarkReturns[vamsName] = dynamic.periodReturn;
        step.benchmarkTurnover[vamsName] = dynamic.turnover;
        step.benchmarkInvested[vamsName] = dynamic.allocation.invested;
      });
    }
  }
  benchmarkAvailability.push(vamsDefinition);
  const summarizeBenchmarks = (steps: BacktestResult["steps"]) => Object.fromEntries(
    Object.keys(candidate.benchmarks).map(name => [name, summarizeBacktest(steps, name)]));
  const summary = (result: BacktestResult, from: string, to: string) => {
    const steps = result.steps.filter(s => s.date >= from && s.endDate <= to);
    return { strategy: summarizeBacktest(steps), benchmark: summarizeBacktest(steps, SP_BENCHMARK), benchmarks: summarizeBenchmarks(steps) };
  };
  // One continuous simulation, disjoint holding periods around the split.
  // The interval straddling a non-trading split is assigned to validation.
  const split = inputs.find(i => i.date >= config.testFrom)?.date ?? config.testFrom;
  if (candidate.steps.filter(s => s.endDate <= split).length < 63 || candidate.steps.filter(s => s.date >= split).length < 63)
    throw new Error("Allow at least three months on each side of the validation split.");
  const years = [...new Set(candidate.steps.map(s => s.endDate.slice(0, 4)))].map(year => {
    const steps = candidate.steps.filter(s => s.endDate.startsWith(year));
    return { year, candidate: summarizeBacktest(steps), baseline: summarizeBacktest(baseline.steps.filter(s => s.endDate.startsWith(year))),
      benchmark: summarizeBacktest(steps, SP_BENCHMARK), benchmarks: summarizeBenchmarks(steps) };
  });
  const regimes = REGIMES.map(regime => {
    const steps = candidate.steps.filter(s => s.regime === regime);
    return { regime, days: steps.length, months: new Set(steps.map(s => s.date.slice(0, 7))).size, candidate: summarizeBacktest(steps),
      baseline: summarizeBacktest(baseline.steps.filter(s => s.regime === regime)), benchmark: summarizeBacktest(steps, SP_BENCHMARK), benchmarks: summarizeBenchmarks(steps) };
  });
  const coverageNote = candidate.metrics.to < config.to
    ? `Comparisons end on ${candidate.metrics.to}, the last shared equity-session mark inside your requested window. Selected portfolio assets have complete overlapping history through ${latestCommonPrice}.`
    : null;
  return { baseline, candidate, years, regimes, benchmarkAvailability, coverageNote,
    development: { baseline: summary(baseline, config.from, split), candidate: summary(candidate, config.from, split) },
    validation: { baseline: summary(baseline, split, config.to), candidate: summary(candidate, split, config.to) } };
}
export type ResearchResult = ReturnType<typeof runResearch>;
