import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeSeasonalTightnessLeg,
  computeUtilizationLeg,
  computeCrackLeg,
  computeTightness,
  StockLevel,
} from "../src/scores/engine";

/** A crack leg with no inputs on file — the honest "dark" leg used to
 *  assert 2/3-coverage behaviour (mirrors a run before spot prices land). */
const darkCrack = () =>
  computeCrackLeg({ gasoline: null, heatingOil: null, wti: null, asOf: null });
import { SeasonalBaseline } from "../src/core/seasonalTypes";

/* runDate 2026-07-11 is ISO week 28 (verified in eiaSeasonal.test.ts). */
const RUN_DATE = "2026-07-11";
const WK = 28;

function band(partial: Partial<SeasonalBaseline>): SeasonalBaseline {
  return {
    metric: "us_crude_stocks",
    isoWeek: WK,
    meanValue: 440,
    minValue: 400,
    maxValue: 480,
    sampleCount: 5,
    sampleFrom: "2021-07-16",
    sampleTo: "2026-07-03",
    computedAt: "2026-07-11T00:00:00.000Z",
    ...partial,
  };
}

function level(metric: string, value: number): StockLevel {
  return { metric, value, asOf: "2026-07-03" };
}

describe("computeSeasonalTightnessLeg — levels vs 5-yr week bands", () => {
  const bands = [
    band({ metric: "us_crude_stocks", minValue: 400, maxValue: 480 }),
    band({ metric: "gasoline_stocks", minValue: 200, maxValue: 240 }),
    band({ metric: "distillate_stocks", minValue: 100, maxValue: 140 }),
  ];

  test("levels at the 5y lows → fully tight (1)", () => {
    const l = computeSeasonalTightnessLeg(
      [level("us_crude_stocks", 400), level("gasoline_stocks", 200), level("distillate_stocks", 100)],
      bands,
      RUN_DATE,
    );
    assert.equal(l.normalized, 1);
    assert.equal(l.value, 400); // US crude displayed
    assert.equal(l.asOf, "2026-07-03");
    assert.match(l.note ?? "", /wk 28/);
    assert.match(l.note ?? "", /crude 0%/);
  });

  test("levels at the 5y highs → fully slack (0)", () => {
    const l = computeSeasonalTightnessLeg(
      [level("us_crude_stocks", 480), level("gasoline_stocks", 240), level("distillate_stocks", 140)],
      bands,
      RUN_DATE,
    );
    assert.equal(l.normalized, 0);
  });

  test("mixed positions average; levels outside the band clamp", () => {
    const l = computeSeasonalTightnessLeg(
      [
        level("us_crude_stocks", 440), // mid → tight 0.5
        level("gasoline_stocks", 190), // below 5y low → clamped → tight 1
        level("distillate_stocks", 150), // above 5y high → clamped → tight 0
      ],
      bands,
      RUN_DATE,
    );
    assert.equal(l.normalized, 0.5); // (0.5 + 1 + 0) / 3
  });

  test("fewer than 2 series with bands → null leg", () => {
    const l = computeSeasonalTightnessLeg([level("us_crude_stocks", 440)], bands, RUN_DATE);
    assert.equal(l.normalized, null);
    assert.equal(l.value, 440); // level still displayed
    assert.match(l.note ?? "", /needs ≥2/);
  });

  test("degenerate band (max ≤ min) is skipped", () => {
    const degenerate = [
      band({ metric: "us_crude_stocks", minValue: 400, maxValue: 400 }),
      band({ metric: "gasoline_stocks", minValue: 200, maxValue: 240 }),
      band({ metric: "distillate_stocks", minValue: 100, maxValue: 140 }),
    ];
    const l = computeSeasonalTightnessLeg(
      [level("us_crude_stocks", 400), level("gasoline_stocks", 220), level("distillate_stocks", 120)],
      degenerate,
      RUN_DATE,
    );
    // crude skipped → gasoline (0.5) + distillate (0.5) average
    assert.equal(l.normalized, 0.5);
    assert.match(l.note ?? "", /gasoline/);
    assert.doesNotMatch(l.note ?? "", /crude \d/);
  });

  test("week-53 run dates fall back to week 52 bands", () => {
    const wk52Bands = [
      band({ metric: "us_crude_stocks", isoWeek: 52 }),
      band({ metric: "gasoline_stocks", isoWeek: 52, minValue: 200, maxValue: 240 }),
    ];
    // 2021-01-01 is ISO week 53 (of 2020)
    const l = computeSeasonalTightnessLeg(
      [level("us_crude_stocks", 400), level("gasoline_stocks", 200)],
      wk52Bands,
      "2021-01-01",
    );
    assert.equal(l.normalized, 1); // both at lows via the wk-52 fallback
  });
});

