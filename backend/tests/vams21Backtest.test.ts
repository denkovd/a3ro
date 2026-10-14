import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAllocation, type AllocationInput, type SleeveKey } from "../src/macro/allocation";
import { VAMS_21_SETTINGS, runVams21Backtest, VAMS_21_NAME, type DailyVamsSignal } from "../src/macro/vams21Backtest";
import { buildDailyVams21 } from "../src/macro/vams21History";
import { computeVams } from "../src/macro/vams";
import { defaultResearchConfig, RESEARCH_VERSION, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";
import type { RegimeBar } from "../src/regime/types";

const input = (date: string): AllocationInput => ({ date, marketRegime: "DEFLATION", economicQuadrant: "INFLATION", headwinds: 6,
  states: { stocks: "BULLISH", gold: "NEUTRAL", bitcoin: "BEARISH" } });
const bar = (date: string, close: number): RegimeBar => ({ date, close, open: close, high: close, low: close });
const signals = (dates: string[]): DailyVamsSignal[] => dates.map((date, i) => ({ date,
  signalDate: new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10),
  states: { stocks: i === 0 ? "BULLISH" : "BEARISH", gold: "NEUTRAL", bitcoin: "BEARISH" }, unavailable: [] }));

test("21-day allocation applies 100/50/0 cap multipliers without macro or cycle reductions", () => {
  const allocation = computeAllocation(input("2020-01-01"), VAMS_21_SETTINGS);
  assert.deepEqual(allocation.weights.map(w => w.weight), [0.6, 0.15, 0]);
  assert.equal(allocation.cash, 0.25);
  for (const regime of ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"] as const)
    assert.deepEqual(computeAllocation({ ...input("2020-01-01"), marketRegime: regime }, VAMS_21_SETTINGS).weights.map(w => w.weight), [0.6, 0.15, 0]);
});
test("daily VAMS reads exactly the prior 21 observations and ignores execution/future bars", () => {
  const history = Array.from({ length: 70 }, (_, i) => bar(new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10),
    100 + i + Math.sin(i) * 2));
  const execution = history[50];
  const original = buildDailyVams21({ stocks: history, gold: history, bitcoin: history }, [execution]);
  const expected = computeVams(history.slice(28, 50), "^GSPC", "Stocks", { window: 21 }).state;
  assert.equal(original[0].states.stocks, expected);
  assert.equal(original[0].signalDate, history[49].date);
  const changed = history.map((b, i) => i >= 50 ? { ...b, close: 1 } : b);
  assert.deepEqual(buildDailyVams21({ stocks: changed, gold: changed, bitcoin: changed }, [execution]), original);
  const short = buildDailyVams21({ stocks: history.slice(0, 21) }, [execution]);
  assert.ok(short[0].unavailable.includes("stocks"));
});
test("21-day portfolio responds to next-date state changes and charges exits", () => {
  const dates = ["2020-01-02", "2020-01-03", "2020-01-06"];
  const prices = { stocks: dates.map(date => bar(date, 100)), gold: dates.map(date => bar(date, 100)), bitcoin: dates.map(date => bar(date, 100)) };
  const result = runVams21Backtest(dates.map(input), signals(dates), prices, "all", { costBps: 100, cashRate: 0 });
  assert.equal(result.steps[1].reason, "signal-change");
  assert.equal(result.steps[1].allocation.weights.find(w => w.key === "stocks")?.weight, 0);
  assert.ok(Math.abs(result.steps[1].turnover - 0.6) < 1e-10);
  assert.ok(result.metrics.totalReturn < 0);
});
test("missing/unwarmed or same-date signals fail; excluded Bitcoin cannot force a trade", () => {
  const dates = ["2020-01-02", "2020-01-03", "2020-01-06"];
  const prices = { stocks: dates.map(date => bar(date, 100)), gold: dates.map(date => bar(date, 100)) };
  const reads = signals(dates).map(signal => ({ ...signal, states: { stocks: "BULLISH", gold: "NEUTRAL", bitcoin: "PENDING" } as DailyVamsSignal["states"], unavailable: ["bitcoin"] as SleeveKey[] }));
  reads[1].states.bitcoin = "BULLISH";
  const result = runVams21Backtest(dates.map(input), reads, prices, "stocks-gold", { costBps: 0 });
  assert.equal(result.steps[1].rebalanced, false);
  assert.throws(() => runVams21Backtest(dates.map(input), reads.slice(1), prices, "stocks-gold", { costBps: 0 }), /prior-date/);
  reads[0].signalDate = reads[0].date;
  assert.throws(() => runVams21Backtest(dates.map(input), reads, prices, "stocks-gold", { costBps: 0 }), /prior-date/);
});
test("21-day dynamic returns are included consistently in charts, regime and validation ledgers", () => {
  const dates: string[] = [];
  for (let i = 0; i < 1100; i++) {
    const date = new Date(Date.UTC(2020, 0, i + 1));
    if (date.getUTCDay() > 0 && date.getUTCDay() < 6) dates.push(date.toISOString().slice(0, 10));
  }
  const prices = dates.map((date, i) => bar(date, 100 + i / 10));
  const data: ResearchDataset = { version: RESEARCH_VERSION, generatedAt: "2023-01-05T00:00:00Z", through: dates.at(-1)!,
    signals: [{ ...input(dates[0]), signalDate: "2019-12-31" }], vams21Signals: signals(dates),
    prices: { stocks: prices, gold: prices, bitcoin: prices }, sources: [], warnings: [] };
  const result = runResearch(data, { ...defaultResearchConfig(data.through), from: dates[0], testFrom: "2021-01-01" });
  const metrics = result.candidate.benchmarks[VAMS_21_NAME];
  assert.ok(metrics);
  assert.equal(metrics.steps, result.candidate.steps.length);
  assert.ok(Math.abs(result.candidate.steps.at(-1)!.benchmarkEquity[VAMS_21_NAME] - 1 - metrics.totalReturn) < 1e-8);
  assert.equal(result.development.candidate.benchmarks[VAMS_21_NAME].steps + result.validation.candidate.benchmarks[VAMS_21_NAME].steps, metrics.steps);
  assert.equal(result.regimes.find(r => r.regime === "DEFLATION")!.benchmarks[VAMS_21_NAME].totalReturn, metrics.totalReturn);
  assert.equal(result.baseline.benchmarks[VAMS_21_NAME].totalReturn, metrics.totalReturn);
});
