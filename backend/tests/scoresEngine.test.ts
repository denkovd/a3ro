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
  referenceNorm,
  FLOW_STRESS_WEIGHTS,
  GATE_READING_MAX_AGE_DAYS,
  NORM_SWITCH_DRIFT,
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

describe("referenceNorm — which window a gate is read against", () => {
  test("1y is the reference while it stays within 25% of the 5y norm", () => {
    assert.deepEqual(referenceNorm(2.958, 3.372), { mean: 2.958, win: "1y" }); // −12%
    assert.deepEqual(referenceNorm(0.709, 0.847), { mean: 0.709, win: "1y" }); // −16%
  });

  test("a 1y norm that has drifted ≥25% hands over to the 5y norm, in either direction", () => {
    assert.deepEqual(referenceNorm(0.614, 2.23), { mean: 2.23, win: "5y" }); // −72% (long outage)
    assert.deepEqual(referenceNorm(1.3, 1.0), { mean: 1.0, win: "5y" }); // +30%
    assert.deepEqual(referenceNorm(0.75, 1.0), { mean: 1.0, win: "5y" }); // exactly −25%
    assert.equal(NORM_SWITCH_DRIFT, 0.25);
  });

  test("falls back to whichever window exists; none usable → null", () => {
    assert.deepEqual(referenceNorm(2, null), { mean: 2, win: "1y" });
    assert.deepEqual(referenceNorm(null, 3), { mean: 3, win: "5y" });
    assert.deepEqual(referenceNorm(0, 3), { mean: 3, win: "5y" }); // a zero mean is not a norm
    assert.equal(referenceNorm(null, undefined), null);
    assert.equal(referenceNorm(0, 0), null);
  });
});

describe("computeThroughputDeviationLeg — worst-gate percent shortfall below its reference norm", () => {
  test("picks the worst gate and reports it, with its window, in the note", () => {
    const l = computeThroughputDeviationLeg([
      { corridor: "hormuz", current: 0.0, norm: 2.23, normWin: "5y" }, // shortfall 1.0
      { corridor: "suez", current: 0.63, norm: 0.7, normWin: "1y" }, // shortfall 0.1
    ]);
    assert.equal(l.normalized, 1);
    assert.equal(l.value, 0);
    assert.equal(l.unit, "Mt/d");
    assert.equal(l.weight, FLOW_STRESS_WEIGHTS.throughput);
    assert.match(l.note ?? "", /worst: hormuz at 0% of 5y norm/);
    assert.match(l.note ?? "", /2 gates read/);
  });

  test("shortfall is the share of the norm that is missing — it does not saturate on an ordinary week", () => {
    const l = computeThroughputDeviationLeg([
      { corridor: "singapore", current: 2.58, norm: 3.0, normWin: "1y" }, // 86% of norm
    ]);
    assert.equal(l.normalized, 0.14);
    const half = computeThroughputDeviationLeg([{ corridor: "suez", current: 0.35, norm: 0.7, normWin: "1y" }]);
    assert.equal(half.normalized, 0.5);
  });

  test("a surge above norm reads 0 — surges are not stress", () => {
    const l = computeThroughputDeviationLeg([
      { corridor: "cape", current: 3.5, norm: 3.0, normWin: "1y" },
    ]);
    assert.equal(l.normalized, 0);
  });

  test("a stale reading is skipped, never scored; all stale → null leg that says why", () => {
    const mixed = computeThroughputDeviationLeg([
      { corridor: "hormuz", current: 0, norm: 2.23, normWin: "5y", ageDays: 30 }, // stale: not the worst gate
      { corridor: "suez", current: 0.63, norm: 0.7, normWin: "1y", ageDays: 9 },
    ]);
    assert.equal(mixed.normalized, 0.1);
    assert.match(mixed.note ?? "", /worst: suez/);
    assert.match(mixed.note ?? "", /1 gates read · 1 stale, not scored/);

    const edge = computeThroughputDeviationLeg([
      { corridor: "suez", current: 0.63, norm: 0.7, normWin: "1y", ageDays: GATE_READING_MAX_AGE_DAYS },
    ]);
    assert.equal(edge.normalized, 0.1); // exactly at the limit still counts

    const dark = computeThroughputDeviationLeg([
      { corridor: "hormuz", current: 0, norm: 2.23, normWin: "5y", ageDays: 15 },
    ]);
    assert.equal(dark.normalized, null);
    assert.equal(dark.value, null);
    assert.match(dark.note ?? "", /1 stale, not scored/);
  });

  test("gates without a usable norm are skipped; none valid → null leg", () => {
    const l = computeThroughputDeviationLeg([
      { corridor: "panama", current: 1.0, norm: 0, normWin: "1y" },
      { corridor: "suez", current: 1.0, norm: Number.NaN, normWin: "1y" },
    ]);
    assert.equal(l.normalized, null);
    assert.equal(l.value, null);
    assert.equal(l.weight, FLOW_STRESS_WEIGHTS.throughput);
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
  test("legs [1.0, 1.0, 0.75, dark spread] → STRESSED, throughput carrying weight 3", () => {
    const throughput = computeThroughputDeviationLeg([
      { corridor: "hormuz", current: 0, norm: 2.23, normWin: "5y" }, // 1.0
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
    assert.equal(s.score, Math.round(((3 * 1 + 1 + 0.75) / 5) * 100)); // 95
    assert.equal(s.label, "STRESSED");
    // every leg stays individually inspectable, live or not
    assert.equal(s.components.length, 4);
  });

  test("weights give chokepoint disruption and US pull half the composite each", () => {
    assert.deepEqual(FLOW_STRESS_WEIGHTS, { throughput: 3, exportStrength: 1, stockDraw: 1, spread: 1 });
    const leg = (key: string, normalized: number | null, weight: number) =>
      ({ key, label: key, value: normalized, unit: "", normalized, weight, asOf: null, note: "" });
    const w = FLOW_STRESS_WEIGHTS;
    const score = (t: number | null, e: number, d: number, sp: number) =>
      computeFlowStress("2026-11-16", [
        leg("throughput_deviation", t, w.throughput),
        leg("export_strength", e, w.exportStrength),
        leg("stock_draw", d, w.stockDraw),
        leg("brent_wti_spread", sp, w.spread),
      ]);

    // The production legs of 2026-11-16: a shut gate with mid-range US legs.
    const shut = score(1, 0.3, 0.3732, 0.4);
    assert.equal(shut.score, 68); // (3 + 1.0732) / 6 — was 52 under equal weights
    assert.equal(shut.label, "STRESSED");

    // A shut gate alone is worth 50; a quiet US side keeps it MODERATE.
    assert.equal(score(1, 0, 0, 0).score, 50);
    assert.equal(score(1, 0.2, 0.2, 0.2).label, "MODERATE"); // 60

    // US pull alone, however strong, cannot read STRESSED.
    const usOnly = score(0, 1, 1, 1);
    assert.equal(usOnly.score, 50);
    assert.equal(usOnly.label, "MODERATE");

    // Throughput dark → the composite is the plain mean of the US legs.
    assert.equal(score(null, 0.3, 0.3732, 0.4).score, 36);
  });
});
