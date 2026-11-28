import { test } from "node:test";
import assert from "node:assert/strict";
import { TREND_SETTINGS, type AllocationInput, type Quadrant } from "../src/macro/allocation";
import { runAllocationBacktest, summarizeBacktest } from "../src/macro/allocationBacktest";
import { analyzeMacroPhases, episodeSummary } from "../src/macro/phaseResearch";
import { buildDailyVams } from "../src/macro/vams21History";

const input = (date: string, state: "BULLISH" | "BEARISH" = "BULLISH"): AllocationInput => ({ date,
  states: { stocks: state }, marketRegime: "GOLDILOCKS", economicQuadrant: "GOLDILOCKS", headwinds: 0 });
const settings = { ...TREND_SETTINGS, caps: { stocks: 1, gold: 0, bitcoin: 0 } };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("weekly holds through a midweek signal and month change, then trades after a Monday holiday", () => {
  const dates = ["2020-06-29", "2020-06-30", "2020-07-01", "2020-07-02", "2020-07-07", "2020-07-08"];
  const inputs = dates.map((d, i) => input(d, i ? "BEARISH" : "BULLISH"));
  const stocks = dates.map((date, i) => ({ date, close: [100, 110, 121, 121, 121, 200][i] }));
  const result = runAllocationBacktest(inputs, { stocks }, { settings, rebalance: "weekly", costBps: 10,
    cashMode: "treasury-bills", benchmarkPrices: { bills: dates.map(date => ({ date, close: 100 })) }, benchmarks: {} });
  assert.deepEqual(result.steps.map(s => s.rebalanced), [true, false, false, false, true]);
  assert.deepEqual(result.steps.map(s => s.reason), ["weekly", "hold", "hold", "hold", "weekly"]);
  close(result.steps[4].turnover, 2); // Sell stocks and buy bills.
  close(result.metrics.totalReturn, 0.999 * 1.21 * 0.998 - 1);
});

test("a calendar year change inside the same week does not force a weekly rebalance", () => {
  const dates = ["2020-12-30", "2020-12-31", "2021-01-01", "2021-01-04", "2021-01-05"];
  const result = runAllocationBacktest(dates.map(d => input(d)), { stocks: dates.map(date => ({ date, close: 100 })) },
    { settings, rebalance: "weekly", costBps: 0, benchmarks: {} });
  assert.deepEqual(result.steps.map(s => s.rebalanced), [true, false, false, true]);
});

test("Sharpe uses arithmetic cash excess, sample dispersion and calendar annualization", () => {
  const dates = ["2020-01-01", "2020-01-02", "2020-01-03", "2020-01-04"];
  const result = runAllocationBacktest(dates.map(d => input(d)), { stocks: dates.map(date => ({ date, close: 100 })) },
    { settings, costBps: 0, benchmarks: {} });
  const cash = [0.001, 0.002, 0.003];
  const steps = result.steps.map((s, i) => ({ ...s, periodReturn: [0.011, -0.018, 0.033][i], cashReturn: cash[i], riskFreeReturn: cash[i] }));
  // Excess [0.01, -0.02, 0.03], mean 1/150, sample variance 19/30000.
  close(summarizeBacktest(steps).sharpe, (1 / 150) / Math.sqrt(19 / 30000) * Math.sqrt(365.25));
  // No excess-return dispersion: main's convention is a Sharpe of 0, not a ratio of rounding noise.
  assert.equal(summarizeBacktest(steps.map(s => ({ ...s, periodReturn: s.riskFreeReturn }))).sharpe, 0);
  assert.equal(summarizeBacktest([]).sharpe, 0);
});

