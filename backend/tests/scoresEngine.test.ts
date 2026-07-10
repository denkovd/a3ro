import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  alignSpread,
  percentileOf,
  computeSpreadSignal,
  combineComposite,
  computeFlowStress,
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
