import { BASELINE_SETTINGS, SLEEVES, type AllocationInput, type AllocationSettings,
  type Quadrant, type SleeveKey } from "./allocation";
import { backtestPrice, runAllocationBacktest, summarizeBacktest, type BacktestOptions,
  type BacktestResult, type BenchmarkPriceSeries, type PriceSeries } from "./allocationBacktest";
import { availableBenchmarks, researchBenchmarks, SP_BENCHMARK } from "./researchBenchmarks";
import { runVams21Backtest, VAMS_21_NAME, VAMS_21_TWO_ASSET_NAME, type DailyVamsSignal } from "./vams21Backtest";

export const RESEARCH_VERSION = "regime-allocation-v1";
export const REGIMES: Quadrant[] = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"];
/** Sessions/observations of each multi-horizon trend z-score stored per signal row. */
export const TREND_HORIZONS = [21, 63, 126, 252] as const;
/** One monthly signal row. The optional fields are research enrichment (signal schema 2):
 * they never feed the allocation rule, so rows without them simulate identically. */
export interface ResearchSignal extends AllocationInput {
  signalDate: string;
  /** Normalised regime vote shares from the risk matrix (sum ≈ 1); null when no market voted. */
  regimeShares?: Record<Quadrant, number> | null;
  /** Markets with a live trend state behind those shares, out of the universe attempted. */
  marketsScored?: number; marketsAttempted?: number;
  /** Volatility-adjusted momentum z per sleeve and horizon, keyed by horizon ("21", "63", …).
   * Horizons count each signal instrument's own observations (Bitcoin trades seven days a week);
   * null while a horizon is not yet warmed up. */
  trendZ?: Partial<Record<SleeveKey, Record<string, number | null>>>;
  /** Realised S&P 500 volatility at the signal date: annualised σ of the last 21 daily log
   * returns, and the median of that same measure over the trailing 126 sessions (the current
   * session included). Either is null until its window is warm. */
  equityVol?: { realised21: number | null; median126: number | null };
  /** Breadth of the regime universe on its 63-observation trend score. `positive` counts markets
   * with z above zero, `measured` those with any score that day, `universe` those attempted.
   * `share` is positive ÷ measured: a market too young to have a score is not counted as negative. */
  universeBreadth63?: { positive: number; measured: number; universe: number; share: number | null };
}
export interface ResearchDataset {
  version: string; generatedAt: string; through: string;
  signals: ResearchSignal[];
  /** 2 once rows carry regimeShares, trendZ, equityVol and universeBreadth63. Absent on datasets built before the enrichment. */
  signalSchema?: number;
  trendHorizons?: number[];
  /** Macro release lags, in days from the observation date, the signals were built with. */
  releaseLagDays?: { daily: number; weekly: number; monthly: number; quarterly: number; corporateProfitsQ4: number };
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
  costBps: number;
  /** "bills": idle cash earns the dataset's adjusted BIL series. "constant": the fixed annual
   * `cashRate`. Omitted on configs saved before bill accrual existed, which stay "constant". */
  cashSource?: "bills" | "constant";
  cashRate: number;
  /** Staggered rebalance tranches for the test strategy. Omitted or 1 = single-day rebalance. */
  tranches?: number;
}
export function defaultResearchConfig(through: string): ResearchConfig {
  return { from: "2015-01-01", to: through, testFrom: "2022-01-01", universe: "all",
    settings: structuredClone(BASELINE_SETTINGS), rebalance: "monthly-regime", costBps: 10,
    cashSource: "bills", cashRate: 0, tranches: 1 };
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
  // Treasury bills are the cash leg (when selected) and the risk-free leg for Sharpe/Sortino
  // whenever they cover the whole window. Never splice a pre-inception bill return.
  const bills = dataset.benchmarkPrices?.bills;
  const billsCover = !!bills?.length && inputs.every(input => backtestPrice(bills, input.date, true) !== null);
  const cashSource = config.cashSource ?? "constant";
  if (cashSource !== "bills" && cashSource !== "constant") throw new Error("Cash must earn Treasury bills or a fixed annual rate.");
  if (cashSource === "bills" && !billsCover) throw new Error(bills?.length
    ? `Treasury-bill (BIL) history starts ${bills[0].date} and does not cover this window. Start later or use a fixed annual cash rate.`
    : "This dataset has no Treasury-bill (BIL) history. Refresh the benchmark data or use a fixed annual cash rate.");
  const cashLegs: Pick<BacktestOptions, "cashRate" | "cashPrices" | "riskFreePrices"> = { cashRate: config.cashRate,
    cashPrices: cashSource === "bills" ? bills : undefined, riskFreePrices: billsCover ? bills : undefined };
  const benchmarkAvailability = availableBenchmarks(researchBenchmarks(config.universe), dataset.prices,
    dataset.benchmarkPrices ?? {}, inputs.map(input => input.date));
  const vamsName = config.universe === "all" ? VAMS_21_NAME : VAMS_21_TWO_ASSET_NAME;
  let vams21: BacktestResult | null = null, vamsReason: string | null = null;
  try {
    if (!dataset.vams21Signals?.length) throw new Error("Daily 21-day VAMS signals have not been loaded.");
    vams21 = runVams21Backtest(inputs, dataset.vams21Signals, dataset.prices, config.universe,
      { costBps: config.costBps, ...cashLegs });
  } catch (error) { vamsReason = error instanceof Error ? error.message : "Unable to simulate 21-day VAMS."; }
  const vamsDefinition = { name: vamsName,
    description: "21-observation volatility-adjusted momentum per asset, ±0.5 threshold. Caps: stocks 60%, gold 30%, Bitcoin 10%. Bullish holds 100% of its cap, neutral 50%, bearish 0%; unused exposure is cash. Signals use prior-date index/gold-futures/Bitcoin bars, execute at the next equity-session close and rebalance on signal changes plus monthly. No macro regime or cycle reductions. In the two-asset window, Bitcoin's 10% stays in cash.",
    weights: { stocks: 0.6, gold: 0.3, bitcoin: config.universe === "all" ? 0.1 : 0 },
    available: vams21 !== null, reason: vamsReason };
  const options: BacktestOptions = { costBps: config.costBps, ...cashLegs, strictPrices: true,
    benchmarkPrices: dataset.benchmarkPrices,
    benchmarks: Object.fromEntries(benchmarkAvailability.filter(b => b.available).map(b => [b.name, b.weights])) };
  const baseline = runAllocationBacktest(inputs, dataset.prices, { ...options, settings: BASELINE_SETTINGS, rebalance: "monthly-regime" });
  // Tranching is a test-strategy option; the fixed baseline keeps its single-day rebalance.
  // Spread across roughly one month of sessions: two tranches ten sessions apart, four tranches five apart.
  const tranches = config.tranches ?? 1;
  const candidate = runAllocationBacktest(inputs, dataset.prices, { ...options, settings: config.settings, rebalance: config.rebalance,
    tranches, trancheSpacing: tranches > 1 && Number.isInteger(tranches) ? Math.floor(20 / tranches) : undefined });
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
  // Same days grouped by the economic quadrant in force (growth × inflation data), not the market vote.
  const economicByDate = new Map(inputs.map(input => [input.date, input.economicQuadrant ?? null]));
  const economicRegimes = REGIMES.map(regime => {
    const inRegime = (s: { date: string }) => economicByDate.get(s.date) === regime;
    const steps = candidate.steps.filter(inRegime);
    return { regime, days: steps.length, months: new Set(steps.map(s => s.date.slice(0, 7))).size, candidate: summarizeBacktest(steps),
      baseline: summarizeBacktest(baseline.steps.filter(inRegime)), benchmark: summarizeBacktest(steps, SP_BENCHMARK), benchmarks: summarizeBenchmarks(steps) };
  });
  const coverageNote = candidate.metrics.to < config.to
    ? `Comparisons end on ${candidate.metrics.to}, the last shared equity-session mark inside your requested window. Selected portfolio assets have complete overlapping history through ${latestCommonPrice}.`
    : null;
  const accounting = { cashSource,
    riskFree: billsCover ? "bills" as const : "cash-assumption" as const,
    note: billsCover
      ? `Sharpe and Sortino are excess-return ratios against Treasury bills (BIL). Idle cash earns ${cashSource === "bills" ? "the same bill return" : `a fixed ${(config.cashRate * 100).toFixed(2)}% a year`}.`
      : `Treasury-bill history does not cover this window, so Sharpe and Sortino are measured against the fixed ${(config.cashRate * 100).toFixed(2)}% cash assumption.` };
  return { baseline, candidate, years, regimes, economicRegimes, benchmarkAvailability, coverageNote, accounting,
    development: { baseline: summary(baseline, config.from, split), candidate: summary(candidate, config.from, split) },
    validation: { baseline: summary(baseline, split, config.to), candidate: summary(candidate, split, config.to) } };
}
export type ResearchResult = ReturnType<typeof runResearch>;
