import { test } from "node:test";
import assert from "node:assert/strict";
import { BASELINE_SETTINGS, type AllocationInput, type SleeveKey } from "../src/macro/allocation";
import { runAllocationBacktest, type PricePoint } from "../src/macro/allocationBacktest";
import { RESEARCH_VERSION, defaultResearchConfig, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";

// Weekday sessions for January–April 2020.
const sessions: string[] = [];
for (let day = 0; day < 121; day++) {
  const date = new Date(Date.UTC(2020, 0, 1 + day));
  if (date.getUTCDay() > 0 && date.getUTCDay() < 6) sessions.push(date.toISOString().slice(0, 10));
}
// Stocks only: Goldilocks holds 100%, Deflation holds 15% (the live regime scores).
const settings = { ...structuredClone(BASELINE_SETTINGS), caps: { stocks: 1, gold: 0, bitcoin: 0 } };
const input = (date: string): AllocationInput => ({ date, marketRegime: date < "2020-02-01" ? "GOLDILOCKS" : "DEFLATION",
  economicQuadrant: null, headwinds: 0, states: { stocks: "BULLISH", gold: "BULLISH", bitcoin: "BULLISH" } });
const inputs = sessions.map(input);
const flat: PricePoint[] = sessions.map(date => ({ date, close: 100 }));
const moving: PricePoint[] = sessions.map((date, i) => ({ date, close: 100 * (1 + 0.01 * Math.sin(i)) + i / 5 }));

test("one tranche is the original single-day rebalance, to the last bit", () => {
  for (const rebalance of ["monthly-regime", "monthly", "quarterly", "regime"] as const) {
    const original = runAllocationBacktest(inputs, { stocks: moving }, { settings, rebalance, benchmarks: {} });
    const explicit = runAllocationBacktest(inputs, { stocks: moving }, { settings, rebalance, tranches: 1, trancheSpacing: 3, benchmarks: {} });
    assert.deepEqual(explicit.steps, original.steps);
    assert.deepEqual(explicit.metrics, original.metrics);
    assert.equal(explicit.tranches, 1);
  }
});

test("four tranches move a regime change into the book a quarter at a time, weekly", () => {
  const result = runAllocationBacktest(inputs, { stocks: flat }, { settings, costBps: 0, tranches: 4, benchmarks: {} });
  const february = result.steps.filter(s => s.date.startsWith("2020-02"));
  const invested = february.map(s => Math.round(s.allocation.invested * 1e6) / 1e6);
  // Sessions 0, 5, 10, 15 of the month each cut one tranche from 100% to 15%.
  assert.deepEqual([invested[0], invested[4], invested[5], invested[9], invested[10], invested[14], invested[15], invested.at(-1)],
    [0.7875, 0.7875, 0.575, 0.575, 0.3625, 0.3625, 0.15, 0.15]);
  assert.deepEqual(february.filter(s => s.rebalanced).map(s => s.reason), ["monthly", "tranche", "tranche", "tranche"]);
  assert.ok(february.filter(s => s.rebalanced).every(s => Math.abs(s.turnover - 0.2125) < 1e-12));
  // The whole move still trades the same notional as the single-day version.
  const single = runAllocationBacktest(inputs, { stocks: flat }, { settings, costBps: 0, benchmarks: {} });
  const traded = (steps: typeof result.steps) => steps.filter(s => s.date.startsWith("2020-02")).reduce((sum, s) => sum + s.turnover, 0);
  assert.ok(Math.abs(traded(result.steps) - traded(single.steps)) < 1e-12);
  assert.equal(result.tranches, 4);
});

test("every tranche buys the first target together, then weights and cash stay a complete book", () => {
  const result = runAllocationBacktest(inputs, { stocks: moving }, { settings, tranches: 4, cashRate: 0.03, benchmarks: {} });
  assert.equal(result.steps[0].allocation.invested, 1);
  assert.equal(result.steps[0].turnover, 1);
  let equity = 1;
  for (const step of result.steps) {
    assert.ok(Math.abs(step.allocation.invested + step.allocation.cash - 1) < 1e-12);
    equity *= 1 + step.periodReturn;
    assert.ok(Math.abs(step.equity - equity) < 1e-12);
  }
});

test("tranches follow the quarterly calendar too, and custom spacing is honoured", () => {
  const quarterly = runAllocationBacktest(inputs, { stocks: flat }, { settings, costBps: 0, rebalance: "quarterly", tranches: 2, trancheSpacing: 10, benchmarks: {} });
  const traded = quarterly.steps.filter(s => s.rebalanced).map(s => s.date);
  const april = sessions.filter(d => d.startsWith("2020-04"));
  assert.deepEqual(traded, [sessions[0], sessions[10], april[0], april[10]]);
});

test("tranching rejects event-only cadences and schedules that do not fit a month", () => {
  for (const rebalance of ["regime", "signal", "monthly-signal"] as const)
    assert.throws(() => runAllocationBacktest(inputs, { stocks: flat }, { settings, rebalance, tranches: 4 }), /calendar cadence/);
  assert.throws(() => runAllocationBacktest(inputs, { stocks: flat }, { settings, tranches: 5, trancheSpacing: 5 }), /first 16 sessions/);
  assert.throws(() => runAllocationBacktest(inputs, { stocks: flat }, { settings, tranches: 1.5 }), /whole numbers/);
  assert.throws(() => runAllocationBacktest(inputs, { stocks: flat }, { settings, tranches: 0 }), /whole numbers/);
});

test("research applies tranches to the test strategy only; the fixed baseline keeps single-day rebalancing", () => {
  const dates: string[] = [];
  for (let day = 0; day < 1100; day++) {
    const date = new Date(Date.UTC(2020, 0, 1 + day));
    if (date.getUTCDay() > 0 && date.getUTCDay() < 6) dates.push(date.toISOString().slice(0, 10));
  }
  const series = dates.map((date, i) => ({ date, close: 100 + i + 3 * Math.sin(i / 7) }));
  const signal = (date: string, signalDate: string, regime: "GOLDILOCKS" | "DEFLATION") => ({ date, signalDate, marketRegime: regime,
    economicQuadrant: null, headwinds: 0, states: { stocks: "BULLISH" as const, gold: "BULLISH" as const, bitcoin: "BULLISH" as const } });
  const data: ResearchDataset = { version: RESEARCH_VERSION, generatedAt: "2023-01-05T00:00:00Z", through: dates.at(-1)!, sources: [], warnings: [],
    signals: [signal("2020-01-01", "2019-12-31", "GOLDILOCKS"), signal("2021-06-01", "2021-05-31", "DEFLATION"), signal("2022-03-01", "2022-02-28", "GOLDILOCKS")],
    prices: { stocks: series, gold: series, bitcoin: series },
    benchmarkPrices: { bills: dates.map((date, i) => ({ date, close: 100 + i / 100 })) } };
  const config = { ...defaultResearchConfig(data.through), from: "2020-01-01", testFrom: "2021-01-01" };
  const single = runResearch(data, config), tranched = runResearch(data, { ...config, tranches: 4 });
  assert.deepEqual(tranched.baseline.steps.map(s => s.periodReturn), single.baseline.steps.map(s => s.periodReturn));
  assert.deepEqual(single.candidate.steps.map(s => s.periodReturn), single.baseline.steps.map(s => s.periodReturn));
  assert.notDeepEqual(tranched.candidate.steps.map(s => s.periodReturn), single.candidate.steps.map(s => s.periodReturn));
  assert.equal(tranched.candidate.tranches, 4);
  assert.equal(tranched.baseline.tranches, 1);
  assert.throws(() => runResearch(data, { ...config, tranches: 4, rebalance: "regime" }), /calendar cadence/);
});

/* Golden guard. tests/fixtures/allocation-backtest-golden.json was recorded from the simulator
 * as it stood BEFORE cash series, excess-return metrics and tranches were added, on the
 * deterministic scenario below. The single-tranche, constant-cash path must stay identical. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
function goldenScenario() {
  let seed = 20261113;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const dates: string[] = [];
  for (let day = 0; day < 260; day++) { const d = new Date(Date.UTC(2021, 0, 4 + day)); if (d.getUTCDay() > 0 && d.getUTCDay() < 6) dates.push(d.toISOString().slice(0, 10)); }
  const regimes = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"] as const, states = ["BULLISH", "NEUTRAL", "BEARISH"] as const;
  let regime: (typeof regimes)[number] = "REFLATION", headwinds = 2;
  let st: Record<"stocks" | "gold" | "bitcoin", (typeof states)[number]> = { stocks: "BULLISH", gold: "NEUTRAL", bitcoin: "BULLISH" };
  const scenarioInputs: AllocationInput[] = dates.map((date, i) => {
    if (i > 0 && date.slice(0, 7) !== dates[i - 1].slice(0, 7)) {
      regime = regimes[Math.floor(rnd() * 4)]; headwinds = Math.floor(rnd() * 5);
      st = { stocks: states[Math.floor(rnd() * 3)], gold: states[Math.floor(rnd() * 3)], bitcoin: states[Math.floor(rnd() * 3)] };
    }
    return { date, marketRegime: regime, economicQuadrant: null, headwinds, states: { ...st } };
  });
  const walk = (start: number, vol: number) => { let p = start; return dates.map(date => ({ date, close: (p *= 1 + (rnd() - 0.48) * vol) })); };
  return { inputs: scenarioInputs, prices: { stocks: walk(400, 0.02), gold: walk(170, 0.015), bitcoin: walk(30000, 0.08) } };
}
test("single-tranche, constant-cash results are bit-identical to the pre-change simulator", () => {
  const golden = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/allocation-backtest-golden.json", import.meta.url)), "utf8"));
  const scenario = goldenScenario();
  // The fixture predates untimed gold. Timing all three sleeves pins the rule it was
  // recorded under, so this still isolates the simulator from allocation-rule changes.
  const recordedRule = { ...structuredClone(BASELINE_SETTINGS), trendTimedSleeves: ["stocks", "gold", "bitcoin"] as SleeveKey[] };
  for (const rebalance of ["monthly-regime", "monthly", "quarterly", "regime"] as const) {
    const result = runAllocationBacktest(scenario.inputs, scenario.prices,
      { settings: recordedRule, rebalance, costBps: 10, cashRate: 0.03, benchmarks: { mix: { stocks: 0.6, gold: 0.3, bitcoin: 0.1 } } });
    const expected = golden[rebalance];
    assert.deepEqual(result.steps.map(s => s.periodReturn), expected.returns);
    assert.deepEqual(result.steps.map(s => s.turnover), expected.turnover);
    assert.deepEqual(result.steps.map(s => s.benchmarkReturns.mix), expected.benchmark);
    assert.equal(result.steps.at(-1)!.equity, expected.finalEquity);
    for (const key of ["totalReturn", "cagr", "volatility", "maxDrawdown", "totalTurnover"] as const)
      assert.equal(result.metrics[key], expected[key]);
  }
});
