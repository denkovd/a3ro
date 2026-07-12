/* ────────────────────────────────────────────────────────────────
   Scenario engine + risk engine — pure-function tests.
──────────────────────────────────────────────────────────────── */

import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeThesis } from "../src/thesis/engine";
import {
  buildScenarios,
  empiricalProbabilities,
  horizonReturns,
  tradingDaysIn,
} from "../src/thesis/scenarios";
import { buildRiskReport, correlationClusters, pairwiseCorrelations, pearson } from "../src/thesis/risk";
import { MarkedPosition, MarketContext } from "../src/thesis/types";

/* ── fixtures ─────────────────────────────────────────────────── */

const trendSeries = (n: number, start: number, dailyRet: number, wobble = 0.004): { date: string; close: number }[] => {
  const out: { date: string; close: number }[] = [];
  let px = start;
  for (let i = 0; i < n; i++) {
    px *= 1 + dailyRet + Math.sin(i * 1.7) * wobble;
    out.push({ date: new Date(Date.UTC(2025, 6, 1) + i * 86_400_000).toISOString().slice(0, 10), close: px });
  }
  return out;
};

const CTX: MarketContext = {
  asOf: "2026-07-12",
  price: { symbol: "WTI", value: 80, asOf: "2026-07-11", source: "latest_quotes/eia" },
  priceSeries: trendSeries(300, 76, 0.0002),
  realizedVol: { dailySigma: 0.018, windowDays: 120, observations: 120, asOf: "2026-07-11" },
  tape: { stance: "SUPPLY_TIGHT", label: "SUPPLY-TIGHT", headline: "tight", runDate: "2026-07-11" },
  macro: { quadrant: "REFLATION", growthMomentum: 0.5, inflationMomentum: 0.2, pressureScore: 40, diverging: false, runDate: "2026-07-11" },
  positioning: { stance: "CROWDED_LONG", netLength: 300_000, percentile1y: 0.9, reportDate: "2026-07-07" },
  trend: { symbol: "CL=F", verdict: "BULLISH", dailyTrend: 1, weeklyTrend: 1, runDate: "2026-07-11", source: "regime_snapshots" },
  oilAdjacent: true,
};

const BODY = "WTI is going to $95 by September. OPEC cuts are holding. China demand is recovering.";

/* ── scenarios ────────────────────────────────────────────────── */

test("tradingDaysIn: calendar → trading days", () => {
  assert.equal(tradingDaysIn(365), 252);
  assert.ok(tradingDaysIn(90) >= 60 && tradingDaysIn(90) <= 63);
});

test("buildScenarios: five scenarios, downside first, prices ordered", () => {
  const a = analyzeThesis("Long oil", BODY, CTX);
  const s = buildScenarios(a, CTX);
  assert.equal(s.scenarios.length, 5);
  assert.deepEqual(
    s.scenarios.map((x) => x.id),
    ["bear_tail", "bear", "base", "bull", "bull_tail"],
  );
  const prices = s.scenarios.map((x) => x.price);
  for (const p of prices) assert.ok(p !== null);
  for (let i = 1; i < prices.length; i++) assert.ok((prices[i] as number) > (prices[i - 1] as number));
  // base ≈ anchor
  assert.ok(Math.abs((s.scenarios[2].price as number) - 80) < 0.01);
});

test("buildScenarios: crowded-long context names the unwind in the bear tail", () => {
  const a = analyzeThesis("Long oil", BODY, CTX);
  const s = buildScenarios(a, CTX);
  assert.ok(/crowded/i.test(s.scenarios[0].narrative), s.scenarios[0].narrative);
});

test("buildScenarios: every scenario traces every assumption", () => {
  const a = analyzeThesis("Long oil", BODY, CTX);
  const s = buildScenarios(a, CTX);
  for (const sc of s.scenarios) {
    assert.equal(sc.assumptionOutcomes.length, a.assumptions.length);
    for (const o of sc.assumptionOutcomes) assert.ok(o.why.length > 10);
  }
  // bear tail must break more than bull
  const broken = (id: string) => s.scenarios.find((x) => x.id === id)!.assumptionOutcomes.filter((o) => o.state === "breaks").length;
  assert.ok(broken("bear_tail") > broken("bull"), `bear_tail ${broken("bear_tail")} vs bull ${broken("bull")}`);
});

test("empirical probabilities: sum ≈ 1 and need ≥30 windows", () => {
  const closes = trendSeries(300, 76, 0.0002).map((p) => p.close);
  const rets = horizonReturns(closes, 60);
  const probs = empiricalProbabilities(rets, 0.018 * Math.sqrt(60));
  assert.ok(probs !== null);
  const sum = Object.values(probs!).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(empiricalProbabilities(rets.slice(0, 10), 0.1), null);
});

