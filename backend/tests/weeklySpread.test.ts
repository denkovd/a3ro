import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DailyValue,
  parseWeeklySpread,
  quantile,
  SPREAD_MIN_WINDOWS,
  trailingWeekMeans,
  weeklySpread,
  WEEK_MIN_REPORTED_DAYS,
} from "../src/core/weeklySpread";

const DAY_MS = 86_400_000;

/** `count` consecutive days starting at `start`, valued by index. */
function days(start: string, count: number, valueOf: (i: number) => number | null): DailyValue[] {
  const t0 = Date.parse(`${start}T00:00:00.000Z`);
  const out: DailyValue[] = [];
  for (let i = 0; i < count; i++) {
    const v = valueOf(i);
    if (v !== null) out.push({ date: new Date(t0 + i * DAY_MS).toISOString().slice(0, 10), value: v });
  }
  return out;
}

describe("quantile — linear interpolation over an ascending array", () => {
  test("matches percentile_cont on small arrays", () => {
    assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(quantile([10, 20], 0.1), 11);
    assert.equal(quantile([7], 0.9), 7);
    assert.ok(Number.isNaN(quantile([], 0.5)));
  });
});

describe("trailingWeekMeans — one 7-calendar-day mean per reported day", () => {
  test("a steady series yields that value for every day once a week is on file", () => {
    const pts = days("2026-01-01", 20, () => 10);
    const means = trailingWeekMeans(pts, "2026-01-01", "2026-01-20");
    // days 1–4 have fewer than 5 reported days behind them; days 5–20 are averaged
    assert.equal(means.length, 16);
    assert.ok(means.every((m) => m === 10));
    assert.equal(WEEK_MIN_REPORTED_DAYS, 5);
  });

  test("windows reach back before `from`, so the first day of the sample has a full week", () => {
    const pts = days("2026-01-01", 14, (i) => i); // 0..13
    const means = trailingWeekMeans(pts, "2026-01-08", "2026-01-14");
    assert.equal(means.length, 7);
    assert.equal(means[0], (1 + 2 + 3 + 4 + 5 + 6 + 7) / 7); // window ending 8 Jan
    assert.equal(means[6], (7 + 8 + 9 + 10 + 11 + 12 + 13) / 7); // window ending 14 Jan
  });

  test("a gap is a gap: thin weeks are not averaged and missing days never count as zero", () => {
    // 10 days reported, then 20 days missing, then 10 days reported
    const pts = [...days("2026-01-01", 10, () => 20), ...days("2026-01-31", 10, () => 20)];
    const means = trailingWeekMeans(pts, "2026-01-01", "2026-02-09");
    // each block: days 5..10 qualify → 6 windows per block
    assert.equal(means.length, 12);
    assert.ok(means.every((m) => m === 20), "the gap must not drag any mean toward zero");
  });

  test("a week with 5 or 6 reported days is averaged over the days reported", () => {
    const pts = days("2026-01-01", 7, (i) => (i === 2 || i === 4 ? null : 14)); // 5 of 7 days
    const means = trailingWeekMeans(pts, "2026-01-07", "2026-01-07");
    assert.deepEqual(means, [14]);
  });

  test("unordered input, duplicate dates and non-finite values are tolerated", () => {
    const pts: DailyValue[] = [
      ...days("2026-01-01", 7, () => 7).reverse(),
      { date: "2026-01-07", value: 14 }, // later duplicate wins
      { date: "2026-01-06", value: Number.NaN }, // dropped → day keeps its earlier value
      { date: "not-a-date", value: 99 },
    ];
    const means = trailingWeekMeans(pts, "2026-01-07", "2026-01-07");
    assert.deepEqual(means, [(7 * 6 + 14) / 7]);
  });
});

