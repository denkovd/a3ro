import { test } from "node:test";
import assert from "node:assert/strict";
import { BASELINE_SETTINGS, type AllocationInput } from "../src/macro/allocation";
import { runAllocationBacktest, type PricePoint, type BenchmarkPriceSeries } from "../src/macro/allocationBacktest";
import { availableBenchmarks, researchBenchmarks, BENCHMARK_ASSETS, BUY_HOLD_ASSETS, NVIDIA_HOLD_NAME } from "../src/macro/researchBenchmarks";
import { runResearch, defaultResearchConfig, RESEARCH_VERSION, type ResearchDataset } from "../src/macro/backtestResearch";

const input = (date: string): AllocationInput => ({ date, marketRegime: "GOLDILOCKS", economicQuadrant: "GOLDILOCKS",
  headwinds: 0, states: { stocks: "BULLISH", gold: "BULLISH", bitcoin: "BULLISH" } });
const settings = { ...structuredClone(BASELINE_SETTINGS), caps: { stocks: 0, gold: 0, bitcoin: 0 } };
const series = (dates: string[], closes: number[]): PricePoint[] => dates.map((date, i) => ({ date, close: closes[i] }));

test("60/40 and Buffett models use their actual bond sleeves", () => {
  const dates = ["2020-01-01", "2020-01-02"];
  const result = runAllocationBacktest(dates.map(input), { stocks: series(dates, [100, 200]) },
    { settings, costBps: 0, strictPrices: true, benchmarkPrices: { bonds: series(dates, [100, 50]), shortTreasury: series(dates, [100, 110]) },
      benchmarks: { balanced: { stocks: 0.6, bonds: 0.4 }, buffett: { stocks: 0.9, shortTreasury: 0.1 } } });
  assert.equal(result.benchmarks.balanced.totalReturn, 0.4);
  assert.equal(result.benchmarks.buffett.totalReturn, 0.91);
});
test("mixed benchmarks drift and pay costs on monthly bond and stock trades", () => {
  const dates = ["2020-01-01", "2020-01-02", "2020-02-03", "2020-02-04"];
  const result = runAllocationBacktest(dates.map(input), { stocks: series(dates, [100, 200, 200, 200]) },
    { settings, costBps: 100, benchmarkPrices: { bonds: series(dates, [100, 100, 100, 100]) },
      benchmarks: { balanced: { stocks: 0.6, bonds: 0.4 } } });
  // Initial purchase 1%; post-rally drift 75/25; trade 30% back to 60/40.
  assert.ok(Math.abs(result.benchmarks.balanced.totalReturn - (0.99 * 1.6 * 0.997 - 1)) < 1e-8);
  assert.equal(result.steps[1].benchmarkReturns.balanced, 0);
  assert.ok(Math.abs(result.benchmarks.balanced.totalTurnover - 1.3) < 1e-12);
});
test("Treasury bill benchmark uses adjusted prices independently of constant cash assumptions", () => {
  const dates = ["2020-01-01", "2021-01-01"];
  const options = { settings, costBps: 0, benchmarkPrices: { bills: series(dates, [100, 102]) }, benchmarks: { bills: { bills: 1 } } };
  const first = runAllocationBacktest(dates.map(input), {}, { ...options, cashRate: 0 });
  const second = runAllocationBacktest(dates.map(input), {}, { ...options, cashRate: 0.25 });
  assert.equal(first.benchmarks.bills.totalReturn, 0.02);
  assert.equal(second.benchmarks.bills.totalReturn, 0.02);
  assert.ok(second.metrics.totalReturn > first.metrics.totalReturn);
});
test("definitions include every requested comparison and never exceed 100%", () => {
  const definitions = researchBenchmarks("all");
  assert.equal(definitions.length, 10 + BUY_HOLD_ASSETS.length);
  assert.deepEqual(definitions.find(b => b.name === "Bitcoin buy-and-hold")?.weights, { bitcoin: 1 });
  assert.deepEqual(definitions.find(b => b.name === NVIDIA_HOLD_NAME)?.weights, { nvidia: 1 });
  assert.deepEqual(definitions.find(b => b.name === "Gold (GLD) buy-and-hold")?.weights, { gold: 1 });
  assert.ok(!definitions.some(b => /Money Line|Donchian/i.test(b.name)));
  assert.deepEqual(definitions.find(b => b.name === "Buffett 90/10 model")?.weights, { stocks: 0.9, shortTreasury: 0.1 });
  assert.deepEqual(definitions.find(b => b.name === "Berkshire Hathaway (BRK.B)")?.weights, { berkshire: 1 });
  assert.equal(definitions.find(b => b.name === "All Weather-style model")?.weights.commodities, 0.075);
  for (const definition of definitions) assert.ok(Math.abs(Object.values(definition.weights).reduce((a, b) => a + b, 0) - 1) < 1e-12);
});
test("short histories are unavailable for the full window and cannot distort other comparisons", () => {
  const dates = ["2020-01-01", "2020-01-02"];
  const definitions = researchBenchmarks("all");
  const availability = availableBenchmarks(definitions, { stocks: series(dates, [100, 110]) },
    { bills: series(["2020-01-02"], [100]), allWeatherFund: series(["2025-03-06"], [100]) }, dates);
  assert.equal(availability[0].available, true);
  assert.equal(availability.find(b => b.name === "Treasury bills (BIL)")?.available, false);
  assert.match(availability.find(b => b.name === "Bridgewater All Weather ETF (ALLW)")?.reason ?? "", /2025-03-06/);
  const missing = availableBenchmarks([{ name: "Gap", description: "", weights: { bonds: 1 } }], {},
    { bonds: series(["2020-01-01", "2020-02-01"], [100, 100]) }, ["2020-01-01", "2020-01-20", "2020-02-01"]);
  assert.match(missing[0].reason ?? "", /missing or stale/);
  const live = availableBenchmarks([definitions.at(-1)!], {},
    { allWeatherFund: series(["2025-03-06", "2025-03-07"], [100, 101]) }, ["2025-03-06", "2025-03-07"]);
  assert.equal(live[0].available, true);
});
test("all benchmark summaries share the strategy window and appear in period/regime diagnostics", () => {
  const dates: string[] = [];
  for (let i = 0; i < 1100; i++) {
    const date = new Date(Date.UTC(2020, 0, i + 1));
    if (date.getUTCDay() > 0 && date.getUTCDay() < 6) dates.push(date.toISOString().slice(0, 10));
  }
  const prices = series(dates, dates.map((_, i) => 100 + i / 10));
  const benchmarkPrices: BenchmarkPriceSeries = Object.fromEntries(BENCHMARK_ASSETS.filter(a => a.key !== "allWeatherFund").map(a => [a.key, prices]));
  benchmarkPrices.allWeatherFund = series(["2025-03-06"], [100]);
  const dataset: ResearchDataset = { version: RESEARCH_VERSION, generatedAt: "2023-01-05T00:00:00Z", through: dates.at(-1)!,
    signals: [{ ...input(dates[0]), signalDate: "2019-12-31" }], prices: { stocks: prices, gold: prices, bitcoin: prices }, benchmarkPrices, sources: [], warnings: [] };
  const result = runResearch(dataset, { ...defaultResearchConfig(dataset.through), from: dates[0], testFrom: "2021-01-01" });
  assert.equal(Object.keys(result.candidate.benchmarks).length, researchBenchmarks("all").length - 1);
  assert.ok(!result.benchmarkAvailability.some(b => /Money Line|Donchian/i.test(b.name)));
  assert.equal(result.candidate.benchmarks["Bridgewater All Weather ETF (ALLW)"], undefined);
  for (const [name, metrics] of Object.entries(result.candidate.benchmarks)) {
    assert.equal(metrics.from, result.candidate.metrics.from);
    assert.equal(metrics.to, result.candidate.metrics.to);
    assert.equal(result.development.candidate.benchmarks[name].steps + result.validation.candidate.benchmarks[name].steps, metrics.steps);
    const compounded = result.years.reduce((equity, year) => equity * (1 + year.benchmarks[name].totalReturn), 1) - 1;
    assert.ok(Math.abs(compounded - metrics.totalReturn) < 1e-6);
    assert.equal(result.regimes.find(r => r.regime === "GOLDILOCKS")?.benchmarks[name].totalReturn, metrics.totalReturn);
  }
});
test("single-stock buy-and-hold reinvests adjusted returns and never trades at monthly boundaries", () => {
  const dates = ["2020-01-01", "2020-01-02", "2020-02-03", "2020-02-04"];
  const result = runAllocationBacktest(dates.map(input), {}, { settings, costBps: 100, strictPrices: true,
    benchmarkPrices: { nvidia: series(dates, [100, 200, 100, 150]) }, benchmarks: { [NVIDIA_HOLD_NAME]: { nvidia: 1 } } });
  assert.equal(result.benchmarks[NVIDIA_HOLD_NAME].totalReturn, 0.485);
  assert.equal(result.benchmarks[NVIDIA_HOLD_NAME].totalTurnover, 1);
  assert.equal(result.steps[2].benchmarkTurnover[NVIDIA_HOLD_NAME], 0);
  assert.equal(result.benchmarks[NVIDIA_HOLD_NAME].maxDrawdown, -0.5);
});
test("a newer stock stays unavailable in an earlier full window", () => {
  const definition = researchBenchmarks("all").find(b => b.weights.arista === 1)!;
  const result = availableBenchmarks([definition], {}, { arista: series(["2014-06-06", "2020-01-02"], [10, 100]) }, ["2005-01-03", "2020-01-02"]);
  assert.equal(result[0].available, false);
  assert.match(result[0].reason!, /ANET covers 2014-06-06/);
});
