/* ────────────────────────────────────────────────────────────────
   Walk-forward backtest of the three-sleeve allocation.

   Rebalances monthly AND on any regime change — the monthly cadence
   matches the GRID's monthly inputs, the regime trigger stops the book
   sitting in a stale stance for up to four weeks after a shift. Dale's
   own timing view ("you don't get paid for being too early") argues
   against reacting faster than this, not slower.

   NO LOOK-AHEAD. The allocation for period t is computed from
   information dated ≤ t, and earns the return from t to t+1. The
   AllocationInput array the caller supplies must obey this; the
   backtest additionally refuses to price a sleeve on a date it has no
   bar for, rather than reaching forward to the next available price.

   Costs are modelled as a per-unit-turnover haircut. Crude, but the
   alternative — ignoring them — flatters a rule that rebalances at
   every regime change, which is exactly the rule under test.

   Pure, no IO.
──────────────────────────────────────────────────────────────── */

import { RegimeBar } from "../regime/types";
import {
  Allocation,
  AllocationInput,
  SleeveKey,
  SLEEVES,
  computeAllocation,
  weightOf,
} from "./allocation";

/** One-way cost per unit of turnover. 10bp — retail ETF-ish, and
 *  generous for BTC. Overridable per run. */
export const DEFAULT_COST_BPS = 10;

export interface PricePoint {
  date: string;
  close: number;
}

export type PriceSeries = Partial<Record<SleeveKey, RegimeBar[]>>;

export interface BacktestStep {
  date: string;
  regime: Allocation["regime"];
  rebalanced: boolean;
  reason: "monthly" | "regime-change" | "hold";
  allocation: Allocation;
  /** Portfolio return over this step, net of cost, as a fraction. */
  periodReturn: number;
  turnover: number;
  equity: number;
  /** Benchmark equity curves over the same steps. */
  benchmarkEquity: Record<string, number>;
}

export interface BacktestMetrics {
  from: string;
  to: string;
  steps: number;
  years: number;
  totalReturn: number;
  cagr: number;
  /** Annualised σ of step returns. */
  volatility: number;
  /** Return ÷ volatility. Risk-free is taken as zero and NOT
   *  subtracted — over a window including 5% cash rates that flatters
   *  every series equally, so it is comparable across the strategy and
   *  its benchmarks but is not a true Sharpe ratio. Named accordingly. */
  returnToVol: number;
  maxDrawdown: number;
  /** Fraction of steps with a positive return. */
  hitRate: number;
  averageInvested: number;
  totalTurnover: number;
}

export interface BacktestResult {
  steps: BacktestStep[];
  metrics: BacktestMetrics;
  benchmarks: Record<string, BacktestMetrics>;
  /** Sleeves that never had usable prices in this window. */
  missingSleeves: SleeveKey[];
}

/* ── price helpers ────────────────────────────────────────────── */

/** Close on or before `date`, or null. Never reaches forward. */
function closeOnOrBefore(bars: RegimeBar[], date: string): number | null {
  let found: number | null = null;
  for (const b of bars) {
    if (b.date <= date) found = b.close;
    else break;
  }
  return found;
}

/** Simple return between two dates for one sleeve, or null when either
 *  end is unpriced. */
function sleeveReturn(bars: RegimeBar[] | undefined, from: string, to: string): number | null {
  if (!bars || bars.length === 0) return null;
  const a = closeOnOrBefore(bars, from);
  const b = closeOnOrBefore(bars, to);
  if (a === null || b === null || a <= 0) return null;
  return b / a - 1;
}

/** Months differ → a monthly rebalance is due. */
function isNewMonth(prev: string, next: string): boolean {
  return prev.slice(0, 7) !== next.slice(0, 7);
}

/* ── metrics ──────────────────────────────────────────────────── */

function metricsFrom(
  dates: string[],
  returns: number[],
  invested: number[],
  turnover: number[],
  stepsPerYear: number,
): BacktestMetrics {
  const n = returns.length;
  if (n === 0) {
    return {
      from: "", to: "", steps: 0, years: 0, totalReturn: 0, cagr: 0,
      volatility: 0, returnToVol: 0, maxDrawdown: 0, hitRate: 0,
      averageInvested: 0, totalTurnover: 0,
    };
  }

  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of returns) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = equity / peak - 1;
    if (dd < maxDd) maxDd = dd;
  }

  const years = n / stepsPerYear;
  const mean = returns.reduce((a, r) => a + r, 0) / n;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / n;
  const vol = Math.sqrt(variance) * Math.sqrt(stepsPerYear);
  const cagr = years > 0 && equity > 0 ? equity ** (1 / years) - 1 : 0;

  const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
  return {
    from: dates[0],
    to: dates[dates.length - 1],
    steps: n,
    years: Math.round(years * 100) / 100,
    totalReturn: r4(equity - 1),
    cagr: r4(cagr),
    volatility: r4(vol),
    returnToVol: vol > 0 ? r4(cagr / vol) : 0,
    maxDrawdown: r4(maxDd),
    hitRate: r4(returns.filter((r) => r > 0).length / n),
    averageInvested: r4(invested.reduce((a, v) => a + v, 0) / n),
    totalTurnover: r4(turnover.reduce((a, v) => a + v, 0)),
  };
}

