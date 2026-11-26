import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computePulse, pulseHistory, indicatorSignal, measuredLead, quadrantLabel, shiftPeriod, LEAD_SEARCH } from "../src/australia/pulse";
import { AUSTRALIA_REGISTRY, indicatorsInSection } from "../src/australia/registry";
import type { AustraliaIndicator } from "../src/australia/types";

const NOW = new Date("2026-11-18T00:00:00Z");
const months = (end: string, n: number) => Array.from({ length: n }, (_, i) => shiftPeriod(end, i - n + 1));
function series(indicator: AustraliaIndicator, values: (i: number, period: string) => number, end = "2026-10", n = 132) {
  const def = AUSTRALIA_REGISTRY[indicator];
  const q = Math.ceil(n / 3);
  const periods = def.frequency === "monthly" ? months(end, n) : Array.from({ length: q }, (_, i) => shiftPeriod("2026-Q3", i - q + 1));
  return periods.map((referencePeriod, i) => ({ indicator, referencePeriod, value: values(i, referencePeriod), frequency: def.frequency }));
}

describe("periods", () => {
  test("shiftPeriod crosses year boundaries for months and quarters", () => {
    assert.equal(shiftPeriod("2026-01", -3), "2025-10");
    assert.equal(shiftPeriod("2025-11", 3), "2026-02");
    assert.equal(shiftPeriod("2026-Q1", -1), "2025-Q4");
    assert.equal(shiftPeriod("2025-Q4", 2), "2026-Q2");
  });
});

describe("indicator signals", () => {
  test("direction is the 3-month change in the charted value; polarity sets the growth sign", () => {
    const rows = series("unemployment_rate", (i) => 4 + i * 0.01);
    const s = indicatorSignal("unemployment_rate", rows, NOW)!;
    assert.equal(s.windowStartPeriod, "2026-07");
    assert.ok(Math.abs(s.change! - 0.03) < 1e-9);
    assert.equal(s.direction, "steady"); // 0.03 pp is inside the 0.05 steady band
    const rising = indicatorSignal("unemployment_rate", series("unemployment_rate", (i) => 4 + i * 0.05), NOW)!;
    assert.equal(rising.direction, "rising");
    assert.equal(rising.growthSignal, -1); // rising unemployment is growth-negative
    assert.equal(rising.inflationSignal, null); // unemployment carries no inflation polarity
  });
  test("yoy-transformed series use annual growth, not the level", () => {
    // Approvals level constant but a year-on-year step: growth unchanged inside the window → steady.
    const rows = series("dwelling_approvals", (i) => (i < 60 ? 15000 : 18000));
    const s = indicatorSignal("dwelling_approvals", rows, NOW)!;
    assert.equal(s.unit, "% YoY");
    assert.equal(s.direction, "steady");
  });
  test("quarterly series compare with the previous quarter", () => {
    const s = indicatorSignal("wage_price_index_yoy", series("wage_price_index_yoy", (i) => 3 + i * 0.1), NOW)!;
    assert.equal(s.windowStartPeriod, "2026-Q2");
    assert.equal(s.direction, "rising");
    assert.equal(s.inflationSignal, 1);
  });
  test("a stale series is flagged and excluded from diffusion", () => {
    const rows = series("cash_rate_target", (i) => 4 + i * 0.01, "2026-03");
    assert.equal(indicatorSignal("cash_rate_target", rows, NOW)!.stale, true);
  });
});

