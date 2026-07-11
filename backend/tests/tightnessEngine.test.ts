import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeSeasonalTightnessLeg,
  computeUtilizationLeg,
  crackPendingLeg,
  computeTightness,
  StockLevel,
} from "../src/scores/engine";
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
    const s = computeTightness(RUN_DATE, [inv, util, crackPendingLeg()]);
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
    const s = computeTightness(RUN_DATE, [inv, util, crackPendingLeg()]);
    assert.equal(s.label, "SLACK");
  });

  test("only one live leg → PENDING (minLegs 2)", () => {
    const util = computeUtilizationLeg({ value: 95, asOf: "2026-07-03", series: "US" });
    const s = computeTightness(RUN_DATE, [
      computeSeasonalTightnessLeg([], [], RUN_DATE),
      util,
      crackPendingLeg(),
    ]);
    assert.equal(s.score, null);
    assert.equal(s.label, "PENDING");
  });
});
