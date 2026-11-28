import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { OUTLOOK_END, PACE_METRICS, PREDICTIONS, projectAtPace, SCENARIOS, buildOutlook, lean, passThrough, project, scorePredictions, signposts, type OutlookInputs } from "../src/dividend/outlook/outlook";

/** Quarterly index from 2016-Q4, growing `pre`% a year to 2022-Q4 and `post`% after. */
function quarters(pre: number, post: number, last = "2026-Q3") {
  const points: { period: string; value: number }[] = [];
  let value = 100;
  for (let year = 2016; year <= Number(last.slice(0, 4)); year++) for (let q = year === 2016 ? 4 : 1; q <= 4; q++) {
    const period = `${year}-Q${q}`;
    if (period > last) break;
    points.push({ period, value });
    value *= Math.pow(1 + (period >= "2022-Q4" ? post : pre) / 100, 0.25);
  }
  return points;
}

const months = (from: string, values: number[]) => values.map((value, i) => {
  const index = Number(from.slice(0, 4)) * 12 + Number(from.slice(5)) - 1 + i;
  return { period: `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`, value };
});

function inputs(overrides: Partial<OutlookInputs> = {}): OutlookInputs {
  return {
    productivity: quarters(2, 2.8), realCompensation: quarters(1.5, 1.6),
    unemployment20to24: months("2022-11", [6.8, 7, 7.5]), unemployment25to54: months("2022-11", [3.1, 3.2, 3.6]),
    capability: { frontier: months("2026-09", [169, 170, 174]), gainLast12Months: 21 },
    adoption: { monthly: months("2026-08", [23, 23.8, 24.2]).map(point => ({ period: point.period, use: point.value })), changeSixMonths: 4.4 },
    postings: { exposed: months("2026-09", [89, 90, 91]), handsOn: months("2026-09", [117, 118, 121]), gap: -30, gapAtLaunch: -16 },
    infrastructure: { operatingMargin: 0.55 }, labsOperatingIncome: -27e9,
    financing: { ratio: 0.95, asOf: "2026-09-30" },
    ...overrides,
  };
}

describe("Signposts", () => {
  test("live-like readings lean toward gains pooling upstream", () => {
    const items = signposts(inputs());
    assert.equal(items.length, 7);
    assert.ok(items.every(item => item.available && item.rule));
    const result = lean(items);
    assert.equal(result.leader, "upstream");
    assert.equal(result.counts.bubble, 1);
  });

  test("each rule flips at its written threshold", () => {
    const by = (id: string, overrides: Partial<OutlookInputs>) => signposts(inputs(overrides)).find(item => item.id === id)!.supports;
    assert.deepEqual(by("capability", { capability: { frontier: [], gainLast12Months: 4 } }), ["bubble"]);
    assert.deepEqual(by("adoption", { adoption: { monthly: [], changeSixMonths: 0.5 } }), ["bubble"]);
    assert.deepEqual(by("conversion", { productivity: quarters(2, 1.8) }), ["bubble"]);
    assert.deepEqual(by("pass_through", { realCompensation: quarters(1.5, 2.1) }), ["dividend"]);
    assert.deepEqual(by("entry_jobs", { postings: { exposed: [], handsOn: [], gap: -8, gapAtLaunch: -16 } }), ["dividend"]);
    assert.deepEqual(by("profit_pool", { labsOperatingIncome: 1e9 }), ["dividend"]);
    assert.deepEqual(by("financing", { financing: { ratio: 0.6, asOf: "2026-09-30" } }), ["dividend"]);
    assert.deepEqual(by("financing", { financing: { ratio: 0.75, asOf: "2026-09-30" } }), []);
  });

  test("missing data counts for nothing and a tie has no leader", () => {
    const items = signposts(inputs({ capability: null, adoption: null, postings: null, infrastructure: null, financing: null, productivity: [], realCompensation: [] }));
    assert.equal(items.filter(item => item.available).length, 0);
    assert.equal(lean(items).leader, null);
  });
});

