import { test } from "node:test";
import assert from "node:assert/strict";
import type { MacroSeries } from "../src/sources/fredMacro";
import type { RegimeBar } from "../src/regime/types";
import { REGIME_UNIVERSE } from "../src/regime/universe";
import { computeRiskMatrix, computeVams } from "../src/macro/vams";
import { SLEEVES } from "../src/macro/allocation";
import { RESEARCH_VERSION, TREND_HORIZONS, defaultResearchConfig, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";
import { buildResearchSignal, CORPORATE_PROFITS_Q4_LAG_DAYS, equityVolatility, laggedPanel, RELEASE_LAG_DAYS, releaseLagDays } from "../src/macro/backtestSignals";

const series = (key: string, frequency: MacroSeries["frequency"], dates: string[]): MacroSeries =>
  ({ seriesId: key.toUpperCase(), key, axis: "growth", frequency, units: "index", observations: dates.map((date, i) => ({ date, value: 100 + i })) });
const visible = (panel: MacroSeries[], key: string, on: string) => laggedPanel(panel, on).find(s => s.key === key)!.observations.map(o => o.date);

test("quarterly series wait 150 days; fourth-quarter corporate profits wait 180", () => {
  assert.deepEqual({ ...RELEASE_LAG_DAYS }, { daily: 2, weekly: 8, monthly: 45, quarterly: 150 });
  assert.equal(CORPORATE_PROFITS_Q4_LAG_DAYS, 180);
  const quarters = ["2023-04-01", "2023-07-01", "2023-10-01"];
  const panel = [series("corporate_profits", "quarterly", quarters), series("nominal_gdp", "quarterly", quarters)];
  // Q3 profits (dated 1 July) were published 29 Nov 2023. The old 120-day lag exposed them on 29 Oct.
  assert.deepEqual(visible(panel, "corporate_profits", "2023-10-31"), ["2023-04-01"]);
  assert.deepEqual(visible(panel, "corporate_profits", "2023-11-27"), ["2023-04-01"]);
  assert.deepEqual(visible(panel, "corporate_profits", "2023-11-30"), ["2023-04-01", "2023-07-01"]);
  // Q4 profits (dated 1 Oct) were published 28 Mar 2024 with the third GDP estimate — not at 150 days (28 Feb).
  assert.deepEqual(visible(panel, "corporate_profits", "2024-02-29"), ["2023-04-01", "2023-07-01"]);
  assert.deepEqual(visible(panel, "corporate_profits", "2024-03-27"), ["2023-04-01", "2023-07-01"]);
  assert.deepEqual(visible(panel, "corporate_profits", "2024-03-29"), quarters);
  // Other quarterly series keep the plain 150 days.
  assert.deepEqual(visible(panel, "nominal_gdp", "2024-02-27"), ["2023-04-01", "2023-07-01"]);
  assert.deepEqual(visible(panel, "nominal_gdp", "2024-02-28"), quarters);
  assert.equal(releaseLagDays({ key: "corporate_profits", frequency: "quarterly" }, "2023-07-01"), 150);
});

test("monthly, weekly and daily lags are unchanged", () => {
  const panel = [series("inflation_cpi", "monthly", ["2024-01-01", "2024-02-01"]), series("fed_assets", "weekly", ["2024-03-06", "2024-03-13"]),
    series("policy_rate", "daily", ["2024-03-14", "2024-03-15"])];
  assert.deepEqual(visible(panel, "inflation_cpi", "2024-03-16"), ["2024-01-01"]);
  assert.deepEqual(visible(panel, "inflation_cpi", "2024-03-17"), ["2024-01-01", "2024-02-01"]);
  assert.deepEqual(visible(panel, "fed_assets", "2024-03-20"), ["2024-03-06"]);
  assert.deepEqual(visible(panel, "fed_assets", "2024-03-21"), ["2024-03-06", "2024-03-13"]);
  assert.deepEqual(visible(panel, "policy_rate", "2024-03-16"), ["2024-03-14"]);
});

// 400 weekday sessions; each market gets its own drift so the universe votes for several regimes.
const sessions: string[] = [];
for (let day = 0; sessions.length < 400; day++) {
  const date = new Date(Date.UTC(2022, 0, 3 + day));
  if (date.getUTCDay() > 0 && date.getUTCDay() < 6) sessions.push(date.toISOString().slice(0, 10));
}
const market = (drift: number, wobble: number): RegimeBar[] => { let price = 100; return sessions.map((date, i) => {
  price *= 1 + drift + wobble * Math.sin(i * 1.7 + drift * 1e4);
  return { date, open: price, high: price, low: price, close: price }; }); };
function fixture() {
  const bars = new Map<string, RegimeBar[]>();
  [...REGIME_UNIVERSE.map(e => e.symbol), "HYG"].forEach((symbol, i) => bars.set(symbol, market((i % 5 - 2) * 0.0015, 0.01)));
  const months = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 10));
  const panel = [series("growth_indpro", "monthly", months), series("inflation_cpi", "monthly", months)];
  const stocks = bars.get("^GSPC")!.map(({ date, close }) => ({ date, close }));
  return { bars, panel, prices: { stocks, gold: stocks, bitcoin: stocks } };
}

