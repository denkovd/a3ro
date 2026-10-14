/* Pure simulator. The caller supplies signals known before execution.
 * Holdings drift; costs apply to traded notional; prices never look ahead. */
import { computeAllocation, SLEEVES, weightOf, type Allocation, type AllocationInput,
  type AllocationSettings, type SleeveKey } from "./allocation";
export const DEFAULT_COST_BPS = 10;
export interface PricePoint { date: string; close: number }
export type PriceSeries = Partial<Record<SleeveKey, PricePoint[]>>;
export type BenchmarkAssetKey = SleeveKey | "bonds" | "bills" | "shortTreasury" |
  "longTreasury" | "intermediateTreasury" | "commodities" | "berkshire" | "allWeatherFund" |
  "nvidia" | "amd" | "broadcom" | "arista" | "axon" | "fairIsaac" | "netflix" | "tesla" |
  "apple" | "microsoft" | "amazon" | "alphabet" | "meta" | "costco" | "texasPacific" | "nasdaq" | "semiconductors";
export type BenchmarkPriceSeries = Partial<Record<BenchmarkAssetKey, PricePoint[]>>;
export type BenchmarkWeights = Partial<Record<BenchmarkAssetKey, number>>;
export interface BacktestStep {
  date: string; endDate: string; regime: Allocation["regime"]; rebalanced: boolean;
  reason: "monthly" | "quarterly" | "regime-change" | "signal-change" | "hold";
  allocation: Allocation; periodReturn: number; turnover: number; equity: number;
  benchmarkEquity: Record<string, number>;
  benchmarkReturns: Record<string, number>;
  benchmarkTurnover: Record<string, number>;
  benchmarkInvested: Record<string, number>;
}
export interface BacktestMetrics {
  from: string; to: string; steps: number; years: number; totalReturn: number;
  cagr: number; volatility: number;
  /** CAGR / volatility, not a risk-free-adjusted Sharpe ratio. */
  returnToVol: number; maxDrawdown: number; hitRate: number;
  averageInvested: number; totalTurnover: number;
}
export interface BacktestResult {
  steps: BacktestStep[]; metrics: BacktestMetrics;
  benchmarks: Record<string, BacktestMetrics>; missingSleeves: SleeveKey[];
}
export interface BacktestOptions {
  costBps?: number;
  /** Retained for CLI compatibility. Annualisation now uses actual dates. */
  stepsPerYear?: number;
  benchmarks?: Record<string, BenchmarkWeights>;
  benchmarkPrices?: BenchmarkPriceSeries;
  settings?: AllocationSettings;
  rebalance?: "monthly" | "monthly-regime" | "monthly-signal" | "quarterly" | "regime" | "signal";
  /** Disclosed constant annual cash assumption. */
  cashRate?: number;
  strictPrices?: boolean;
}
export const DEFAULT_BENCHMARKS: Record<string, Partial<Record<SleeveKey, number>>> = {
  "100% S&P": { stocks: 1 },
  "static 60/30/10": { stocks: 0.6, gold: 0.3, bitcoin: 0.1 },
};
const ms = (date: string) => Date.parse(`${date}T00:00:00Z`);
const round = (n: number) => Math.round(n * 1e8) / 1e8;
export function backtestPrice(bars: PricePoint[] | undefined, date: string, strict: boolean): number | null {
  if (!bars?.length) return null;
  let lo = 0, hi = bars.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (bars[mid].date <= date) lo = mid + 1; else hi = mid; }
  const bar = bars[lo - 1];
  if (!bar || !Number.isFinite(bar.close) || bar.close <= 0 ||
      (strict && ms(date) - ms(bar.date) > 7 * 86400000)) return null;
  return bar.close;
}
export function summarizeBacktest(steps: BacktestStep[], benchmark?: string): BacktestMetrics {
  let equity = 1, peak = 1, maxDrawdown = 0;
  const returns = steps.map(s => {
    const r = benchmark
      ? s.benchmarkReturns[benchmark]
      : s.periodReturn;
    equity *= 1 + r; peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
    return r;
  });
  const n = steps.length;
  const years = n ? steps.reduce((sum, s) => sum + (ms(s.endDate) - ms(s.date)) / (365.25 * 86400000), 0) : 0;
  const periodsPerYear = years > 0 ? n / years : 0;
  const mean = n ? returns.reduce((a, b) => a + b, 0) / n : 0;
  const volatility = n ? Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / n * periodsPerYear) : 0;
  const cagr = years > 0 && equity > 0 ? equity ** (1 / years) - 1 : 0;
  return { from: steps[0]?.date ?? "", to: steps[n - 1]?.endDate ?? "", steps: n, years,
    totalReturn: round(equity - 1), cagr: round(cagr), volatility: round(volatility),
    returnToVol: volatility ? round(cagr / volatility) : 0, maxDrawdown: round(maxDrawdown),
    hitRate: n ? returns.filter(r => r > 0).length / n : 0,
    averageInvested: n ? steps.reduce((sum, s) => sum + (benchmark ? s.benchmarkInvested[benchmark] : s.allocation.invested), 0) / n : 0,
    totalTurnover: steps.reduce((sum, s) => sum + (benchmark ? s.benchmarkTurnover[benchmark] : s.turnover), 0) };
}
type Weights = Record<SleeveKey, number>;
const emptyWeights = (): Weights => ({ stocks: 0, gold: 0, bitcoin: 0 });
export function runAllocationBacktest(inputs: AllocationInput[], prices: PriceSeries, opts: BacktestOptions = {}): BacktestResult {
  const costBps = opts.costBps ?? DEFAULT_COST_BPS, cashRate = opts.cashRate ?? 0;
  if (!Number.isFinite(costBps) || costBps < 0 || costBps > 1000 ||
      !Number.isFinite(cashRate) || cashRate < 0 || cashRate > 0.25) throw new Error("Invalid trading cost or cash rate.");
  for (let i = 0; i < inputs.length; i++) {
    if (!Number.isFinite(ms(inputs[i].date)) || (i > 0 && inputs[i].date <= inputs[i - 1].date))
      throw new Error("Backtest dates must be valid and strictly ascending.");
  }
  for (const bars of Object.values({ ...prices, ...opts.benchmarkPrices })) {
    if (bars?.some((b, i) => !Number.isFinite(ms(b.date)) || (i > 0 && b.date <= bars[i - 1].date)))
      throw new Error("Price dates must be valid and strictly ascending.");
  }
  const benchmarks: Record<string, BenchmarkWeights> = opts.benchmarks ?? DEFAULT_BENCHMARKS;
  const allPrices = { ...opts.benchmarkPrices, ...prices };
  const assets = [...new Set<BenchmarkAssetKey>([
    ...SLEEVES.map(s => s.key), ...Object.values(benchmarks).flatMap(map => Object.keys(map) as BenchmarkAssetKey[]),
  ])];
  const benchEquity: Record<string, number> = {}, benchHeld: Record<string, BenchmarkWeights> = {};
  for (const [name, map] of Object.entries(benchmarks)) {
    const weights = { ...map };
    if (Object.values(weights).some(w => !Number.isFinite(w) || w < 0) ||
        Object.values(weights).reduce((a, b) => a + b, 0) > 1 + 1e-9) throw new Error("Invalid benchmark weights.");
    benchEquity[name] = 1; benchHeld[name] = weights;
  }
  const missingSleeves = SLEEVES.filter(s => !prices[s.key]?.length).map(s => s.key);
  let held = emptyWeights(), heldCash = 1, equity = 1;
  let previousRegime: Allocation["regime"] = null;
  const steps: BacktestStep[] = [];
  const cadence = opts.rebalance ?? "monthly-regime";
  for (let i = 0; i < inputs.length - 1; i++) {
    const input = inputs[i], next = inputs[i + 1];
    const target = computeAllocation(input, opts.settings);
    const month = i === 0 || input.date.slice(0, 7) !== inputs[i - 1].date.slice(0, 7);
    const quarter = i === 0 || Math.floor((Number(input.date.slice(5, 7)) - 1) / 3) !== Math.floor((Number(inputs[i - 1].date.slice(5, 7)) - 1) / 3) || input.date.slice(0, 4) !== inputs[i - 1].date.slice(0, 4);
    const changed = i > 0 && previousRegime !== target.regime;
    const signalChanged = i > 0 && SLEEVES.some(s => !input.unavailable?.includes(s.key) && input.states[s.key] !== inputs[i - 1].states[s.key]);
    const scheduled = cadence === "quarterly" ? quarter : cadence !== "regime" && cadence !== "signal" && month;
    const signalCadence = cadence === "monthly-signal" || cadence === "signal";
    const rebalanced = i === 0 || scheduled || (changed && (cadence === "regime" || cadence === "monthly-regime")) || (signalChanged && signalCadence);
    const reason: BacktestStep["reason"] = cadence === "signal" && rebalanced ? "signal-change" : scheduled || i === 0 ? (cadence === "quarterly" ? "quarterly" : "monthly") : rebalanced ? (signalCadence ? "signal-change" : "regime-change") : "hold";
    let turnover = 0;
    if (rebalanced) {
      for (const s of SLEEVES) { const w = weightOf(target, s.key); turnover += Math.abs(w - held[s.key]); held[s.key] = w; }
      heldCash = target.cash;
    }
    const invested = Object.values(held).reduce((a, b) => a + b, 0);
    const allocation: Allocation = { ...target, invested, cash: heldCash,
      weights: target.weights.map(w => ({ ...w, weight: held[w.key] })) };
    const rs: Partial<Record<BenchmarkAssetKey, number>> = {};
    for (const asset of assets) {
      const a = backtestPrice(allPrices[asset], input.date, opts.strictPrices ?? false);
      const b = backtestPrice(allPrices[asset], next.date, opts.strictPrices ?? false);
      const sleeve = SLEEVES.find(s => s.key === asset);
      const needed = (sleeve && held[sleeve.key] > 0) || Object.values(benchHeld).some(w => (w[asset] ?? 0) > 0);
      if ((a === null || b === null) && needed && opts.strictPrices)
        throw new Error(`Missing or stale ${sleeve?.label ?? asset} price for ${input.date} → ${next.date}.`);
      rs[asset] = a !== null && b !== null ? b / a - 1 : 0;
    }
    const cashReturn = (1 + cashRate) ** ((ms(next.date) - ms(input.date)) / (365.25 * 86400000)) - 1;
    const gross = SLEEVES.reduce((sum, s) => sum + held[s.key] * (rs[s.key] ?? 0), heldCash * cashReturn);
    const net = (1 - turnover * costBps / 10000) * (1 + gross) - 1;
    equity *= 1 + net;
    for (const s of SLEEVES) held[s.key] = held[s.key] * (1 + (rs[s.key] ?? 0)) / (1 + gross);
    heldCash = heldCash * (1 + cashReturn) / (1 + gross);
    const stepBench: Record<string, number> = {}, benchmarkReturns: Record<string, number> = {};
    const benchmarkTurnover: Record<string, number> = {}, benchmarkInvested: Record<string, number> = {};
    for (const [name, map] of Object.entries(benchmarks)) {
      // Buy-and-hold for single assets; mixed static targets rebalance monthly.
      let weights = benchHeld[name], traded = 0;
      if (i > 0 && month && Object.values(map).filter(w => w > 0).length > 1) {
        for (const asset of assets) traded += Math.abs((map[asset] ?? 0) - (weights[asset] ?? 0));
        weights = { ...map };
      }
      if (i === 0) traded = Object.values(weights).reduce((a, b) => a + b, 0);
      const cash = 1 - Object.values(weights).reduce((a, b) => a + b, 0);
      benchmarkTurnover[name] = traded;
      benchmarkInvested[name] = 1 - cash;
      const br = assets.reduce((sum, asset) => sum + (weights[asset] ?? 0) * (rs[asset] ?? 0), cash * cashReturn);
      const netBenchmark = (1 - traded * costBps / 10000) * (1 + br) - 1;
      benchEquity[name] *= 1 + netBenchmark;
      benchmarkReturns[name] = netBenchmark;
      benchHeld[name] = Object.fromEntries(assets.map(asset => [asset, (weights[asset] ?? 0) * (1 + (rs[asset] ?? 0)) / (1 + br)])) as BenchmarkWeights;
      stepBench[name] = benchEquity[name];
    }
    steps.push({ date: input.date, endDate: next.date, regime: target.regime, rebalanced, reason,
      allocation, periodReturn: net, turnover, equity, benchmarkEquity: stepBench, benchmarkReturns, benchmarkTurnover, benchmarkInvested });
    previousRegime = target.regime;
  }
  return { steps, metrics: summarizeBacktest(steps),
    benchmarks: Object.fromEntries(Object.keys(benchmarks).map(name => [name, summarizeBacktest(steps, name)])), missingSleeves };
}