describe("Scenarios", () => {
  test("projection compounds trend + excess for productivity and pass-through for pay to 2031-Q4", () => {
    const result = project(quarters(2, 2.8), quarters(1.5, 1.6), 1, 0.5)!;
    assert.equal(result.from, "2026-Q3");
    assert.ok(Math.abs(result.trend - 2) < 0.01);
    assert.ok(Math.abs(result.productivityGrowth - 3) < 0.01);
    assert.ok(Math.abs(result.payGrowth - 1.5) < 0.01);
    assert.equal(result.productivity.at(-1)!.period, OUTLOOK_END.quarter);
    assert.equal(result.productivity.length, result.pay.length);
    const years = 21 / 4;
    assert.ok(Math.abs(result.productivityChange - (Math.pow(1.03, years) - 1) * 100) < 0.05);
    assert.ok(Math.abs(result.extraOutputVsTrend - (Math.pow(1.03 / 1.02, years) - 1) * 100) < 0.05);
  });

  test("zero excess means no extra output over the old trend", () => {
    assert.ok(Math.abs(project(quarters(2, 2.8), quarters(1.5, 1.6), 0, 0.6)!.extraOutputVsTrend) < 1e-9);
    assert.equal(project([], [], 1, 0.5), null);
  });

  test("scenario drivers are distinct and pass-through is measured against the pre-pandemic share", () => {
    assert.deepEqual(SCENARIOS.map(item => item.id), ["dividend", "bubble", "upstream"]);
    assert.ok(SCENARIOS.every(item => item.passThrough > 0 && item.passThrough <= 1));
    const pass = passThrough(quarters(2, 2.8), quarters(1.5, 1.6))!;
    assert.ok(Math.abs(pass.trend - 0.75) < 0.01);
    assert.ok(Math.abs(pass.since - 1.6 / 2.8) < 0.01);
  });
});

describe("Prediction ledger", () => {
  test("calls are dated, unique and resolve after they were made", () => {
    assert.equal(new Set(PREDICTIONS.map(item => item.id)).size, PREDICTIONS.length);
    for (const item of PREDICTIONS) {
      assert.match(item.madeOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(item.resolvesAt.slice(0, 4) >= item.madeOn.slice(0, 4));
    }
  });

  test("pending calls show the latest reading; resolved calls use the first reading at or after the date", () => {
    const now = scorePredictions(inputs());
    const btos = now.find(item => item.id === "2026-11-btos")!;
    assert.equal(btos.status, "pending");
    assert.deepEqual(btos.reading, { value: 24.2, asOf: "2026-10" });
    // Three months is too little history to judge a pace call.
    assert.equal(btos.onTrack, null);
    const later = scorePredictions(inputs({ adoption: { monthly: [...months("2027-05", [29, 31, 33]).map(point => ({ period: point.period, use: point.value }))], changeSixMonths: 5 } }));
    const resolved = later.find(item => item.id === "2026-11-btos")!;
    assert.equal(resolved.status, "hit");
    assert.deepEqual(resolved.reading, { value: 31, asOf: "2027-06" });
  });

  test("a miss is scored as a miss", () => {
    const result = scorePredictions(inputs({ unemployment20to24: months("2027-09", [6.5, 6.6]), unemployment25to54: months("2027-09", [3.5, 3.6]) })).find(item => item.id === "2026-11-youth")!;
    assert.equal(result.status, "miss");
    assert.equal(result.reading!.asOf, "2027-10");
  });

  test("the conversion gap is scored as it stood at the resolution quarter", () => {
    const result = scorePredictions(inputs({ productivity: quarters(2, 2.8, "2027-Q3"), realCompensation: quarters(1.5, 1.6, "2027-Q3") })).find(item => item.id === "2026-11-conversion")!;
    assert.equal(result.status, "hit");
    assert.equal(result.reading!.asOf, "2027-Q2");
  });

  test("buildOutlook bundles all three parts", () => {
    const outlook = buildOutlook(inputs());
    assert.equal(outlook.scenarios.length, 3);
    assert.ok(outlook.scenarios.every(item => item.projection));
    assert.equal(outlook.predictions.length, PREDICTIONS.length);
  });

  test("rising measures are judged on pace, not on today's level", () => {
    assert.ok(PACE_METRICS.has("business_ai_use") && PACE_METRICS.has("frontier_capability"));
    // 12 months rising 1 point a month: 25 in Nov 2026 reaches 32 by Jun 2027.
    const use = months("2025-11", [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
    assert.equal(projectAtPace(use, "2027-06"), 32);
    assert.equal(projectAtPace(use.slice(-3), "2027-06"), null);
    const read = scorePredictions(inputs({ adoption: { monthly: use.map(point => ({ period: point.period, use: point.value })), changeSixMonths: 6 } })).find(item => item.id === "2026-11-btos")!;
    assert.equal(read.status, "pending");
    assert.equal(read.onTrack, true);
    assert.equal(read.projected, 32);
    const flat = scorePredictions(inputs({ adoption: { monthly: months("2025-11", Array(13).fill(25)).map(point => ({ period: point.period, use: point.value })), changeSixMonths: 0 } })).find(item => item.id === "2026-11-btos")!;
    assert.equal(flat.onTrack, false);
  });

  test("level calls keep comparing the latest reading", () => {
    const read = scorePredictions(inputs()).find(item => item.id === "2026-11-capex")!;
    assert.equal(read.projected, null);
  });
});