test("each signal row stores the regime vote shares and multi-horizon trend z-scores it was built from", () => {
  const { bars, panel, prices } = fixture();
  const execution = sessions[399], signalDate = sessions[398];
  const row = buildResearchSignal({ execution, signalDate, panel, bars, prices });
  // The shares are the risk matrix's own normalised output, not a recomputation.
  const reads = REGIME_UNIVERSE.map(e => computeVams(bars.get(e.symbol)!.filter(b => b.date <= signalDate), e.symbol, e.displayName));
  const matrix = computeRiskMatrix(reads, signalDate);
  assert.deepEqual(row.regimeShares, matrix.shares);
  assert.equal(row.marketRegime, matrix.modalRegime);
  assert.ok(Math.abs(Object.values(row.regimeShares!).reduce((a, b) => a + b, 0) - 1) < 1e-3);
  assert.equal(row.marketsScored, matrix.scored);
  assert.equal(row.marketsAttempted, REGIME_UNIVERSE.length);
  for (const sleeve of SLEEVES) {
    const history = bars.get(sleeve.symbol)!.filter(b => b.date <= signalDate);
    assert.deepEqual(Object.keys(row.trendZ![sleeve.key]!), TREND_HORIZONS.map(String));
    for (const window of TREND_HORIZONS)
      assert.equal(row.trendZ![sleeve.key]![String(window)], computeVams(history, sleeve.symbol, sleeve.label, { window }).z);
    // The traded state is still the 63-observation read, and agrees with the stored 63 z-score.
    const z63 = row.trendZ![sleeve.key]!["63"]!;
    assert.equal(row.states[sleeve.key], z63 >= 0.5 ? "BULLISH" : z63 <= -0.5 ? "BEARISH" : "NEUTRAL");
  }
  assert.deepEqual(row.unavailable, []);
  assert.throws(() => buildResearchSignal({ execution: signalDate, signalDate, panel, bars, prices }), /before its execution/);
});

test("signals use nothing after the signal date, and unwarmed horizons are null rather than invented", () => {
  const { bars, panel, prices } = fixture();
  const execution = sessions[130], signalDate = sessions[129];
  const row = buildResearchSignal({ execution, signalDate, panel, bars, prices });
  // Rewriting every bar after the signal date must not change the row.
  const tampered = new Map([...bars].map(([symbol, history]) =>
    [symbol, history.map(b => b.date > signalDate ? { ...b, close: b.close * 3, high: b.close * 3, low: b.close * 3, open: b.close * 3 } : b)]));
  assert.deepEqual(buildResearchSignal({ execution, signalDate, panel, bars: tampered, prices }), row);
  // 130 bars: 21, 63 and 126 are warm, 252 is not.
  assert.equal(typeof row.trendZ!.stocks!["126"], "number");
  assert.equal(row.trendZ!.stocks!["252"], null);
  // No market data at all: no vote, so no shares.
  const empty = buildResearchSignal({ execution, signalDate, panel, bars: new Map(), prices });
  assert.equal(empty.marketRegime, null);
  assert.equal(empty.regimeShares, null);
  assert.deepEqual(empty.unavailable, ["stocks", "gold", "bitcoin"]);
});

