import { type AllocationInput, type AllocationSettings, type SleeveKey } from "./allocation";
import { runAllocationBacktest, type BacktestOptions, type PriceSeries } from "./allocationBacktest";
import type { VamsState } from "./vams";

export const VAMS_21_WINDOW = 21;
export const VAMS_21_THRESHOLD = 0.5;
export const VAMS_21_NAME = "60/30/10 · 21-day VAMS";
export const VAMS_21_TWO_ASSET_NAME = "60/30 + cash · 21-day VAMS";
export interface DailyVamsSignal {
  date: string; signalDate: string;
  states: Partial<Record<SleeveKey, VamsState>>;
  unavailable: SleeveKey[];
}
export const VAMS_21_SETTINGS: AllocationSettings = {
  caps: { stocks: 0.6, gold: 0.3, bitcoin: 0.1 },
  regimeScores: {
    stocks: { GOLDILOCKS: 1, REFLATION: 1, INFLATION: 1, DEFLATION: 1 },
    gold: { GOLDILOCKS: 1, REFLATION: 1, INFLATION: 1, DEFLATION: 1 },
    bitcoin: { GOLDILOCKS: 1, REFLATION: 1, INFLATION: 1, DEFLATION: 1 },
  },
  vamsMultipliers: { BULLISH: 1, NEUTRAL: 0.5, BEARISH: 0, PENDING: 0 },
  cycleDrag: 0,
};

/** Match daily signals to exactly the same holding intervals as the main
 * strategy. No future signal, monthly fallback or missing-signal flat return. */
export function runVams21Backtest(inputs: AllocationInput[], signals: DailyVamsSignal[], prices: PriceSeries,
  universe: "all" | "stocks-gold", assumptions: Pick<BacktestOptions, "costBps" | "cashRate">) {
  const byDate = new Map(signals.map(signal => [signal.date, signal]));
  const required: SleeveKey[] = universe === "all" ? ["stocks", "gold", "bitcoin"] : ["stocks", "gold"];
  const dailyInputs: AllocationInput[] = inputs.map(input => {
    const signal = byDate.get(input.date);
    if (!signal || signal.signalDate >= input.date || required.some(key => signal.unavailable.includes(key) || !signal.states[key] || signal.states[key] === "PENDING"))
      throw new Error(`21-day VAMS has no fully warmed, prior-date signal for ${input.date}.`);
    return { ...input, marketRegime: "GOLDILOCKS", economicQuadrant: null, headwinds: 0, states: signal.states,
      unavailable: universe === "all" ? [] : ["bitcoin"] };
  });
  return runAllocationBacktest(dailyInputs, prices, { ...assumptions, settings: VAMS_21_SETTINGS,
    rebalance: "monthly-signal", strictPrices: true, benchmarks: {} });
}