/* ── the backtest ─────────────────────────────────────────────── */

export interface BacktestOptions {
  costBps?: number;
  /** Steps per year, for annualising. Defaults to 12 (the inputs are
   *  monthly regime labels). */
  stepsPerYear?: number;
  /** Static benchmarks to run alongside, as sleeve→weight maps. */
  benchmarks?: Record<string, Partial<Record<SleeveKey, number>>>;
}

export const DEFAULT_BENCHMARKS: Record<string, Partial<Record<SleeveKey, number>>> = {
  "100% S&P": { stocks: 1 },
  "static 60/30/10": { stocks: 0.6, gold: 0.3, bitcoin: 0.1 },
};

/**
 * Run the allocation over a series of dated inputs.
 *
 * `inputs` must be ascending by date and each must be knowable at its
 * own date. The last input earns no return (there is no t+1), so it is
 * reported as the final allocation but contributes no step.
 */
export function runAllocationBacktest(
  inputs: AllocationInput[],
  prices: PriceSeries,
  opts: BacktestOptions = {},
): BacktestResult {
  const cost = (opts.costBps ?? DEFAULT_COST_BPS) / 10_000;
  const stepsPerYear = opts.stepsPerYear ?? 12;
  const benchmarks = opts.benchmarks ?? DEFAULT_BENCHMARKS;

  const missingSleeves = SLEEVES.filter(
    (s) => !prices[s.key] || (prices[s.key] as RegimeBar[]).length === 0,
  ).map((s) => s.key);

  const steps: BacktestStep[] = [];
  const dates: string[] = [];
  const returns: number[] = [];
  const investedSeries: number[] = [];
  const turnoverSeries: number[] = [];

  const benchReturns: Record<string, number[]> = {};
  const benchEquity: Record<string, number> = {};
  for (const name of Object.keys(benchmarks)) {
    benchReturns[name] = [];
    benchEquity[name] = 1;
  }

  let held: Allocation | null = null;
  let equity = 1;

  for (let i = 0; i < inputs.length - 1; i++) {
    const input = inputs[i];
    const next = inputs[i + 1];

    const target = computeAllocation(input);

    // Rebalance on a month boundary or a regime change; otherwise the
    // previous target is carried. (Weights drift with prices between
    // rebalances in reality; this models the intent, and turnover is
    // charged only when the target actually moves.)
    const regimeChanged: boolean = held !== null && held.regime !== target.regime;
    const monthly: boolean = held === null || isNewMonth(held.date, input.date);
    const rebalanced: boolean = held === null || monthly || regimeChanged;
    const reason: BacktestStep["reason"] = held === null || monthly
      ? "monthly"
      : regimeChanged
        ? "regime-change"
        : "hold";

    // `held === null` is redundant with `rebalanced` but narrows the
    // type for the compiler, which can't follow the mutual reference
    // through the loop-carried `held`.
    const active: Allocation = rebalanced || held === null ? target : held;

    let turnover = 0;
    if (rebalanced) {
      for (const s of SLEEVES) {
        turnover += Math.abs(weightOf(target, s.key) - (held ? weightOf(held, s.key) : 0));
      }
    }

    // Portfolio return: weight × sleeve return, cash earns nothing.
    // A sleeve with no price this period contributes nothing rather
    // than being assumed flat — its weight is already zero when it is
    // marked unavailable, so this only bites on a genuine data hole.
    let gross = 0;
    for (const s of SLEEVES) {
      const w = weightOf(active, s.key);
      if (w === 0) continue;
      const r = sleeveReturn(prices[s.key], input.date, next.date);
      if (r === null) continue;
      gross += w * r;
    }
    const netReturn = gross - turnover * cost;

    equity *= 1 + netReturn;
    dates.push(input.date);
    returns.push(netReturn);
    investedSeries.push(active.invested);
    turnoverSeries.push(turnover);

    const stepBench: Record<string, number> = {};
    for (const [name, wmap] of Object.entries(benchmarks)) {
      let br = 0;
      for (const s of SLEEVES) {
        const w = wmap[s.key] ?? 0;
        if (w === 0) continue;
        const r = sleeveReturn(prices[s.key], input.date, next.date);
        if (r === null) continue;
        br += w * r;
      }
      benchReturns[name].push(br);
      benchEquity[name] *= 1 + br;
      stepBench[name] = Math.round(benchEquity[name] * 10_000) / 10_000;
    }

    steps.push({
      date: input.date,
      regime: active.regime,
      rebalanced,
      reason,
      allocation: active,
      periodReturn: Math.round(netReturn * 100_000) / 100_000,
      turnover: Math.round(turnover * 10_000) / 10_000,
      equity: Math.round(equity * 10_000) / 10_000,
      benchmarkEquity: stepBench,
    });

    held = active;
  }

  const metrics = metricsFrom(dates, returns, investedSeries, turnoverSeries, stepsPerYear);
  const benchMetrics: Record<string, BacktestMetrics> = {};
  for (const [name, rs] of Object.entries(benchReturns)) {
    benchMetrics[name] = metricsFrom(
      dates,
      rs,
      rs.map(() => 1),
      rs.map(() => 0),
      stepsPerYear,
    );
  }

  return { steps, metrics, benchmarks: benchMetrics, missingSleeves };
}
