/* Fixes behind the newsletter's data notes: VAMS on back-adjusted
   futures, the macro weather rule, oil 1D/1W changes, the ^VIX overlay. */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeVams } from "../src/macro/vams";
import { computeMacroWeather } from "../src/macro/weather";
import { computeQuoteChanges } from "../src/core/quoteChanges";
import { overlayObservations } from "../src/macro/panelOverlay";
import type { RegimeBar } from "../src/regime/types";
import type { MacroSeries } from "../src/sources/fredMacro";

function dateAt(i: number): string {
  return new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
}
const bar = (i: number, close: number): RegimeBar => ({ date: dateAt(i), open: close, high: close, low: close, close });

describe("computeVams — back-adjusted futures", () => {
  // Raw: flat around 85 with small wiggles, and three −$10 roll gaps
  // inside the window (steep backwardation). Within-contract moves are
  // tiny, so the rolled position barely moved.
  const n = 80;
  const raw: RegimeBar[] = [];
  for (let i = 0; i < n; i++) raw.push(bar(i, 85 + (i % 2 === 0 ? 0.2 : -0.2)));
  // Adjusted = raw shifted by the cumulative future roll gaps (additive).
  const rolls = [30, 50, 70]; // roll dates (index); each gap −10
  const adj: RegimeBar[] = raw.map((b, i) => {
    const shift = rolls.filter((r) => i < r).length * -10;
    return { ...b, close: b.close + shift, open: b.open + shift, high: b.high + shift, low: b.low + shift };
  });

  test("without levels, adjusted-level percentages inflate (the old bug)", () => {
    const r = computeVams(adj, "CL=F", "WTI");
    assert.ok(r.return63 !== null && r.return63 > 40, `expected inflated %, got ${r.return63}`);
  });

  test("with raw levels, % is measured against the real traded price", () => {
    const r = computeVams(adj, "CL=F", "WTI", { levels: raw });
    // adj moved +30 (three −10 gaps undone) over a raw level of ~85 → ~+35%
    assert.ok(r.return63 !== null && r.return63 > 30 && r.return63 < 40, `got ${r.return63}`);
    // and the spot change readers saw is ~0
    assert.ok(r.spotReturn63 !== null && r.spotReturn63 !== undefined && Math.abs(r.spotReturn63) < 1, `spot ${r.spotReturn63}`);
  });

  test("unadjusted series: levels change nothing", () => {
    const series: RegimeBar[] = [];
    for (let i = 0; i < n; i++) series.push(bar(i, 100 * Math.exp(0.002 * i) + (i % 3)));
    const a = computeVams(series, "^GSPC", "S&P 500");
    const b = computeVams(series, "^GSPC", "S&P 500", { levels: series });
    assert.equal(a.state, b.state);
    assert.ok(a.z !== null && b.z !== null && Math.abs(a.z - b.z) < 1e-9);
    assert.equal(a.return63, b.return63);
    assert.equal(b.spotReturn63, b.return63);
    assert.equal(a.spotReturn63, undefined);
  });
});