test("no price/vol context: price legs suppressed honestly", () => {
  const ctx: MarketContext = { ...CTX, price: null, priceSeries: [], realizedVol: null };
  const a = analyzeThesis("Long oil", BODY, ctx);
  const s = buildScenarios(a, ctx);
  for (const sc of s.scenarios) {
    assert.equal(sc.price, null);
    assert.equal(sc.probability, null);
  }
  assert.ok(/suppressed/.test(s.sigmaBasis));
});

/* ── risk engine ──────────────────────────────────────────────── */

const mkPos = (over: Partial<MarkedPosition>): MarkedPosition => ({
  id: 1,
  symbol: "WTI",
  displayName: null,
  side: "long",
  quantity: 100,
  entryPrice: 75,
  manualMark: null,
  thesisId: null,
  notes: null,
  openedAt: null,
  mark: 80,
  markSource: "latest_quotes",
  markAsOf: "2026-07-11",
  exposure: 8000,
  weight: null,
  pnlPct: 6.67,
  atrPct: 2.2,
  trendVerdict: "BULLISH",
  dailyVol: 0.022,
  volSource: "bull_snapshots.atr_pct",
  ...over,
});

test("pearson: perfectly correlated and anti-correlated", () => {
  const xs = Array.from({ length: 30 }, (_, i) => Math.sin(i));
  assert.ok((pearson(xs, xs) as number) > 0.999);
  assert.ok((pearson(xs, xs.map((v) => -v)) as number) < -0.999);
  assert.equal(pearson([1, 2], [1, 2]), null); // < 20 obs
});

test("pairwise correlations + clusters from close series", () => {
  const a = trendSeries(120, 100, 0.001);
  const b = a.map((p) => ({ date: p.date, close: p.close * 1.5 + 3 })); // ρ≈1 with a
  const c = trendSeries(120, 50, -0.001, 0.01);
  const series = new Map([["A", a], ["B", b], ["C", c]]);
  const { pairs } = pairwiseCorrelations(["A", "B", "C"], series);
  const ab = pairs.find((p) => (p.a === "A" && p.b === "B") || (p.a === "B" && p.b === "A"));
  assert.ok(ab && ab.rho > 0.95);
  const clusters = correlationClusters(pairs, new Map([["A", 0.3], ["B", 0.3], ["C", 0.4]]));
  assert.ok(clusters.length >= 1);
  assert.ok(clusters[0].symbols.includes("A") && clusters[0].symbols.includes("B"));
});

test("risk report: concentration, flags, honest coverage", () => {
  const positions: MarkedPosition[] = [
    mkPos({ id: 1, symbol: "WTI", exposure: 50000, thesisId: 7 }),
    mkPos({ id: 2, symbol: "GC=F", exposure: 30000, trendVerdict: "BEARISH" }), // long vs bearish → conflict
    mkPos({ id: 3, symbol: "AAPL", exposure: 20000, dailyVol: null, volSource: "no ATR on file", markSource: "entry_fallback" }),
  ];
  const report = buildRiskReport({
    positions,
    seriesBySymbol: new Map(),
    scenarioSet: null,
    driverSeries: null,
    thesisMeta: new Map([[7, { strength: 30, verdict: "FRAGILE", title: "weak thesis" }]]),
  });
  assert.equal(report.grossExposure, 100000);
  assert.equal(report.concentration.label, "CONCENTRATED"); // top1 = 50%
  assert.ok(report.flags.some((f) => f.kind === "OVERSIZED_WEAK_THESIS" && f.positionId === 1));
  assert.ok(report.flags.some((f) => f.kind === "TREND_CONFLICT" && f.positionId === 2));
  assert.ok(report.flags.some((f) => f.kind === "NO_THESIS" && f.positionId === 2));
  assert.ok(report.flags.some((f) => f.kind === "UNMODELED" && f.positionId === 3));
  assert.ok(report.flags.some((f) => f.kind === "STALE_MARK" && f.positionId === 3));
  assert.equal(report.coverage.modeledPositions, 2);
  // risk ranking exists for modeled positions and is ordered
  const shares = report.positionRisks.filter((r) => r.riskShare !== null).map((r) => r.riskShare as number);
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-6);
});

test("risk report: scenario totals modeled vs unmodeled accounting", () => {
  const a = analyzeThesis("Long oil", BODY, CTX);
  const s = buildScenarios(a, CTX);
  const driver = CTX.priceSeries;
  const positions: MarkedPosition[] = [
    mkPos({ id: 1, symbol: "WTI", exposure: 10000 }),
    mkPos({ id: 2, symbol: "ZZZ", exposure: 5000 }), // no series → no β → unmodeled
  ];
  const report = buildRiskReport({
    positions,
    seriesBySymbol: new Map([["WTI", driver]]),
    scenarioSet: s,
    driverSeries: driver,
    thesisMeta: new Map(),
  });
  const bt = report.scenarioTotals.bear_tail!;
  assert.equal(bt.modeled, 1);
  assert.equal(bt.unmodeled, 1);
  assert.ok(bt.total < 0, "long WTI in bear tail must be negative");
});