describe("weeklySpread — quantiles + robust spread of the 7-day averages", () => {
  test("too few windows → null (no spread from a thin record)", () => {
    const pts = days("2026-01-01", SPREAD_MIN_WINDOWS + 3, () => 5); // 4 short of enough windows
    assert.equal(weeklySpread(pts, "2026-01-01", "2026-12-31"), null);
    const enough = days("2026-01-01", SPREAD_MIN_WINDOWS + 4, () => 5);
    assert.equal(weeklySpread(enough, "2026-01-01", "2026-12-31")?.n, SPREAD_MIN_WINDOWS);
  });

  test("a flat series has zero spread and identical quantiles", () => {
    const w = weeklySpread(days("2025-01-01", 400, () => 12), "2025-02-01", "2026-01-31");
    assert.ok(w);
    assert.equal(w.n, 365);
    assert.equal(w.min, 12);
    assert.equal(w.p50, 12);
    assert.equal(w.max, 12);
    assert.equal(w.mad, 0);
    assert.equal(w.sampleFrom, "2025-02-01");
    assert.equal(w.sampleTo, "2026-01-31");
  });

  test("quantiles are ordered and the 7-day average is much steadier than single days", () => {
    // deterministic daily noise: 50 ± 20 on a 7-day cycle, so every 7-day mean is the same
    const cycle = [30, 40, 50, 60, 70, 50, 50];
    const w = weeklySpread(days("2025-01-01", 500, (i) => cycle[i % 7]), "2025-03-01", "2026-03-01");
    assert.ok(w);
    assert.equal(w.p50, 50);
    assert.equal(w.mad, 0); // daily values swing ±20, the weekly average does not move
    const ramp = weeklySpread(days("2025-01-01", 500, (i) => i), "2025-03-01", "2026-03-01");
    assert.ok(ramp);
    const q = [ramp.min, ramp.p05, ramp.p10, ramp.p25, ramp.p50, ramp.p75, ramp.p90, ramp.p95, ramp.max];
    for (let i = 1; i < q.length; i++) assert.ok(q[i] >= q[i - 1], "quantiles must be non-decreasing");
  });

  test("mad stays put through a long outage while the low quantiles collapse", () => {
    // 5 years at ~50/day with a small weekly wobble, then the last 40 weeks shut (0/day)
    const total = 5 * 365;
    const outageFrom = total - 40 * 7;
    const normal = (i: number) => 50 + ((Math.floor(i / 7) % 5) - 2) * 2; // weekly means 46..54
    const healthy = weeklySpread(days("2021-01-01", total, normal), "2021-01-08", "2025-12-31");
    const shut = weeklySpread(
      days("2021-01-01", total, (i) => (i >= outageFrom ? 0 : normal(i))),
      "2021-01-08",
      "2025-12-31",
    );
    assert.ok(healthy && shut);
    // the outage is ~15% of the window: it owns the p10, so a shut gate ranks "inside" the quantile band…
    assert.equal(shut.p10, 0);
    assert.ok(healthy.p10 > 45);
    // …but the robust spread still describes a normal week (a few tankers), not the outage
    assert.ok(shut.mad <= healthy.mad + 2, `mad ${shut.mad} should stay near ${healthy.mad}`);
    assert.ok(shut.mad < 5);
    assert.ok(shut.p50 > 45);
  });
});

describe("parseWeeklySpread — only a complete, numeric spread is trusted", () => {
  const good = {
    n: 365, min: 1, p05: 2, p10: 3, p25: 4, p50: 5, p75: 6, p90: 7, p95: 8, max: 9, mad: 0.8,
    sampleFrom: "2025-11-17", sampleTo: "2026-11-17",
  };

  test("accepts an object or its JSON text", () => {
    assert.deepEqual(parseWeeklySpread(good), good);
    assert.deepEqual(parseWeeklySpread(JSON.stringify(good)), good);
  });

  test("extra keys are dropped; anything missing or non-numeric reads as null", () => {
    assert.deepEqual(parseWeeklySpread({ ...good, extra: 1 }), good);
    assert.equal(parseWeeklySpread(null), null);
    assert.equal(parseWeeklySpread(undefined), null);
    assert.equal(parseWeeklySpread("{not json"), null);
    assert.equal(parseWeeklySpread({ ...good, mad: null }), null);
    assert.equal(parseWeeklySpread({ ...good, p50: "5" }), null);
    assert.equal(parseWeeklySpread({ ...good, sampleTo: undefined }), null);
    assert.equal(parseWeeklySpread({ ...good, max: Number.POSITIVE_INFINITY }), null);
  });
});
