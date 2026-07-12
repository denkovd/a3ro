import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeMacroRegime, computeMacroPressure, computePositioning, yoyAndMomentum } from "../src/macro/engine";
import { MacroObservation, MacroSeries } from "../src/sources/fredMacro";
import { CotObservation } from "../src/sources/cftcCot";

const RUN = "2026-07-11";

/** Four anchor points that drive yoy (365d back) + momentum (120d back,
 *  with its own 365d back). Ascending. */
const obs = (a: number, b: number, c: number, d: number): MacroObservation[] => [
  { date: "2025-03-03", value: a }, // priorYearAgo (365d before prior)
  { date: "2025-07-01", value: b }, // yearAgo (365d before latest)
  { date: "2026-03-03", value: c }, // prior (120d before latest)
  { date: "2026-07-01", value: d }, // latest
];

// growth accelerating: yoyNow 10% > yoyPrior 4%
const GROWTH_ACCEL = obs(100, 100, 104, 110);
// growth decelerating: yoyNow 2% < yoyPrior 6%
const GROWTH_DECEL = obs(100, 100, 106, 102);
// inflation cooling: yoyNow 3% < yoyPrior 5%
const INFLATION_DECEL = obs(100, 100, 105, 103);
// inflation accelerating: yoyNow 6% > yoyPrior 2%
const INFLATION_ACCEL = obs(100, 100, 102, 106);

describe("yoyAndMomentum", () => {
  test("computes YoY, momentum and accel sign", () => {
    const r = yoyAndMomentum(GROWTH_ACCEL, 120);
    assert.equal(r.yoy, 10);
    assert.equal(r.momentum, 6);
    assert.equal(r.accelerating, true);
    assert.equal(r.asOf, "2026-07-01");
  });
  test("empty series → all null", () => {
    const r = yoyAndMomentum([], 120);
    assert.equal(r.yoy, null);
    assert.equal(r.accelerating, null);
  });
});

describe("computeMacroRegime (GRID quadrants)", () => {
  test("growth↑ + inflation↓ → GOLDILOCKS", () => {
    const s = computeMacroRegime(GROWTH_ACCEL, INFLATION_DECEL, RUN);
    assert.equal(s.quadrant, "GOLDILOCKS");
    assert.equal(s.coverage.available, 2);
  });
  test("growth↑ + inflation↑ → REFLATION", () => {
    assert.equal(computeMacroRegime(GROWTH_ACCEL, INFLATION_ACCEL, RUN).quadrant, "REFLATION");
  });
  test("growth↓ + inflation↑ → INFLATION", () => {
    assert.equal(computeMacroRegime(GROWTH_DECEL, INFLATION_ACCEL, RUN).quadrant, "INFLATION");
  });
  test("growth↓ + inflation↓ → DEFLATION", () => {
    assert.equal(computeMacroRegime(GROWTH_DECEL, INFLATION_DECEL, RUN).quadrant, "DEFLATION");
  });
  test("missing an axis → PENDING at 1/2", () => {
    const s = computeMacroRegime(GROWTH_ACCEL, [], RUN);
    assert.equal(s.quadrant, "PENDING");
    assert.equal(s.coverage.available, 1);
  });
});

const series = (key: string, observations: MacroObservation[]): MacroSeries => ({
  seriesId: key,
  key,
  axis: "growth",
  frequency: "daily",
  units: "x",
  observations,
});

describe("computeMacroPressure", () => {
  const panel: MacroSeries[] = [
    series("dollar_broad", [{ date: "2025-12-01", value: 100 }, { date: "2026-07-01", value: 106 }]), // +6% → 1.0
    series("curve_10y2y", [{ date: "2026-07-01", value: -0.5 }]), // (1-(-0.5))/2 = 0.75
    series("credit_hy_oas", [{ date: "2026-07-01", value: 5.5 }]), // (5.5-3)/5 = 0.5
    series("growth_indpro", GROWTH_ACCEL), // momentum +6 → (2-6)/4 clamped 0
  ];

  test("blends live legs into a 0..100 score", () => {
    const s = computeMacroPressure(panel, null, RUN);
    assert.equal(s.coverage.available, 4);
    assert.equal(s.score, 56); // (1.0+0.75+0.5+0.0)/4 = 0.5625
    assert.equal(s.diverging, false);
  });

  test("fires divergence when oil rises into a high-pressure backdrop", () => {
    const stressed: MacroSeries[] = [
      series("dollar_broad", [{ date: "2025-12-01", value: 100 }, { date: "2026-07-01", value: 106 }]),
      series("curve_10y2y", [{ date: "2026-07-01", value: -0.5 }]),
      series("credit_hy_oas", [{ date: "2026-07-01", value: 8 }]), // 1.0
      series("growth_indpro", GROWTH_ACCEL),
    ];
    const s = computeMacroPressure(stressed, 5, RUN); // oil +5%
    assert.equal(s.score, 69); // (1.0+0.75+1.0+0.0)/4 = 0.6875
    assert.equal(s.diverging, true);
  });

  test("under 2 live legs → insufficient", () => {
    const s = computeMacroPressure([series("curve_10y2y", [{ date: "2026-07-01", value: 0.2 }])], null, RUN);
    assert.equal(s.score, null);
    assert.equal(s.status, "insufficient");
  });
});

/* weekly COT observations from an array of net-length values (ascending). */
const cotWeeks = (nets: number[]): CotObservation[] =>
  nets.map((net, i) => ({
    date: new Date(Date.UTC(2026, 0, 6) + i * 7 * 86_400_000).toISOString().slice(0, 10),
    longs: net + 100000,
    shorts: 100000,
    net,
  }));

describe("computePositioning (managed-money net length + 1y percentile)", () => {
  test("empty → PENDING / insufficient", () => {
    const s = computePositioning([], RUN);
    assert.equal(s.stance, "PENDING");
    assert.equal(s.status, "insufficient");
    assert.equal(s.netLength, null);
  });

  test("under 26 weeks → PENDING but carries the latest net", () => {
    const s = computePositioning(cotWeeks([10, 20, 30, 40]), RUN);
    assert.equal(s.stance, "PENDING");
    assert.equal(s.netLength, 40);
    assert.equal(s.percentile1y, null);
  });

  test("latest at the top of a full year → CROWDED_LONG (percentile 1)", () => {
    const rising = Array.from({ length: 30 }, (_, i) => i * 1000);
    const s = computePositioning(cotWeeks(rising), RUN);
    assert.equal(s.status, "live");
    assert.equal(s.percentile1y, 1);
    assert.equal(s.stance, "CROWDED_LONG");
    assert.equal(s.netLength, 29000);
  });

  test("latest at the bottom → CROWDED_SHORT", () => {
    const falling = Array.from({ length: 30 }, (_, i) => (30 - i) * 1000);
    const s = computePositioning(cotWeeks(falling), RUN);
    assert.equal(s.stance, "CROWDED_SHORT");
    assert.ok(s.percentile1y !== null && s.percentile1y <= 0.2);
  });
});