test("63-observation history requires 64 prior prices and cannot read execution or future bars", () => {
  let price = 100;
  const bars = Array.from({ length: 66 }, (_, i) => {
    price *= Math.exp(0.003 + (i % 2 ? 0.01 : -0.01));
    return { date: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), close: price, open: price, high: price, low: price };
  });
  const calendar = bars.slice(63, 65);
  const before = buildDailyVams({ stocks: bars }, calendar, 63);
  assert.ok(before[0].unavailable.includes("stocks"));
  assert.ok(!before[1].unavailable.includes("stocks"));
  assert.equal(before[1].states.stocks, "BULLISH");
  const changed = bars.map((b, i) => i >= 64 ? { ...b, close: 0.00001 } : b);
  assert.deepEqual(buildDailyVams({ stocks: changed }, calendar, 63), before);
  assert.equal(before[1].signalDate, bars[63].date);
});

function phaseFixture() {
  const labels: Quadrant[] = ["GOLDILOCKS", "REFLATION", "REFLATION", "INFLATION", "REFLATION", "DEFLATION", "DEFLATION"];
  const inputs = labels.map((economicQuadrant, i) => ({ ...input(`2020-01-0${i + 1}`), economicQuadrant }));
  const prices = { stocks: inputs.map((s, i) => ({ date: s.date, close: 100 * 1.01 ** i })) };
  const base = runAllocationBacktest(inputs, prices, { settings, costBps: 0, benchmarks: {} });
  return { inputs, prices, base };
}

test("phase attribution uses entry labels, separates repeated episodes and compounds actual intervals", () => {
  const { inputs, prices, base } = phaseFixture();
  const phase = analyzeMacroPhases(inputs, prices, base, { identical: base }, "economic", "2020-01-03");
  assert.deepEqual(phase.episodes.map(e => [e.from, e.to, e.days, e.complete]), [
    ["2020-01-01", "2020-01-02", 1, false], ["2020-01-02", "2020-01-04", 2, true],
    ["2020-01-04", "2020-01-05", 1, true], ["2020-01-05", "2020-01-06", 1, true], ["2020-01-06", "2020-01-07", 1, false],
  ]);
  close(phase.episodes[1].assetReturns.stocks!, 0.0201);
  close(phase.episodes.reduce((v, e) => v * (1 + e.baseReturn), 1) - 1, base.metrics.totalReturn);
  const reflation = phase.summaries.find(s => s.phase === "REFLATION")!;
  assert.equal(reflation.assets.stocks.n, 2);
  close(reflation.assets.stocks.mean!, 1.01 ** 21 - 1);
  assert.equal(reflation.assets.stocks.earlier.n, 0); // An episode crossing the split is not chopped into independent samples.
  assert.equal(reflation.assets.stocks.later.n, 1);
  assert.equal(reflation.overlays.identical.mean, 0);
  assert.equal(reflation.assets.bitcoin.n, 0);
  const market = analyzeMacroPhases(inputs, prices, base, {}, "market", "2020-01-03");
  assert.equal(market.episodes.length, 1);
  assert.equal(market.summaries[0].completeEpisodes, 0);
});

test("phase comparisons reject shifted holding periods and missing labels", () => {
  const { inputs, prices, base } = phaseFixture();
  assert.throws(() => analyzeMacroPhases(inputs, prices, base, { bad: { ...base, steps: base.steps.slice(1) } }, "economic", "2020-01-03"), /identical holding intervals/);
  assert.throws(() => analyzeMacroPhases(inputs.slice(1), prices, base, {}, "economic", "2020-01-03"), /No phase label/);
});

test("episode uncertainty requires enough whole episodes and is reproducible", () => {
  assert.equal(episodeSummary([1, 2, 3, 4, 5, 6, 7]).interval, null);
  assert.equal(episodeSummary([]).mean, null);
  assert.deepEqual(episodeSummary(Array(8).fill(0.02)).interval, [0.02, 0.02]);
  const values = [-0.03, 0.02, -0.01, 0.05, 0.06, -0.02, 0.04, 0.01];
  assert.deepEqual(episodeSummary(values), episodeSummary(values));
  const summary = episodeSummary(values);
  assert.ok(summary.interval![0] < summary.mean! && summary.interval![1] > summary.mean!);
});
