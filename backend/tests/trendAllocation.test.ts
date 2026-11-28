import { test } from "node:test";
import assert from "node:assert/strict";
import { BASELINE_SETTINGS, TREND_SETTINGS, computeAllocation, type AllocationInput } from "../src/macro/allocation";
import { runAllocationBacktest } from "../src/macro/allocationBacktest";
import { defaultResearchConfig } from "../src/macro/backtestResearch";
import { computeVams, type VamsState } from "../src/macro/vams";

const input = (states: AllocationInput["states"], date = "2020-01-02"): AllocationInput => ({ date, states,
  marketRegime: "DEFLATION", economicQuadrant: "INFLATION", headwinds: 6 });
const states = (state: VamsState) => ({ stocks: state, gold: state, bitcoin: state });

test("trend rule: targets are 100/50/0 exposure in bullish/neutral/bearish conditions despite macro headwinds", () => {
  for (const [state, invested, cash] of [["BULLISH", 1, 0], ["NEUTRAL", 0.5, 0.5], ["BEARISH", 0, 1]] as const) {
    const allocation = computeAllocation(input(states(state)), TREND_SETTINGS);
    assert.equal(allocation.invested, invested);
    assert.equal(allocation.cash, cash);
    assert.deepEqual(allocation.weights.map(w => w.weight), [0.6 * invested, 0.3 * invested, 0.1 * invested]);
    assert.ok(allocation.weights.every(w => w.model === "trend" && w.regimeScore === 1 && w.cycleDrag === 1));
  }
});

test("each asset responds independently and a bullish hedge survives bearish stocks and Bitcoin", () => {
  const mixed = computeAllocation(input({ stocks: "NEUTRAL", gold: "BULLISH", bitcoin: "BEARISH" }), TREND_SETTINGS);
  assert.deepEqual(mixed.weights.map(w => w.weight), [0.3, 0.3, 0]);
  assert.equal(mixed.cash, 0.4);
  const defensive = computeAllocation(input({ stocks: "BEARISH", gold: "BULLISH", bitcoin: "BEARISH" }), TREND_SETTINGS);
  assert.equal(defensive.weights.find(w => w.key === "gold")!.weight, 0.3);
  assert.equal(defensive.cash, 0.7);
});

test("valid asset signals do not need macro coverage; pending, absent and unavailable assets hold cash", () => {
  assert.equal(computeAllocation({ ...input(states("BULLISH")), marketRegime: null, economicQuadrant: null }, TREND_SETTINGS).invested, 1);
  assert.equal(computeAllocation(input({}), TREND_SETTINGS).cash, 1);
  assert.equal(computeAllocation(input(states("PENDING")), TREND_SETTINGS).cash, 1);
  const missing = computeAllocation({ ...input(states("BULLISH")), unavailable: ["bitcoin"] }, TREND_SETTINGS);
  assert.equal(missing.invested, 0.9);
  assert.equal(missing.cash, 0.1);
});

test("the live default is still the approved macro rule; the trend rule applies only when asked for", () => {
  const original = input(states("BULLISH"));
  assert.equal(BASELINE_SETTINGS.model, undefined);
  assert.deepEqual(computeAllocation(original), computeAllocation(original, BASELINE_SETTINGS));
  assert.notEqual(computeAllocation(original).invested, computeAllocation(original, TREND_SETTINGS).invested);
  assert.equal(computeAllocation({ ...original, marketRegime: null, economicQuadrant: null }).cash, 1);
  assert.ok(computeAllocation(original).weights.every(w => w.model === undefined));
});

test("trend simulator trades bullish-neutral-bearish-neutral-bullish changes within a month", () => {
  const sequence: VamsState[] = ["BULLISH", "NEUTRAL", "BEARISH", "NEUTRAL", "BULLISH", "BULLISH"];
  const inputs = sequence.map((state, i) => input(states(state), `2020-01-${String(2 + i).padStart(2, "0")}`));
  const bars = inputs.map(s => ({ date: s.date, close: 100 }));
  const prices = { stocks: bars, gold: bars, bitcoin: bars };
  const result = runAllocationBacktest(inputs, prices, { settings: TREND_SETTINGS, rebalance: "monthly-signal", cashMode: "treasury-bills", benchmarkPrices: { bills: bars }, costBps: 10, benchmarks: {} });
  [1, 0.5, 0, 0.5, 1].forEach((expected, i) => assert.ok(Math.abs(result.steps[i].allocation.invested - expected) < 1e-12));
  assert.ok(result.steps.slice(1).every(s => s.rebalanced && s.reason === "signal-change"));
  assert.ok(Math.abs(result.metrics.totalReturn - (0.999 ** 5 - 1)) < 1e-8);
});

test("the existing 63-observation signal has a neutral band between rising and falling trends", () => {
  for (const [drift, expected] of [[0.003, "BULLISH"], [0, "NEUTRAL"], [-0.003, "BEARISH"]] as const) {
    let price = 100;
    const bars = Array.from({ length: 64 }, (_, i) => {
      if (i) price *= Math.exp(drift + (i % 2 ? 0.01 : -0.01));
      return { date: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), close: price, open: price, high: price, low: price };
    });
    assert.equal(computeVams(bars, "^GSPC", "Stocks").state, expected);
  }
});

test("the published research panel keeps the live rule as its baseline", () => {
  assert.deepEqual(defaultResearchConfig("2026-11-01").settings, BASELINE_SETTINGS);
});
