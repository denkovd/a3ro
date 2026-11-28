import { test } from "node:test";
import assert from "node:assert/strict";
import { TREND_SETTINGS, type AllocationInput, type Quadrant } from "../src/macro/allocation";
import { runAllocationBacktest } from "../src/macro/allocationBacktest";
import { defaultLabConfig, proposedExposure, weeklyExposurePlan, countCampaigns, forwardObservations, runInternalResearch, validateLabConfig } from "../src/macro/internalResearch";
import { correlation, pearson, spearman, ranks, pairedSharpeRange } from "../src/macro/researchCorrelation";
import { RESEARCH_VERSION, type ResearchDataset } from "../src/macro/backtestResearch";
import type { VamsState } from "../src/macro/vams";

const states = (s: VamsState) => ({ stocks: s, gold: s, bitcoin: s });
const input = (date: string, s: VamsState = "BULLISH"): AllocationInput => ({ date, marketRegime: "GOLDILOCKS", economicQuadrant: "DEFLATION", headwinds: 0, states: states(s) });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("rule hypotheses distinguish regime alignment, headwinds and independent hedge trends", () => {
  const c = defaultLabConfig("2025-01-01"), i = { ...input("2022-01-03"), marketRegime: "DEFLATION" as const, headwinds: 5 };
  assert.deepEqual(proposedExposure(i, "trend", c), { stocks: 1, gold: 1, bitcoin: 1 });
  assert.deepEqual(proposedExposure(i, "alignment", c), { stocks: 0, gold: 1, bitcoin: 0 });
  assert.deepEqual(proposedExposure(i, "headwind", c), { stocks: 0, gold: 1, bitcoin: 0 });
  assert.deepEqual(proposedExposure(input(i.date, "BEARISH"), "macro-entry", c), { stocks: 0.5, gold: 0.5, bitcoin: 0.5 });
  assert.deepEqual(proposedExposure({ ...i, marketRegime: null }, "regime", c), { stocks: 0, gold: 0, bitcoin: 0 });
});

test("weekly confirmation never reads future states and ignores month boundaries and midweek noise", () => {
  const c = { ...defaultLabConfig("2025-01-01"), confirmationWeeks: 2 };
  const dates = ["2022-01-24", "2022-01-25", "2022-01-31", "2022-02-01", "2022-02-07", "2022-02-08", "2022-02-14", "2022-02-15"];
  const inputs = dates.map((d, i) => input(d, [1, 3, 4, 6, 7].includes(i) ? "BEARISH" : "BULLISH"));
  const plan = weeklyExposurePlan(inputs, "trend", c);
  assert.deepEqual(plan.map(p => p.states.stocks), ["BEARISH", "BEARISH", "BULLISH", "BULLISH", "BULLISH", "BULLISH", "BEARISH", "BEARISH"]);
  assert.deepEqual(weeklyExposurePlan(inputs.slice(0, 5), "trend", c), plan.slice(0, 5));
});

test("full-half-zero and zero-half-full count as two campaigns, without initial deployment", () => {
  const plan = ["BULLISH", "NEUTRAL", "BEARISH", "BEARISH", "NEUTRAL", "BULLISH", "BULLISH"].map((s, i) => input(`2022-01-0${i + 1}`, s as VamsState));
  const events = countCampaigns(plan);
  assert.deepEqual(events.map(e => [e.direction, e.legs, e.fromExposure, e.toExposure]), [["Defensive", 2, 0.9999999999999999, 0], ["Rebuilding", 2, 0, 0.9999999999999999]]);
  const rotation = [input("2022-01-01"), { ...input("2022-01-02"), states: { stocks: "BEARISH", gold: "BULLISH", bitcoin: "BULLISH" } as const }, { ...input("2022-01-03"), states: { stocks: "BULLISH", gold: "BEARISH", bitcoin: "BULLISH" } as const }, input("2022-01-04")];
  assert.equal(countCampaigns(rotation)[1].direction, "Rotation");
});

test("unchanged targets drift across weekly, monthly and year boundaries without forced trading", () => {
  const dates = ["2021-12-30", "2021-12-31", "2022-01-03", "2022-01-04", "2022-02-01", "2022-02-02"];
  const prices = Object.fromEntries(["stocks", "gold", "bitcoin"].map(k => [k, dates.map((date, i) => ({ date, close: k === "stocks" ? 100 + i * 10 : 100 }))]));
  const r = runAllocationBacktest(dates.map(d => input(d)), prices, { settings: TREND_SETTINGS, rebalance: "signal", costBps: 0, benchmarks: {} });
  assert.equal(r.steps.filter(s => s.rebalanced).length, 1);
  assert.ok(r.steps[2].allocation.weights[0].weight > 0.6);
});

test("per-asset costs charge both risk and bill legs and apply equally to benchmark purchases", () => {
  const dates = ["2022-01-03", "2022-01-04", "2022-01-05"];
  const bars = dates.map(date => ({ date, close: 100 }));
  const i = [input(dates[0]), input(dates[1], "BEARISH"), input(dates[2], "BEARISH")];
  const r = runAllocationBacktest(i, { stocks: bars, gold: bars, bitcoin: bars }, { settings: TREND_SETTINGS, rebalance: "signal", cashMode: "treasury-bills", benchmarkPrices: { bills: bars },
    costBpsByAsset: { stocks: 10, gold: 20, bitcoin: 100, cash: 5 }, benchmarks: { static: { stocks: 0.6, gold: 0.3, bitcoin: 0.1 } } });
  close(r.steps[0].periodReturn, -0.0022);
  close(r.steps[0].benchmarkReturns.static, -0.0022);
  close(r.steps[1].periodReturn, -0.0027);
  close(r.metrics.totalReturn, 0.9978 * 0.9973 - 1);
  assert.throws(() => runAllocationBacktest(i, {}, { costBpsByAsset: { bitcoin: NaN } }), /Invalid/);
});