describe("computeUtilizationLeg — fixed 85→0 / 100→1 scale", () => {
  test("maps the documented scale and clamps", () => {
    assert.equal(computeUtilizationLeg({ value: 85, asOf: "2026-07-03", series: "US" }).normalized, 0);
    assert.equal(computeUtilizationLeg({ value: 100, asOf: "2026-07-03", series: "US" }).normalized, 1);
    assert.equal(computeUtilizationLeg({ value: 92.5, asOf: "2026-07-03", series: "US" }).normalized, 0.5);
    assert.equal(computeUtilizationLeg({ value: 70, asOf: "2026-07-03", series: "US" }).normalized, 0);
    assert.equal(computeUtilizationLeg({ value: 101, asOf: "2026-07-03", series: "US" }).normalized, 1);
  });

  test("carries which series it read (US vs PADD 3 is never silent)", () => {
    const us = computeUtilizationLeg({ value: 95.8, asOf: "2026-07-03", series: "US" });
    assert.match(us.note ?? "", /^US /);
    const padd = computeUtilizationLeg({ value: 93.1, asOf: "2026-07-03", series: "PADD 3" });
    assert.match(padd.note ?? "", /^PADD 3 /);
  });

  test("missing reading → null leg", () => {
    const l = computeUtilizationLeg(null);
    assert.equal(l.normalized, null);
    assert.equal(l.value, null);
  });
});

describe("computeTightness — composite with the crack leg dark", () => {
  const liveBands = [
    band({ metric: "us_crude_stocks", minValue: 400, maxValue: 480 }),
    band({ metric: "gasoline_stocks", minValue: 200, maxValue: 240 }),
  ];

  test("low stocks + hot refineries → TIGHT at 2/3 coverage", () => {
    const inv = computeSeasonalTightnessLeg(
      [level("us_crude_stocks", 402), level("gasoline_stocks", 202)],
      liveBands,
      RUN_DATE,
    ); // ~0.95
    const util = computeUtilizationLeg({ value: 98.5, asOf: "2026-07-03", series: "US" }); // 0.9
    const s = computeTightness(RUN_DATE, [inv, util, darkCrack()]);
    assert.equal(s.coverage.available, 2);
    assert.equal(s.coverage.total, 3);
    assert.equal(s.label, "TIGHT");
    assert.ok((s.score ?? 0) >= 66);
    assert.equal(s.components.length, 3); // crack stays visible while dark
  });

  test("high stocks + slack refineries → SLACK", () => {
    const inv = computeSeasonalTightnessLeg(
      [level("us_crude_stocks", 478), level("gasoline_stocks", 238)],
      liveBands,
      RUN_DATE,
    );
    const util = computeUtilizationLeg({ value: 86, asOf: "2026-07-03", series: "US" });
    const s = computeTightness(RUN_DATE, [inv, util, darkCrack()]);
    assert.equal(s.label, "SLACK");
  });

  test("only one live leg → PENDING (minLegs 2)", () => {
    const util = computeUtilizationLeg({ value: 95, asOf: "2026-07-03", series: "US" });
    const s = computeTightness(RUN_DATE, [
      computeSeasonalTightnessLeg([], [], RUN_DATE),
      util,
      darkCrack(),
    ]);
    assert.equal(s.score, null);
    assert.equal(s.label, "PENDING");
  });
});

describe("computeCrackLeg (3:2:1 refining margin)", () => {
  test("live inputs → 3:2:1 margin and mid-scale normalization", () => {
    // (2*100 + 100)/3 - 70 = 100 - 70 = 30 $/bbl → scale $10→0,$50→1: (30-10)/40 = 0.5.
    const leg = computeCrackLeg({ gasoline: 100, heatingOil: 100, wti: 70, asOf: "2026-07-06" });
    assert.equal(leg.key, "crack_321");
    assert.equal(leg.value, 30);
    assert.equal(leg.normalized, 0.5);
    assert.equal(leg.asOf, "2026-07-06");
  });

  test("fat margin clamps to 1, thin margin clamps to 0", () => {
    const fat = computeCrackLeg({ gasoline: 200, heatingOil: 200, wti: 60, asOf: "2026-07-06" });
    assert.equal(fat.normalized, 1); // (140-8)/24 > 1 → clamped
    const thin = computeCrackLeg({ gasoline: 63, heatingOil: 63, wti: 70, asOf: "2026-07-06" });
    assert.equal(thin.normalized, 0); // negative margin → clamped to 0
  });

  test("any missing input → dark leg (null, honest coverage)", () => {
    const leg = computeCrackLeg({ gasoline: 126, heatingOil: null, wti: 69.6, asOf: "2026-07-06" });
    assert.equal(leg.value, null);
    assert.equal(leg.normalized, null);
    assert.equal(leg.asOf, null);
  });

  test("all three legs live → Tightness reads 3/3", () => {
    const inv = computeSeasonalTightnessLeg(
      [level("us_crude_stocks", 402), level("gasoline_stocks", 202)],
      [
        band({ metric: "us_crude_stocks", minValue: 400, maxValue: 480 }),
        band({ metric: "gasoline_stocks", minValue: 200, maxValue: 240 }),
      ],
      RUN_DATE,
    );
    const util = computeUtilizationLeg({ value: 96, asOf: "2026-07-03", series: "US" });
    const crack = computeCrackLeg({ gasoline: 100, heatingOil: 100, wti: 70, asOf: "2026-07-06" });
    const s = computeTightness(RUN_DATE, [inv, util, crack]);
    assert.equal(s.coverage.available, 3);
    assert.equal(s.coverage.total, 3);
    assert.ok(s.score !== null);
  });
});
