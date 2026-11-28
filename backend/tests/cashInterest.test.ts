import { test } from "node:test";
import assert from "node:assert/strict";
import { TREND_SETTINGS, type AllocationInput } from "../src/macro/allocation";
import { runAllocationBacktest, type PricePoint } from "../src/macro/allocationBacktest";

const input = (date: string): AllocationInput => ({ date, marketRegime: "GOLDILOCKS", economicQuadrant: null,
  headwinds: 0, states: { stocks: "BULLISH", gold: "BULLISH", bitcoin: "BULLISH" } });
const series = (dates: string[], values: number[]): PricePoint[] => dates.map((date, i) => ({ date, close: values[i] }));
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const halfStocks = { ...structuredClone(TREND_SETTINGS), caps: { stocks: 0.5, gold: 0, bitcoin: 0 } };

test("all-cash strategy compounds BIL distributions and matches buy-and-hold bills after entry cost", () => {
  const dates = ["2020-01-02", "2020-01-03", "2020-01-06"];
  const result = runAllocationBacktest(dates.map(date => ({ ...input(date), states: {} })), {}, {
    settings: TREND_SETTINGS, cashMode: "treasury-bills", cashRate: 0.25, costBps: 10, strictPrices: true,
    benchmarkPrices: { bills: series(dates, [100, 101, 102.01]) }, benchmarks: { BIL: { bills: 1 }, cash: {} },
  });
  close(result.metrics.totalReturn, 0.999 * 1.0201 - 1);
  assert.equal(result.metrics.totalReturn, result.benchmarks.BIL.totalReturn);
  assert.equal(result.metrics.totalReturn, result.benchmarks.cash.totalReturn);
  close(result.steps[0].cashReturn, 0.01);
  close(result.steps[1].cashReturn, 0.01);
  assert.equal(result.steps[0].turnover, 1);
  assert.equal(result.steps[1].turnover, 0);
});

test("cash income changes drifting weights and both sides of a monthly rebalance pay costs", () => {
  const dates = ["2020-01-02", "2020-01-03", "2020-02-03", "2020-02-04"];
  const result = runAllocationBacktest(dates.map(input), { stocks: series(dates, [100, 200, 200, 200]) }, {
    settings: halfStocks, cashMode: "treasury-bills", costBps: 100, strictPrices: true,
    benchmarkPrices: { bills: series(dates, [100, 110, 121, 121]) }, benchmarks: { half: { stocks: 0.5 } },
  });
  close(result.steps[0].periodReturn, 0.99 * 1.55 - 1);
  close(result.steps[1].allocation.cash, 0.55 / 1.55);
  close(result.steps[1].periodReturn, (0.55 / 1.55) * 0.1);
  assert.equal(result.steps[1].turnover, 0);
  close(result.steps[2].turnover, 2 * (1 / 1.605 - 0.5));
  assert.equal(result.steps[2].allocation.cash, 0.5);
  assert.equal(result.metrics.totalReturn, result.benchmarks.half.totalReturn);
  result.steps.forEach(s => close(s.turnover, s.benchmarkTurnover.half));
});

test("fully invested benchmark returns are unchanged by cash mode; Sharpe changes with the cash reference", () => {
  const dates = ["2020-01-02", "2020-01-03", "2020-02-03", "2020-02-04"];
  const prices = { stocks: series(dates, [100, 110, 105, 120]), gold: series(dates, [100, 98, 102, 104]) };
  const opts = { settings: halfStocks, costBps: 10, strictPrices: true,
    benchmarkPrices: { bills: series(dates, [100, 100.01, 100.2, 100.21]) },
    benchmarks: { stock: { stocks: 1 }, mixed: { stocks: 0.6, gold: 0.4 }, BIL: { bills: 1 } } };
  const fixed = runAllocationBacktest(dates.map(input), prices, { ...opts, cashMode: "fixed" });
  const historical = runAllocationBacktest(dates.map(input), prices, { ...opts, cashMode: "treasury-bills" });
  for (const name of Object.keys(fixed.benchmarks)) {
    // Sharpe and Sortino are measured against the cash leg, so only they may differ.
    const { sharpe: a, sortino: _hs, ...historicalMetrics } = historical.benchmarks[name];
    const { sharpe: b, sortino: _fs, ...fixedMetrics } = fixed.benchmarks[name];
    assert.deepEqual(historicalMetrics, fixedMetrics);
    assert.notEqual(a, b);
  }
});

test("BIL cash requires valid past prices even when permissive asset pricing is requested", () => {
  const dates = ["2020-01-02", "2020-01-03"];
  for (const bills of [undefined, series(["2020-01-03"], [100]), series(["2019-12-01"], [100]),
    series(dates, [100, NaN]), series(dates, [100, 0])]) {
    assert.throws(() => runAllocationBacktest(dates.map(date => ({ ...input(date), states: {} })), {}, {
      settings: TREND_SETTINGS, cashMode: "treasury-bills", benchmarkPrices: { bills }, benchmarks: {}, strictPrices: false,
    }), /Historical Treasury-bill cash needs BIL/);
  }
});

test("bill ETF losses remain visible and are not replaced by the fixed cash rate", () => {
  const dates = ["2020-01-02", "2020-01-03"];
  const result = runAllocationBacktest(dates.map(date => ({ ...input(date), states: {} })), {}, {
    settings: TREND_SETTINGS, cashMode: "treasury-bills", cashRate: 0.1, costBps: 0,
    benchmarkPrices: { bills: series(dates, [100, 99]) }, benchmarks: {},
  });
  close(result.metrics.totalReturn, -0.01);
  close(result.steps[0].cashReturn, -0.01);
});