test("correlations handle ties, constant inputs, missing pairs and direction", () => {
  assert.deepEqual(ranks([8, 2, 2, 4]), [4, 1.5, 1.5, 3]);
  close(pearson([1, 2, 3, 4], [4, 3, 2, 1])!, -1);
  close(spearman([1, 2, 2, 4], [10, 20, 20, 80])!, 1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
  assert.deepEqual(correlation([1, 2, NaN, 4], [2, 4, 9, 8]), { n: 3, pearson: 1, spearman: 1 });
  assert.throws(() => pearson([1], []), /equal lengths/);
});

test("paired Sharpe uncertainty preserves identical portfolios and refuses tiny samples", () => {
  const a = Array.from({ length: 300 }, (_, i) => Math.sin(i) * 0.01 + 0.001), cash = a.map(() => 0.0001);
  assert.deepEqual(pairedSharpeRange(a, a, cash, 252), [0, 0]);
  assert.equal(pairedSharpeRange(a.slice(0, 20), a.slice(0, 20), cash.slice(0, 20), 252), null);
});

function fixture(): ResearchDataset {
  const dates = Array.from({ length: 1250 }, (_, i) => new Date(Date.UTC(2021, 9, i + 1))).filter(d => d.getUTCDay() !== 0 && d.getUTCDay() !== 6).map(d => d.toISOString().slice(0, 10));
  const bars = dates.map((date, i) => ({ date, close: 100 * Math.exp(i * 0.0003 + Math.sin(i / 7) * 0.02) }));
  const trends = dates.map((date, i) => ({ date, signalDate: dates[i - 1] ?? "2021-09-30", states: states(i % 30 < 15 ? "BULLISH" : "BEARISH"), unavailable: [] }));
  const months = [...new Set(dates.map(d => d.slice(0, 7)))];
  return { version: RESEARCH_VERSION, through: dates.at(-1)!, generatedAt: "2025-03-01T00:00:00Z", sources: [], warnings: [],
    signals: months.map((month, i) => { const date = dates.find(d => d.startsWith(month))!; return { ...input(date), marketRegime: (["GOLDILOCKS", "DEFLATION"] as Quadrant[])[i % 2], signalDate: new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10), headwinds: i % 6 }; }),
    prices: { stocks: bars, gold: bars.map((b, i) => ({ ...b, close: 100 + Math.cos(i / 5) })), bitcoin: bars.map((b, i) => ({ ...b, close: 100 + i / 10 + Math.sin(i) })) },
    benchmarkPrices: { bills: dates.map((date, i) => ({ date, close: 100 + i / 100 })) }, vams21Signals: trends, vams63Signals: trends };
}

test("board comparisons share a fresh post-2022 window, costs, disjoint periods and explicit diagnostics", () => {
  const d = fixture(), r = runInternalResearch(d, defaultLabConfig(d.through));
  assert.equal(r.rows.length, 7);
  for (const row of r.rows) {
    assert.equal(row.metrics.from, "2022-01-03"); assert.equal(row.metrics.to, r.through);
    assert.equal(row.earlier.steps + row.later.steps, row.metrics.steps);
    assert.ok(Math.abs(row.years.reduce((v, y) => v * (1 + y.metrics.totalReturn), 1) - 1 - row.metrics.totalReturn) < 1e-7); // Published summaries round each year to 8 decimals.
    assert.equal(row.curve.length, row.metrics.steps + 1);
    assert.equal(row.campaigns.length, row.years.reduce((v, y) => v + y.campaigns, 0));
  }
  for (let i = 1; i < r.observations.length; i++) assert.equal(r.observations[i - 1].to, r.observations[i].from);
  assert.ok(r.correlations.every(c => c.earlier.n + c.later.n <= c.n));
  assert.ok(r.warnings.some(w => /monthly reconstructions/.test(w)));
  assert.equal(JSON.parse(JSON.stringify(r)).version, "internal-regime-lab-v1");
});

test("forward labels are taken at entry and returns occur strictly after that entry", () => {
  const dates = ["2022-01-03", "2022-01-04", "2022-01-05", "2022-01-06", "2022-01-07"];
  const inputs = dates.map(d => input(d)); inputs[2].marketRegime = "DEFLATION";
  const bars = dates.map((date, i) => ({ date, close: 100 * 2 ** i }));
  const d = { prices: { stocks: bars, gold: bars, bitcoin: bars } } as ResearchDataset;
  const r = runAllocationBacktest(inputs, d.prices, { costBps: 0, benchmarks: {} });
  const samples = forwardObservations(inputs, { static: r }, d, 2);
  assert.equal(samples.length, 2);
  assert.deepEqual(samples.map(s => s.features["Market risk-on"]), [1, 0]);
  assert.deepEqual(samples.map(s => s.outcomes["S&P 500"]), [3, 3]);
});

test("same-date observations, incomplete cash histories and invalid settings fail explicitly", () => {
  const d = fixture(), c = defaultLabConfig(d.through);
  assert.throws(() => validateLabConfig({ ...c, confirmationWeeks: 0 }, d.through), /confirmation/);
  assert.throws(() => validateLabConfig({ ...c, split: c.from }, d.through), /dates/);
  d.vams63Signals!.find(s => s.date === "2022-01-03")!.signalDate = "2022-01-03";
  assert.throws(() => runInternalResearch(d, c), /prior-date/);
  const missing = fixture(); missing.benchmarkPrices!.bills = [];
  assert.throws(() => runInternalResearch(missing, c), /Treasury-bill/);
});