describe("pulse", () => {
  const leading = indicatorsInSection("primary").filter((id) => AUSTRALIA_REGISTRY[id].role === "leading" && AUSTRALIA_REGISTRY[id].growthPolarity !== 0);
  test("all leading series improving → growth axis up; counts are exact", () => {
    // Series charted as annual growth need an accelerating level for their growth to rise; a straight
    // line has falling annual growth (and is correctly counted as weakening).
    const improving = (id: AustraliaIndicator) => (i: number) => AUSTRALIA_REGISTRY[id].transform === "yoy_from_level"
      ? 100 * Math.exp(0.0002 * i * i) : AUSTRALIA_REGISTRY[id].growthPolarity > 0 ? 1 + i * 0.2 : 50 - i * 0.2;
    const rows = leading.flatMap((id) => series(id, improving(id)));
    const p = computePulse(rows, { now: NOW });
    assert.equal(p.growth.members.length, leading.length);
    assert.equal(p.growth.up + p.growth.down + p.growth.steady + p.growth.excluded.length, leading.length);
    assert.equal(p.growth.down, 0);
    assert.equal(p.quadrant.growth, "up");
    assert.equal(p.quadrant.inflation, null); // no inflation series supplied
    assert.equal(p.quadrant.label, "Not enough current readings");
    assert.ok(p.coverage.missing.length > 0);
  });
  test("inflation axis: every primary inflation-pillar series; rising prices → pressure building", () => {
    const infl = indicatorsInSection("primary").filter((id) => AUSTRALIA_REGISTRY[id].pillar === "inflation");
    const rows = [...infl.flatMap((id) => series(id, (i) => 2 + i * 0.1)), ...leading.flatMap((id) => series(id, (i) => AUSTRALIA_REGISTRY[id].transform === "yoy_from_level" ? 100 * Math.exp(-0.0002 * i * i) : AUSTRALIA_REGISTRY[id].growthPolarity > 0 ? 50 - i * 0.2 : 1 + i * 0.2))];
    const p = computePulse(rows, { now: NOW });
    assert.deepEqual([p.inflation.up, p.inflation.down], [infl.length, 0]);
    assert.equal(p.quadrant.label, "Leading indicators weakening, price pressure building");
  });
  test("quadrant labels are descriptive and need three counted series per axis", () => {
    assert.equal(quadrantLabel("up", "down"), "Leading indicators improving, price pressure easing");
    assert.equal(quadrantLabel("mixed", "down"), "Mixed readings");
  });
  test("what moved: largest absolute change in z-score, at most five, deterministic order", () => {
    const ids = ["cash_rate_target", "gov_bond_10y", "unemployment_rate", "housing_credit_growth", "business_credit_growth", "underemployment_rate"] as const;
    const rows = ids.flatMap((id, k) => series(id, (i) => 3 + Math.sin(i / 5) * 0.3 + (i === 131 ? (k + 1) * 0.2 : 0)));
    const p = computePulse(rows, { now: NOW });
    assert.equal(p.moved.length, 5);
    assert.equal(p.moved[0].indicator, "underemployment_rate"); // biggest final jump
    for (let i = 1; i < p.moved.length; i++) assert.ok(Math.abs(p.moved[i - 1].zChange) >= Math.abs(p.moved[i].zChange));
  });
});

describe("measured leads", () => {
  test("recovers a planted 6-month lead over the fall in unemployment, outside the pandemic window", () => {
    const end = "2026-10"; const n = 132;
    const cycle = (i: number) => Math.sin((2 * Math.PI * i) / 40) + 0.15 * Math.sin(i * 1.7);
    // Leading series at t; unemployment built so that its 12-month fall at t+6 follows the leading series at t.
    const lead = series("housing_credit_growth", (i) => 7 + cycle(i));
    const u: number[] = [];
    for (let i = 0; i < n; i++) u.push(i < 12 ? 4 : u[i - 12] - 0.4 * cycle(i - 6));
    const unemp = months(end, n).map((referencePeriod, i) => ({ indicator: "unemployment_rate", referencePeriod, value: u[i], frequency: "monthly" as const }));
    const m = measuredLead("housing_credit_growth", [...lead, ...unemp])!;
    assert.equal(m.lagMonths, 6);
    assert.ok(m.r > 0.9);
    assert.ok(m.pairs >= LEAD_SEARCH.minPairs);
  });
  test("no lead is reported without a correlation of at least 0.3", () => {
    // Two independent deterministic pseudo-random walks (LCG), so the test is repeatable.
    const lcg = (seed: number) => { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5; };
    const a = lcg(1), b = lcg(987654321);
    const xs = Array.from({ length: 132 }, () => a()), us: number[] = []; for (let i = 0; i < 132; i++) us.push((us[i - 1] ?? 4) + b() * 0.1);
    const rows = [...series("housing_credit_growth", (i) => 7 + xs[i]), ...series("unemployment_rate", (i) => us[i])];
    assert.equal(measuredLead("housing_credit_growth", rows), null);
  });
  test("quarterly, non-leading and the reference series itself are never measured", () => {
    assert.equal(measuredLead("job_vacancies", []), null);
    assert.equal(measuredLead("hours_worked", []), null);
    assert.equal(measuredLead("unemployment_rate", []), null);
  });
});

describe("pulse trail", () => {
  const leading = indicatorsInSection("primary").filter((id) => AUSTRALIA_REGISTRY[id].role === "leading" && AUSTRALIA_REGISTRY[id].growthPolarity !== 0);
  const improving = (id: AustraliaIndicator) => (i: number) => AUSTRALIA_REGISTRY[id].transform === "yoy_from_level"
    ? 100 * Math.exp(0.0002 * i * i) : AUSTRALIA_REGISTRY[id].growthPolarity > 0 ? 1 + i * 0.2 : 50 - i * 0.2;
  test("five previous month-ends, oldest first, each using only readings up to that month", () => {
    const rows = leading.flatMap((id) => series(id, improving(id)));
    const trail = pulseHistory(rows, 5);
    assert.deepEqual(trail.map((t) => t.month), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    for (const t of trail) { assert.equal(t.growth, 1); assert.equal(t.inflation, null); }
  });
  test("no monthly data → empty trail", () => {
    assert.deepEqual(pulseHistory([]), []);
  });
});
