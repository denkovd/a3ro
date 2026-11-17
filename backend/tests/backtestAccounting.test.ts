import { test } from "node:test";
import assert from "node:assert/strict";
import { BASELINE_SETTINGS, type AllocationInput } from "../src/macro/allocation";
import { runAllocationBacktest, summarizeBacktest, type PricePoint } from "../src/macro/allocationBacktest";
import { RESEARCH_VERSION, defaultResearchConfig, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";

const point = (date: string, close: number): PricePoint => ({ date, close });
const input = (date: string, regime: AllocationInput["marketRegime"] = "GOLDILOCKS"): AllocationInput => ({ date, marketRegime: regime,
  economicQuadrant: regime, headwinds: 0, states: { stocks: "BULLISH", gold: "BULLISH", bitcoin: "BULLISH" } });
const allStocks = { ...structuredClone(BASELINE_SETTINGS), caps: { stocks: 1, gold: 0, bitcoin: 0 } };
const halfStocks = { ...structuredClone(BASELINE_SETTINGS), caps: { stocks: 0.5, gold: 0, bitcoin: 0 } };
const days = ["2020-01-01", "2020-01-02", "2020-01-03", "2020-01-06"];

test("idle cash accrues at the supplied bill series, not at the constant rate", () => {
  const bills = [100, 100.1, 100.3, 100.2].map((close, i) => point(days[i], close));
  const idle = days.map(d => input(d, null));
  const result = runAllocationBacktest(idle, {}, { cashPrices: bills, cashRate: 0.2, benchmarks: {} });
  assert.ok(Math.abs(result.metrics.totalReturn - 0.002) < 1e-12);
  assert.deepEqual(result.steps.map(s => s.riskFreeReturn), result.steps.map(s => s.periodReturn));
  assert.equal(result.cashSource, "series");
  assert.equal(result.riskFreeSource, "series");
  // All cash against bills is exactly zero excess: no ratio, rather than a divide-by-noise number.
  assert.equal(result.metrics.sharpe, 0);
  assert.equal(result.metrics.sortino, 0);
});

test("a half-invested book earns the asset on one half and bills on the other", () => {
  const stocks = [100, 110, 110, 110].map((close, i) => point(days[i], close));
  const bills = [100, 101, 101, 101].map((close, i) => point(days[i], close));
  const result = runAllocationBacktest(days.map(d => input(d)), { stocks }, { settings: halfStocks, costBps: 0, cashPrices: bills, benchmarks: {} });
  assert.ok(Math.abs(result.steps[0].periodReturn - (0.5 * 0.10 + 0.5 * 0.01)) < 1e-12);
  const constant = runAllocationBacktest(days.map(d => input(d)), { stocks }, { settings: halfStocks, costBps: 0, benchmarks: {} });
  assert.ok(Math.abs(constant.steps[0].periodReturn - 0.05) < 1e-12);
  assert.equal(constant.cashSource, "constant");
});

test("Sharpe and Sortino are annualised excess-return ratios against the risk-free series", () => {
  const stocks = [100, 102, 100.98, 104.0094].map((close, i) => point(days[i], close)); // +2%, −1%, +3%
  const bills = [100, 100.1, 100.2001, 100.3003001].map((close, i) => point(days[i], close)); // +0.1% a step
  const result = runAllocationBacktest(days.map(d => input(d)), { stocks },
    { settings: allStocks, costBps: 0, riskFreePrices: bills, benchmarks: { SPY: { stocks: 1 } } });
  const excess = [0.02, -0.01, 0.03].map(r => r - 0.001);
  const mean = excess.reduce((a, b) => a + b, 0) / 3;
  const sampleSd = Math.sqrt(excess.reduce((sum, e) => sum + (e - mean) ** 2, 0) / 2);
  const downside = Math.sqrt(excess.reduce((sum, e) => sum + Math.min(e, 0) ** 2, 0) / 3);
  const years = (Date.parse("2020-01-06") - Date.parse("2020-01-01")) / (365.25 * 86400000);
  const annualiser = Math.sqrt(3 / years);
  assert.ok(Math.abs(result.metrics.sharpe - mean / sampleSd * annualiser) < 1e-6);
  assert.ok(Math.abs(result.metrics.sortino - mean / downside * annualiser) < 1e-6);
  // The same definition applies to benchmarks and to any slice of the ledger.
  assert.equal(result.benchmarks.SPY.sharpe, result.metrics.sharpe);
  assert.equal(summarizeBacktest(result.steps).sortino, result.metrics.sortino);
  // Cash stayed on the constant 0% assumption; only the yardstick is the bill series.
  assert.equal(result.cashSource, "constant");
  assert.equal(result.riskFreeSource, "series");
});

test("without a series the constant cash assumption is the risk-free leg", () => {
  const stocks = [100, 102, 100.98, 104.0094].map((close, i) => point(days[i], close));
  const zero = runAllocationBacktest(days.map(d => input(d)), { stocks }, { settings: allStocks, costBps: 0, benchmarks: {} });
  const five = runAllocationBacktest(days.map(d => input(d)), { stocks }, { settings: allStocks, costBps: 0, cashRate: 0.05, benchmarks: {} });
  assert.equal(zero.riskFreeSource, "cash-rate");
  assert.ok(zero.steps.every(s => s.riskFreeReturn === 0));
  assert.ok(five.metrics.sharpe < zero.metrics.sharpe);
});

test("a supplied cash or risk-free series must cover every holding period", () => {
  const late = [point("2020-01-02", 100), point("2020-01-06", 101)];
  assert.throws(() => runAllocationBacktest(days.map(d => input(d, null)), {}, { cashPrices: late, benchmarks: {} }), /Missing or stale cash/);
  assert.throws(() => runAllocationBacktest(days.map(d => input(d, null)), {}, { riskFreePrices: late, benchmarks: {} }), /Missing or stale risk-free/);
  const stale = [point("2020-01-01", 100), point("2020-03-02", 101)];
  const sparse = ["2020-01-01", "2020-02-03", "2020-03-02"].map(d => input(d, null));
  assert.throws(() => runAllocationBacktest(sparse, {}, { cashPrices: stale, strictPrices: true, benchmarks: {} }), /Missing or stale cash/);
});

function dataset(billsFrom = 0): ResearchDataset {
  const dates: string[] = [];
  for (let day = 0; day < 1100; day++) {
    const date = new Date(Date.UTC(2020, 0, 1 + day));
    if (date.getUTCDay() > 0 && date.getUTCDay() < 6) dates.push(date.toISOString().slice(0, 10));
  }
  return { version: RESEARCH_VERSION, generatedAt: "2023-01-05T00:00:00Z", through: dates.at(-1)!, sources: [], warnings: [],
    signals: [{ ...input("2020-01-01", "DEFLATION"), signalDate: "2019-12-31" }],
    prices: { stocks: dates.map((d, i) => point(d, 100 + i)), gold: dates.map(d => point(d, 100)), bitcoin: dates.map(d => point(d, 100)) },
    benchmarkPrices: { bills: dates.slice(billsFrom).map((d, i) => point(d, 100 * 1.0001 ** i)) } };
}

test("research defaults to bill accrual; a zero constant rate reproduces the pre-accrual numbers", () => {
  const data = dataset(), config = { ...defaultResearchConfig(data.through), from: "2020-01-01", testFrom: "2021-01-01" };
  assert.equal(config.cashSource, "bills");
  assert.equal(config.tranches, 1);
  const bills = runResearch(data, config);
  const constant = runResearch(data, { ...config, cashSource: "constant", cashRate: 0 });
  assert.equal(bills.accounting.cashSource, "bills");
  assert.equal(bills.accounting.riskFree, "bills");
  assert.ok(bills.baseline.metrics.totalReturn > constant.baseline.metrics.totalReturn);
  // Cash yield moves return, not the ranking yardstick: both runs are measured against bills.
  assert.equal(constant.accounting.riskFree, "bills");
  assert.ok(bills.baseline.metrics.sharpe > constant.baseline.metrics.sharpe);
  // A config saved before the option existed has no cashSource and must keep its constant-rate meaning.
  const { cashSource: _cash, tranches: _tranches, ...legacy } = config;
  const restored = runResearch(data, { ...legacy, cashRate: 0 });
  assert.equal(restored.accounting.cashSource, "constant");
  assert.deepEqual(restored.baseline.steps.map(s => s.periodReturn), constant.baseline.steps.map(s => s.periodReturn));
  assert.deepEqual(restored.candidate.steps.map(s => s.periodReturn), constant.candidate.steps.map(s => s.periodReturn));
});

test("bill accrual refuses a window that predates bill history; a fixed rate still runs", () => {
  const data = dataset(300), config = { ...defaultResearchConfig(data.through), from: "2020-01-01", testFrom: "2022-01-03" };
  assert.throws(() => runResearch(data, config), /Treasury-bill \(BIL\) history starts 2021-02-24/);
  const fixed = runResearch(data, { ...config, cashSource: "constant", cashRate: 0.02 });
  assert.equal(fixed.accounting.riskFree, "cash-assumption");
  assert.equal(fixed.baseline.riskFreeSource, "cash-rate");
  delete data.benchmarkPrices;
  assert.throws(() => runResearch(data, config), /no Treasury-bill/);
});