describe("computeMacroWeather", () => {
  const legs = (bondVol: number) => [
    { key: "bond_vol", label: "Bond vol (MOVE proxy)", normalized: bondVol },
    { key: "equity_vol", label: "Equity vol (VIX)", normalized: 0.4 },
  ];

  test("17 Nov 2026 inputs → RAIN with storm watch on bond vol", () => {
    const w = computeMacroWeather({
      economicRegime: "REFLATION", marketRegime: "DEFLATION",
      riskOnShare: 0.091, liquidityScore: 49, liquidityLegs: legs(0.996),
    });
    assert.equal(w.reading, "RAIN");
    assert.equal(w.agree, false);
    assert.equal(w.stormWatch, true);
    assert.deepEqual(w.stretchedLegs, ["Bond vol (MOVE proxy)"]);
  });

  test("disagreement + liquidity ≥ 60 → STORM (no separate watch flag)", () => {
    const w = computeMacroWeather({
      economicRegime: "REFLATION", marketRegime: "DEFLATION",
      riskOnShare: 0.1, liquidityScore: 60, liquidityLegs: legs(0.99),
    });
    assert.equal(w.reading, "STORM");
    assert.equal(w.stormWatch, false);
  });

  test("agreement + risk-on ≥ 60% → SUNNY; agreement otherwise → PARTLY_CLOUDY", () => {
    assert.equal(computeMacroWeather({
      economicRegime: "GOLDILOCKS", marketRegime: "GOLDILOCKS", riskOnShare: 0.6, liquidityScore: 20,
    }).reading, "SUNNY");
    assert.equal(computeMacroWeather({
      economicRegime: "DEFLATION", marketRegime: "DEFLATION", riskOnShare: 0.1, liquidityScore: 20,
    }).reading, "PARTLY_CLOUDY");
  });

  test("pending or missing regime → PENDING", () => {
    assert.equal(computeMacroWeather({
      economicRegime: "PENDING", marketRegime: "DEFLATION", riskOnShare: 0.1, liquidityScore: 20,
    }).reading, "PENDING");
    assert.equal(computeMacroWeather({
      economicRegime: "REFLATION", marketRegime: null, riskOnShare: null, liquidityScore: null,
    }).reading, "PENDING");
  });
});

describe("computeQuoteChanges", () => {
  const closes = [
    { periodDate: "2026-11-05", price: 80 },
    { periodDate: "2026-11-09", price: 82 },
    { periodDate: "2026-11-10", price: 83 },
    { periodDate: "2026-11-13", price: 86 },
    { periodDate: "2026-11-16", price: 85 },
    { periodDate: "2026-11-17", price: 84.88 }, // today's own row — must be ignored
  ];

  test("d1 vs the last close before the quote date, w1 vs ≥7 days back", () => {
    const c = computeQuoteChanges(84.88, "2026-11-17T06:12:44.000Z", closes);
    assert.equal(c.prevClose, 85);
    assert.equal(c.prevCloseDate, "2026-11-16");
    assert.equal(c.d1, -0.14);
    // week cut = 2026-11-10 → newest close on/before is 83
    assert.equal(c.w1, 2.27);
  });

  test("no prior closes or no price → nulls", () => {
    assert.deepEqual(computeQuoteChanges(84.88, "2026-11-17T00:00:00Z", []),
      { prevClose: null, prevCloseDate: null, d1: null, w1: null });
    assert.equal(computeQuoteChanges(null, "2026-11-17T00:00:00Z", closes).d1, null);
  });
});

describe("overlayObservations (^VIX over FRED VIXCLS)", () => {
  const panel: MacroSeries[] = [
    { seriesId: "VIXCLS", key: "vol_equity", axis: "vol" as MacroSeries["axis"], frequency: "daily", units: "index",
      observations: [{ date: "2026-11-12", value: 18.1 }, { date: "2026-11-13", value: 19.3 }] },
    { seriesId: "BAMLH0A0HYM2", key: "credit_hy_oas", axis: "credit" as MacroSeries["axis"], frequency: "daily", units: "%",
      observations: [{ date: "2026-11-13", value: 3.23 }] },
  ];

  test("fresher dates append, overlapping dates take the faster source", () => {
    const out = overlayObservations(panel, "vol_equity", [
      { date: "2026-11-13", value: 19.9 }, { date: "2026-11-16", value: 23.72 },
    ]);
    const vix = out.find((s) => s.key === "vol_equity")!;
    assert.deepEqual(vix.observations.map((o) => o.value), [18.1, 19.9, 23.72]);
    assert.equal(out.find((s) => s.key === "credit_hy_oas"), panel[1]);
  });

  test("empty overlay leaves the panel untouched", () => {
    assert.equal(overlayObservations(panel, "vol_equity", []), panel);
  });
});
