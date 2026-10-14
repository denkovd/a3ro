import { test } from "node:test";
import assert from "node:assert/strict";
import { BASELINE_SETTINGS, computeAllocation, type AllocationInput } from "../src/macro/allocation";
import { runAllocationBacktest, summarizeBacktest } from "../src/macro/allocationBacktest";
import { RESEARCH_VERSION, defaultResearchConfig, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";
import { parseYahooAdjusted } from "../src/regime/yahooHistory";
import type { RegimeBar } from "../src/regime/types";
const bar = (date: string, close: number): RegimeBar => ({ date, close, open: close, high: close, low: close });
const input = (date: string): AllocationInput => ({ date, marketRegime: "GOLDILOCKS", economicQuadrant: "GOLDILOCKS", headwinds: 0,
  states: { stocks: "BULLISH", gold: "BULLISH", bitcoin: "BULLISH" } });
const stocksOnly = { ...structuredClone(BASELINE_SETTINGS), caps: { stocks: 0.5, gold: 0, bitcoin: 0 } };
test("holdings drift without phantom rebalancing, then turnover uses drifted weights", () => {
  const inputs = [input("2020-01-01"), input("2020-01-02"), input("2020-04-01"), input("2020-04-02")];
  const prices = { stocks: inputs.map((i, n) => bar(i.date, n === 0 ? 100 : 200)) };
  const result = runAllocationBacktest(inputs, prices, { settings: stocksOnly, costBps: 0, rebalance: "quarterly", benchmarks: {} });
  assert.equal(result.steps[0].periodReturn, 0.5);
  assert.ok(Math.abs(result.steps[1].allocation.invested - 2 / 3) < 1e-12);
  assert.equal(result.steps[1].rebalanced, false);
  assert.ok(Math.abs(result.steps[2].turnover - 1 / 6) < 1e-12);
});
test("entry costs reduce strategy and S&P on identical terms", () => {
  const settings = { ...stocksOnly, caps: { stocks: 1, gold: 0, bitcoin: 0 } };
  const inputs = [input("2020-01-01"), input("2021-01-01")];
  const result = runAllocationBacktest(inputs, { stocks: [bar(inputs[0].date, 100), bar(inputs[1].date, 110)] },
    { settings, costBps: 100, benchmarks: { SPY: { stocks: 1 } } });
  assert.ok(Math.abs(result.metrics.totalReturn - 0.089) < 1e-8);
  assert.equal(result.metrics.totalReturn, result.benchmarks.SPY.totalReturn);
});
test("cash earns the disclosed annual rate and CAGR uses calendar time", () => {
  const inputs = [input("2020-01-01"), input("2021-01-01")].map(i => ({ ...i, marketRegime: null, economicQuadrant: null }));
  const result = runAllocationBacktest(inputs, {}, { cashRate: 0.05, benchmarks: {} });
  assert.ok(Math.abs(result.metrics.cagr - 0.05) < 1e-8);
  assert.equal(result.metrics.to, "2021-01-01");
});
test("strict pricing refuses missing, stale and future-only asset prices", () => {
  const inputs = [input("2020-02-01"), input("2020-03-01")];
  for (const prices of [{}, { stocks: [bar("2020-01-01", 100)] }, { stocks: [bar("2020-02-02", 100)] }])
    assert.throws(() => runAllocationBacktest(inputs, prices, { settings: stocksOnly, strictPrices: true, benchmarks: {} }), /Missing or stale/);
});
test("invalid allocation parameters and unsorted dates are rejected", () => {
  assert.throws(() => computeAllocation(input("2020-01-01"), { ...stocksOnly, caps: { stocks: 0.9, gold: 0.9, bitcoin: 0 } }), /Caps/);
  assert.throws(() => runAllocationBacktest([input("2020-02-01"), input("2020-01-01")], {}), /ascending/);
  assert.throws(() => runAllocationBacktest([], {}, { cashRate: NaN }), /Invalid/);
});
test("slice summaries compound period returns instead of full-window benchmark equity", () => {
  const inputs = [input("2020-01-01"), input("2020-01-02"), input("2020-01-03")];
  const result = runAllocationBacktest(inputs, { stocks: inputs.map((i, n) => bar(i.date, 100 * 2 ** n)) },
    { settings: stocksOnly, costBps: 0, benchmarks: { SPY: { stocks: 1 } } });
  assert.equal(summarizeBacktest(result.steps.slice(1), "SPY").totalReturn, 1);
});
function dataset(): ResearchDataset {
  const dates: string[] = [];
  for (let day = 0; day < 1100; day++) {
    const date = new Date(Date.UTC(2020, 0, 1 + day));
    if (date.getUTCDay() > 0 && date.getUTCDay() < 6) dates.push(date.toISOString().slice(0, 10));
  }
  return { version: RESEARCH_VERSION, generatedAt: "2023-01-05T00:00:00Z", through: dates.at(-1)!, sources: [], warnings: [],
    signals: [{ ...input("2020-01-01"), signalDate: "2019-12-31" }],
    prices: { stocks: dates.map((d, i) => bar(d, 100 + i)), gold: dates.map(d => bar(d, 100)), bitcoin: dates.map(d => bar(d, 100)) } };
}
test("research candidate cannot mutate baseline and validation uses disjoint periods", () => {
  const data = dataset(), config = { ...defaultResearchConfig(data.through), from: "2020-01-01", testFrom: "2021-01-01" };
  const original = JSON.stringify(BASELINE_SETTINGS);
  const first = runResearch(data, config);
  config.settings.caps.stocks = 0.1;
  const second = runResearch(data, config);
  assert.equal(second.baseline.metrics.totalReturn, first.baseline.metrics.totalReturn);
  assert.notEqual(second.candidate.metrics.totalReturn, first.candidate.metrics.totalReturn);
  assert.equal(JSON.stringify(BASELINE_SETTINGS), original);
  assert.equal(second.development.candidate.strategy.steps + second.validation.candidate.strategy.steps, second.candidate.metrics.steps);
  assert.equal(second.development.candidate.strategy.to, second.validation.candidate.strategy.from);
  assert.equal(second.regimes.reduce((sum, r) => sum + r.days, 0), second.candidate.steps.length);
});
test("research refuses same-day signal execution and insufficient validation", () => {
  const data = dataset(), config = { ...defaultResearchConfig(data.through), from: "2020-01-01", testFrom: "2021-01-01" };
  data.signals[0].signalDate = "2020-01-01";
  assert.throws(() => runResearch(data, config), /cannot execute/);
  data.signals[0].signalDate = "2019-12-31";
  assert.throws(() => runResearch(data, { ...config, testFrom: "2020-01-02" }), /three months/);
});
test("research reports a common end date instead of treating a missing final asset price as flat", () => {
  const data = dataset(), config = { ...defaultResearchConfig(data.through), from: "2020-01-01", testFrom: "2021-01-01" };
  data.prices.bitcoin = data.prices.bitcoin!.slice(0, -2);
  const result = runResearch(data, config);
  assert.equal(result.candidate.metrics.to, data.prices.bitcoin.at(-1)!.date);
  assert.equal(result.candidate.benchmarks["Static 60/30/10"].to, result.candidate.metrics.to);
  assert.match(result.coverageNote ?? "", /last shared equity-session mark/);
});
test("adjusted ETF closes include distributions; missing adjusted prices fail loud", () => {
  const body = { chart: { result: [{ timestamp: [1577836800, 1577923200], indicators: {
    quote: [{ open: [100, 100], high: [100, 100], low: [100, 100], close: [100, 100] }],
    adjclose: [{ adjclose: [90, 100] }] } }] } };
  const prices = parseYahooAdjusted(body, "SPY");
  assert.equal(prices[0].close, 90);
  assert.equal(prices[1].close, 100);
  assert.throws(() => parseYahooAdjusted({ chart: { result: [{ ...body.chart.result[0], indicators: { quote: body.chart.result[0].indicators.quote } }] } }, "SPY"), /Adjusted closes missing/);
});
