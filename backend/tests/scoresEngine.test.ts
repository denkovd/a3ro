import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  alignSpread,
  percentileOf,
  computeSpreadSignal,
  combineComposite,
  computeFlowStress,
  computeExportStrengthLeg,
  computeStockDrawLeg,
  computeThroughputDeviationLeg,
  spreadLegFrom,
  PricePoint,
} from "../src/scores/engine";
import { ScoreComponent } from "../src/core/scoreTypes";

/* ── helpers ──────────────────────────────────────────────────── */

/** n ascending YYYY-MM-DD dates from a UTC start. */
function mkDates(n: number, startISO = "2026-01-01"): string[] {
  const out: string[] = [];
  const d = new Date(`${startISO}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** WTI flat at 70, Brent = 70 + spread[i], sharing dates. */
function series(spreads: number[]): { wti: PricePoint[]; brent: PricePoint[] } {
  const dates = mkDates(spreads.length);
  return {
    wti: dates.map((d) => ({ date: d, value: 70 })),
    brent: dates.map((d, i) => ({ date: d, value: 70 + spreads[i] })),
  };
}

function leg(partial: Partial<ScoreComponent>): ScoreComponent {
  return {
    key: "k",
    label: "L",
    value: 1,
    unit: "u",
    normalized: 0.5,
    weight: 1,
    asOf: "2026-07-09",
    ...partial,
  };
}

/* ── alignSpread ──────────────────────────────────────────────── */

describe("alignSpread — inner-join on date, Brent − WTI", () => {
  test("keeps only shared dates, computes the spread, sorts ascending", () => {
    const wti: PricePoint[] = [
      { date: "2026-01-01", value: 70 },
      { date: "2026-01-02", value: 71 },
      { date: "2026-01-03", value: 72 },
    ];
    const brent: PricePoint[] = [
      { date: "2026-01-02", value: 75 },
      { date: "2026-01-03", value: 78 },
      { date: "2026-01-04", value: 80 }, // no WTI match → dropped
    ];
    const out = alignSpread(wti, brent);
    assert.deepEqual(out, [
      { date: "2026-01-02", value: 4 },
      { date: "2026-01-03", value: 6 },
    ]);
  });

  test("drops non-finite values on either side", () => {
    const wti: PricePoint[] = [{ date: "2026-01-01", value: NaN }, { date: "2026-01-02", value: 70 }];
    const brent: PricePoint[] = [{ date: "2026-01-01", value: 75 }, { date: "2026-01-02", value: 74 }];
    assert.deepEqual(alignSpread(wti, brent), [{ date: "2026-01-02", value: 4 }]);
  });
});

/* ── percentileOf ─────────────────────────────────────────────── */

describe("percentileOf — fraction ≤ x", () => {
  test("basic", () => assert.equal(percentileOf([1, 2, 3, 4], 2), 0.5));
  test("all equal → 1", () => assert.equal(percentileOf([5, 5, 5], 5), 1));
  test("empty → 0.5 neutral", () => assert.equal(percentileOf([], 5), 0.5));
});

/* ── computeSpreadSignal ──────────────────────────────────────── */

describe("computeSpreadSignal — Brent–WTI primitive", () => {
  test("declines below the minimum overlap", () => {
    const { wti, brent } = series([2, 2, 3]); // only 3 overlapping points
    const s = computeSpreadSignal(wti, brent, "2026-07-09");
    assert.equal(s.score, null);
    assert.equal(s.status, "insufficient");
    assert.equal(s.label, "NO DATA");
    assert.equal(s.coverage.available, 1); // newest value still shown
    assert.equal(s.components[0].normalized, null);
  });

  test("a wide latest spread scores high and labels WIDE", () => {
    const spreads = Array(59).fill(2).concat([6]); // stable ~2, jumps to 6
    const { wti, brent } = series(spreads);
    const s = computeSpreadSignal(wti, brent, "2026-07-09");
    assert.equal(s.score, 100);
    assert.equal(s.label, "WIDE");
    assert.equal(s.status, "elevated");
    assert.equal(s.components[0].value, 6);
    assert.equal(s.components[0].normalized, 1);
    assert.deepEqual(s.coverage, { available: 1, total: 1 });
    assert.match(s.headline, /widened/);
  });

  test("a narrow latest spread scores low and labels NARROW", () => {
    const spreads = Array(59).fill(5).concat([1]);
    const { wti, brent } = series(spreads);
    const s = computeSpreadSignal(wti, brent, "2026-07-09");
    assert.equal(s.label, "NARROW");
    assert.equal(s.status, "muted");
    assert.ok(s.score !== null && s.score <= 25);
    assert.match(s.headline, /narrowed/);
  });

  test("a mid-distribution latest spread is NORMAL", () => {
    // days 1..59 increasing 1..59, last day sits at 30 (near median)
    const spreads = Array.from({ length: 59 }, (_, i) => i + 1).concat([30]);
    const { wti, brent } = series(spreads);
    const s = computeSpreadSignal(wti, brent, "2026-07-09");
    assert.equal(s.label, "NORMAL");
    assert.equal(s.status, "normal");
    assert.equal(s.score, 52);
  });
});

/* ── combineComposite ─────────────────────────────────────────── */

describe("combineComposite — null-safe weighted combiner", () => {
  test("insufficient until minLegs are live", () => {
    const legs = [
      leg({ key: "a", normalized: 0.9 }),
      leg({ key: "b", normalized: null, value: null, asOf: null }),
      leg({ key: "c", normalized: null, value: null, asOf: null }),
    ];
    const s = combineComposite("flow_stress", "2026-07-09", legs, { minLegs: 2 });
    assert.equal(s.score, null);
    assert.equal(s.status, "insufficient");
    assert.equal(s.label, "PENDING");
    assert.deepEqual(s.coverage, { available: 1, total: 3 });
    assert.equal(s.components.length, 3); // legs never hidden
  });

  test("reweights over live legs, ignoring the dark one", () => {
    const legs = [
      leg({ key: "a", normalized: 1, weight: 1 }),
      leg({ key: "b", normalized: 0, weight: 1 }),
      leg({ key: "c", normalized: null, value: null, asOf: null, weight: 1 }),
    ];
    const s = combineComposite("flow_stress", "2026-07-09", legs, { minLegs: 2 });
    assert.equal(s.score, 50); // (1·1 + 0·1) / 2
    assert.equal(s.status, "normal");
    assert.deepEqual(s.coverage, { available: 2, total: 3 });
  });

  test("weights actually bias the composite", () => {
    const legs = [
      leg({ key: "a", normalized: 1, weight: 3 }),
      leg({ key: "b", normalized: 0, weight: 1 }),
    ];
    const s = combineComposite("flow_stress", "2026-07-09", legs);
    assert.equal(s.score, 75); // (1·3 + 0·1) / 4
    assert.equal(s.status, "elevated");
  });
});

/* ── computeFlowStress ────────────────────────────────────────── */

describe("computeFlowStress — corridor composite labels", () => {
  test("one live leg → PENDING", () => {
    const s = computeFlowStress("2026-07-09", [
      leg({ key: "spread", normalized: 0.9 }),
      leg({ key: "exports", normalized: null, value: null, asOf: null }),
    ]);
    assert.equal(s.label, "PENDING");
    assert.equal(s.score, null);
  });

  test("two live high legs → STRESSED", () => {
    const s = computeFlowStress("2026-07-09", [
      leg({ key: "spread", normalized: 1 }),
      leg({ key: "exports", normalized: 1 }),
    ]);
    assert.equal(s.score, 100);
    assert.equal(s.label, "STRESSED");
  });

  test("two live low legs → CALM", () => {
    const s = computeFlowStress("2026-07-09", [
      leg({ key: "spread", normalized: 0 }),
      leg({ key: "exports", normalized: 0 }),
    ]);
    assert.equal(s.score, 0);
    assert.equal(s.label, "CALM");
  });

  test("two live mid legs → MODERATE", () => {
    const s = computeFlowStress("2026-07-09", [
      leg({ key: "spread", normalized: 0.5 }),
      leg({ key: "exports", normalized: 0.5 }),
    ]);
    assert.equal(s.score, 50);
    assert.equal(s.label, "MODERATE");
  });
});

/* ── Flow Stress leg builders (added with the flow_stress wiring) ── */

/** n weekly-spaced YYYY-MM-DD dates ending 2026-07-03. */
function weeklyDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date("2026-07-03T00:00:00Z");
  for (let i = 0; i < n; i++) {
    out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return out;
}

function weeklySeries(values: number[]): PricePoint[] {
  const dates = weeklyDates(values.length);
  return values.map((v, i) => ({ date: dates[i], value: v }));
}

describe("computeExportStrengthLeg — latest vs accumulated history percentile", () => {
  test("below the min-points floor → null leg with an honest note", () => {
    const l = computeExportStrengthLeg(weeklySeries([4.0, 4.1, 4.2]));
    assert.equal(l.normalized, null);
    assert.equal(l.value, 4.2); // latest still displayed
    assert.match(l.note ?? "", /needs ≥4/);
  });

  test("latest at the top of its history → percentile 1", () => {
    const l = computeExportStrengthLeg(weeklySeries([3.0, 3.5, 4.0, 4.5]));
    assert.equal(l.normalized, 1);
    assert.equal(l.value, 4.5);
    assert.equal(l.asOf, "2026-07-03");
    assert.equal(l.weight, 1);
  });

  test("latest mid-history → mid percentile", () => {
    const l = computeExportStrengthLeg(weeklySeries([3.0, 5.0, 4.0, 3.5]));
    assert.equal(l.normalized, 0.5); // 3.0 and 3.5 are ≤ 3.5 → 2/4
  });

  test("empty history → null leg, null value", () => {
    const l = computeExportStrengthLeg([]);
    assert.equal(l.normalized, null);
    assert.equal(l.value, null);
    assert.equal(l.asOf, null);
  });
});

describe("computeStockDrawLeg — 4-week draw mapped through the fixed ±5% scale", () => {
  test("−5% US draw + flat Cushing → normalized 0.75, value = US Mbbl delta", () => {
    // 6 weekly points: base (−28d) 400 → latest 380 = −5%.
    const us = weeklySeries([402, 400, 398, 396, 390, 380]);
    const cushing = weeklySeries([20, 20, 20, 20, 20, 20]);
    const l = computeStockDrawLeg(us, cushing);
    assert.equal(l.normalized, 0.75); // (1.0 + 0.5) / 2
    assert.equal(l.value, -20); // 380 − 400
    assert.equal(l.unit, "Mbbl");
    assert.equal(l.asOf, "2026-07-03");
    assert.match(l.note ?? "", /US −5\.0%/);
    assert.match(l.note ?? "", /Cushing \+0\.0%/);
  });

  test("+5% build on both → normalized 0 (no stress)", () => {
    const us = weeklySeries([400, 400, 402, 405, 410, 420]);
    const cushing = weeklySeries([20, 20, 20.2, 20.5, 20.8, 21]);
    const l = computeStockDrawLeg(us, cushing);
    assert.equal(l.normalized, 0);
  });

  test("US missing → scores on Cushing alone, Cushing delta displayed", () => {
    const cushing = weeklySeries([20, 20, 19.5, 19.2, 19.0, 19.0]); // −5% vs −28d base
    const l = computeStockDrawLeg([], cushing);
    assert.equal(l.normalized, 1);
    assert.equal(l.value, -1); // 19 − 20
    assert.match(l.note ?? "", /Cushing −5\.0%/);
  });

  test("too little history on both series → null leg", () => {
    const l = computeStockDrawLeg(weeklySeries([400]), []);
    assert.equal(l.normalized, null);
    assert.equal(l.value, null);
  });

  test("span shorter than 28 days → null leg (no base point at/before cutoff)", () => {
    const short = weeklySeries([400, 399, 398]); // 14-day span
    const l = computeStockDrawLeg(short, []);
    assert.equal(l.normalized, null);
  });
});

describe("computeThroughputDeviationLeg — worst-gate shortfall below 1y norm", () => {
  test("picks the worst gate and reports it in the note", () => {
    const l = computeThroughputDeviationLeg([
      { corridor: "hormuz", current: 2.0, mean: 3.0, p10: 2.0 }, // shortfall 1.0
      { corridor: "suez", current: 2.9, mean: 3.0, p10: 2.0 }, // shortfall 0.1
    ]);
    assert.equal(l.normalized, 1);
    assert.equal(l.value, 2.0);
    assert.equal(l.unit, "Mt/d");
    assert.match(l.note ?? "", /worst: hormuz at 67% of 1y norm/);
    assert.match(l.note ?? "", /2 gates read/);
  });

  test("a surge above norm reads 0 — surges are not stress", () => {
    const l = computeThroughputDeviationLeg([
      { corridor: "cape", current: 3.5, mean: 3.0, p10: 2.0 },
    ]);
    assert.equal(l.normalized, 0);
  });

  test("gates without a valid band are skipped; none valid → null leg", () => {
    const l = computeThroughputDeviationLeg([
      { corridor: "panama", current: 1.0, mean: 2.0, p10: null }, // no p10
      { corridor: "suez", current: 1.0, mean: 2.0, p10: 2.5 }, // p10 ≥ mean
    ]);
    assert.equal(l.normalized, null);
    assert.equal(l.value, null);
  });
});

describe("spreadLegFrom — reuse of the same-run spread snapshot", () => {
  test("live spread passes its percentile through unchanged", () => {
    const { wti, brent } = series([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8]);
    const spread = computeSpreadSignal(wti, brent, "2026-07-09");
    assert.notEqual(spread.score, null); // sanity: 12 points ≥ min
    const l = spreadLegFrom(spread);
    assert.equal(l.normalized, spread.components[0].normalized);
    assert.equal(l.value, spread.components[0].value);
    assert.equal(l.weight, 1);
    assert.equal(l.key, "brent_wti_spread");
  });

  test("insufficient or missing spread → null leg", () => {
    const { wti, brent } = series([2, 3]); // below SPREAD_MIN_POINTS
    const insufficient = computeSpreadSignal(wti, brent, "2026-07-09");
    assert.equal(spreadLegFrom(insufficient).normalized, null);
    assert.equal(spreadLegFrom(null).normalized, null);
  });
});

describe("flow_stress end-to-end — four real legs through the combiner", () => {
  test("legs [1.0, 1.0, 0.75, mid-spread] → STRESSED with full coverage", () => {
    const throughput = computeThroughputDeviationLeg([
      { corridor: "hormuz", current: 2.0, mean: 3.0, p10: 2.0 }, // 1.0
    ]);
    const exportsLeg = computeExportStrengthLeg(weeklySeries([3.0, 3.5, 4.0, 4.5])); // 1.0
    const stockDraw = computeStockDrawLeg(
      weeklySeries([402, 400, 398, 396, 390, 380]), // −5% → 1.0
      weeklySeries([20, 20, 20, 20, 20, 20]), // 0% → 0.5
    ); // → 0.75
    const s = computeFlowStress("2026-07-09", [
      throughput,
      exportsLeg,
      stockDraw,
      spreadLegFrom(null), // dark leg — combiner reweights over the live three
    ]);
    assert.equal(s.coverage.available, 3);
    assert.equal(s.coverage.total, 4);
    assert.equal(s.score, Math.round(((1 + 1 + 0.75) / 3) * 100)); // 92
    assert.equal(s.label, "STRESSED");
    // every leg stays individually inspectable, live or not
    assert.equal(s.components.length, 4);
  });
});