test("enrichment fields never change a simulation", () => {
  const { bars, panel, prices } = fixture();
  const monthStarts = sessions.map((date, i) => ({ date, i })).filter(({ date, i }) => i > 70 && date.slice(0, 7) !== sessions[i - 1].slice(0, 7));
  const signals = monthStarts.map(({ date, i }) => buildResearchSignal({ execution: date, signalDate: sessions[i - 1], panel, bars, prices }));
  const base: ResearchDataset = { version: RESEARCH_VERSION, generatedAt: "2023-08-01T00:00:00Z", through: sessions.at(-1)!, sources: [], warnings: [],
    signals, prices, benchmarkPrices: { bills: sessions.map((date, i) => ({ date, close: 100 + i / 100 })) } };
  const stripped: ResearchDataset = { ...base, signals: signals.map(({ regimeShares: _s, trendZ: _z, marketsScored: _a, marketsAttempted: _b,
    equityVol: _v, universeBreadth63: _u, ...row }) => row) };
  const config = { ...defaultResearchConfig(base.through), from: signals[0].date, testFrom: sessions[250] };
  const enriched = runResearch(base, config), plain = runResearch(stripped, config);
  assert.deepEqual(enriched.baseline.steps.map(s => s.periodReturn), plain.baseline.steps.map(s => s.periodReturn));
  assert.deepEqual(enriched.baseline.metrics, plain.baseline.metrics);
});

test("realised equity volatility is the annualised 21-session σ, with its trailing 126-session median", () => {
  const history = fixture().bars.get("^GSPC")!.slice(0, 300);
  // Independent calculation: population σ of the last 21 daily log returns ending at bar `end`, × √252.
  const volAt = (end: number) => {
    const returns = Array.from({ length: 21 }, (_, k) => Math.log(history[end - k].close / history[end - k - 1].close));
    const mean = returns.reduce((a, b) => a + b, 0) / 21;
    return Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / 21) * Math.sqrt(252);
  };
  const last = history.length - 1;
  const trailing = Array.from({ length: 126 }, (_, k) => volAt(last - k)).sort((a, b) => a - b);
  const read = equityVolatility(history);
  assert.ok(Math.abs(read.realised21! - volAt(last)) < 1e-6);
  assert.ok(Math.abs(read.median126! - (trailing[62] + trailing[63]) / 2) < 1e-6);
  // 21 returns need 22 bars; the median needs 126 such readings, i.e. 147 bars.
  assert.deepEqual(equityVolatility(history.slice(0, 21)), { realised21: null, median126: null });
  assert.equal(typeof equityVolatility(history.slice(0, 22)).realised21, "number");
  assert.equal(equityVolatility(history.slice(0, 146)).median126, null);
  assert.equal(typeof equityVolatility(history.slice(0, 147)).median126, "number");
  // The row carries exactly this read of the S&P 500 at the signal date.
  const { bars, panel, prices } = fixture();
  const row = buildResearchSignal({ execution: sessions[300], signalDate: sessions[299], panel, bars, prices });
  assert.deepEqual(row.equityVol, read);
});

test("universe breadth counts markets with a positive 63-observation score among those that have one", () => {
  const { bars, panel, prices } = fixture();
  const signalDate = sessions[398];
  const row = buildResearchSignal({ execution: sessions[399], signalDate, panel, bars, prices });
  const scores = REGIME_UNIVERSE.map(e => computeVams(bars.get(e.symbol)!.filter(b => b.date <= signalDate), e.symbol, e.displayName).z);
  const positive = scores.filter(z => z !== null && z > 0).length;
  assert.deepEqual(row.universeBreadth63, { positive, measured: 30, universe: 30, share: Math.round(positive / 30 * 1e6) / 1e6 });
  assert.ok(positive > 0 && positive < 30);
  // Markets with no history yet drop out of the denominator instead of counting as negative.
  const young = new Map(bars);
  for (const symbol of ["ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD"]) young.set(symbol, []);
  const partial = buildResearchSignal({ execution: sessions[399], signalDate, panel, bars: young, prices }).universeBreadth63!;
  assert.equal(partial.measured, 26);
  assert.equal(partial.universe, 30);
  assert.equal(partial.share, Math.round(partial.positive / 26 * 1e6) / 1e6);
  assert.deepEqual(buildResearchSignal({ execution: sessions[399], signalDate, panel, bars: new Map(), prices }).universeBreadth63,
    { positive: 0, measured: 0, universe: 30, share: null });
});
