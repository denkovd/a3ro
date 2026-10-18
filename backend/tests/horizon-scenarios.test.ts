import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ASSUMPTION_RULES, HORIZON_MODEL_VERSION, HORIZON_SCENARIOS, ILLUSTRATIVE_HOUSEHOLDS, horizonSensitivity, runHorizonScenario, scenarioAnchor, validateHorizonAssumptions, type AssumptionKey, type ScenarioAnchor } from "../src/horizon/scenarios";
import { buildHorizonSnapshot } from "../src/horizon/engine";
import type { HorizonDataset, HorizonSnapshot } from "../src/horizon/types";

const anchor: ScenarioAnchor = { period: "2026-Q2", year: 2026, productivity: 120, realCompensation: 109, snapshotGeneratedAt: "2026-10-18T00:00:00Z", evidence: [] };
const preset = () => ({ ...HORIZON_SCENARIOS[1].assumptions });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
const run = (changes = {}) => runHorizonScenario(anchor, { ...preset(), ...changes });
const snapshot = (): HorizonSnapshot => {
  const dataset: HorizonDataset = { source: "bls", retrievedAt: anchor.snapshotGeneratedAt, publicationDate: null, dataUrl: "https://api.bls.gov/", series: [
    { key: "productivity", points: [{ period: "2025-Q4", value: 118, status: null }, { period: "2026-Q2", value: 120, status: null }, { period: "2026-Q3", value: 121, status: null }] },
    { key: "real_compensation", points: [{ period: "2025-Q4", value: 108, status: null }, { period: "2026-Q2", value: 109, status: null }] },
  ] };
  return buildHorizonSnapshot([dataset], [{ source: "bls", health: "healthy", checkedAt: anchor.snapshotGeneratedAt, error: null }], new Date(anchor.snapshotGeneratedAt), "unavailable");
};

describe("Horizon scenario evidence and inputs", () => {
  test("selects the latest shared actual quarter, not the latest unmatched reading", () => {
    const result = scenarioAnchor(snapshot())!;
    assert.equal(result.period, "2026-Q2");
    assert.equal(result.productivity, 120);
    assert.equal(result.realCompensation, 109);
    assert.equal(result.evidence.length, 2);
    assert.equal(result.evidence[0].freshness, "current");
  });
  test("does not fabricate an anchor when a series or common quarter is missing", () => {
    assert.equal(scenarioAnchor(null), null);
    const source = snapshot();
    source.indicators.find(item => item.key === "real_compensation")!.points = [];
    assert.equal(scenarioAnchor(source), null);
    source.indicators = [];
    assert.equal(scenarioAnchor(source), null);
  });
  test("filters invalid, future, nonfinite and nonpositive observations", () => {
    const source = snapshot();
    for (const key of ["productivity", "real_compensation"]) source.indicators.find(item => item.key === key)!.points.push(...["2026-Q5", "2027-Q1", "2026-Q4", "2046-Q2"].map(period => ({ period, value: 123, status: null })), { period: "2026-Q3", value: NaN, status: null });
    assert.equal(scenarioAnchor(source)!.period, "2026-Q2");
    source.indicators.find(item => item.key === "productivity")!.points = [{ period: "2026-Q2", value: 0, status: null }];
    assert.equal(scenarioAnchor(source), null);
  });
  test("common-quarter freshness is not borrowed from a later unshared observation", () => {
    const source = snapshot();
    source.indicators.find(item => item.key === "real_compensation")!.points = [{ period: "2025-Q4", value: 108, status: null }];
    assert.equal(scenarioAnchor(source)!.evidence[0].freshness, "stale");
  });
  test("validates every preset and bounds all inputs without numeric coercion", () => {
    for (const scenario of HORIZON_SCENARIOS) assert.deepEqual(validateHorizonAssumptions(scenario.assumptions), scenario.assumptions);
    for (const key of Object.keys(ASSUMPTION_RULES) as AssumptionKey[]) {
      for (const invalid of [NaN, Infinity, -Infinity, "1", null, undefined, ASSUMPTION_RULES[key].min - 0.01, ASSUMPTION_RULES[key].max + 0.01]) assert.throws(() => run({ [key]: invalid }), new RegExp(key));
    }
    for (const invalid of [null, [], 1, "assumptions"]) assert.throws(() => validateHorizonAssumptions(invalid));
    assert.throws(() => run({ constructor: 1 }), /Unknown/);
    assert.throws(() => run({ madeUpParameter: 2 }), /Unknown/);
    const missing = preset() as Partial<ReturnType<typeof preset>>;
    delete missing.inflation;
    assert.throws(() => validateHorizonAssumptions(missing), /inflation/);
    assert.throws(() => validateHorizonAssumptions(Object.create(preset())), /baselineGrowth/);
  });
  test("requires integer delays and a valid quarterly anchor", () => {
    for (const key of ["diffusionYears", "adoptionLag", "powerDelay", "policyDelay"]) assert.throws(() => run({ [key]: 1.5 }), /whole years/);
    for (const invalid of [{ period: "2026" }, { year: 2025 }, { period: "2046-Q1", year: 2046 }, { period: "2027-Q1", year: 2027 }, { snapshotGeneratedAt: "invalid" }, { productivity: NaN }, { realCompensation: -1 }]) assert.throws(() => runHorizonScenario({ ...anchor, ...invalid }, preset()), /baseline/);
  });
});

describe("Horizon scenario cash-flow and energy accounting", () => {
  test("starts at the observed quarter and includes annual checkpoints through 2046", () => {
    const result = run();
    assert.equal(result.modelVersion, HORIZON_MODEL_VERSION);
    assert.equal(result.points.length, 21);
    assert.equal(result.points[0].period, "2026-Q2");
    assert.equal(result.points.at(-1)!.period, "2046-Q2");
    for (const year of [2030, 2035, 2046]) assert.ok(result.points.find(point => point.year === year));
    const first = result.points[0];
    assert.equal(first.productivityIndex, 100);
    assert.equal(first.hourlyLabourIndex, 100);
    assert.equal(first.hoursIndex, 100);
    assert.equal(first.energyDemandIndex, 100);
    assert.equal(first.energySupplyIndex, 100);
    assert.deepEqual(first.households.map(item => item.roomReal), [20, 50]);
    assert.deepEqual(first.households.map(item => item.essentialBurden), [80, 50]);
  });
  test("a neutral scenario remains exactly flat; energy is included only once", () => {
    const result = run({ baselineGrowth: 0, aiPotential: 0, hoursLoss: 0, workloadGrowth: 0, energyEfficiency: 0, powerGrowth: 0, otherEssentialGrowth: 0 });
    for (const point of result.points) {
      near(point.productivityIndex, 100);
      for (const [index, household] of point.households.entries()) {
        near(household.incomeReal, 100);
        near(household.essentialsReal, ILLUSTRATIVE_HOUSEHOLDS[index].essentials);
        near(household.roomReal, 100 - ILLUSTRATIVE_HOUSEHOLDS[index].essentials);
      }
    }
  });
  test("general inflation converts nominal flows without changing real outcomes", () => {
    const zero = run({ inflation: 0 });
    const high = run({ inflation: 6 });
    for (const [index, point] of high.points.entries()) {
      near(point.productivityIndex, zero.points[index].productivityIndex);
      for (const [householdIndex, household] of point.households.entries()) {
        near(household.roomReal, zero.points[index].households[householdIndex].roomReal);
        near((household.incomeNominal - household.essentialsNominal) / point.priceDeflator, household.roomReal);
      }
    }
    assert.ok(high.points.at(-1)!.households[0].incomeNominal > zero.points.at(-1)!.households[0].incomeNominal);
  });
  test("redistribution balances financing exactly and respects delivery delay", () => {
    const without = run({ capitalLevy: 0 });
    const financed = run({ capitalLevy: 50, policyDelay: 5 });
    for (const [index, point] of financed.points.entries()) {
      const revenue = point.households.reduce((total, household) => total + household.levyReal, 0);
      near(revenue, point.households.reduce((total, household) => total + household.transferReal, 0));
      near(point.households.reduce((total, household) => total + household.incomeReal, 0), without.points[index].households.reduce((total, household) => total + household.incomeReal, 0));
      if (point.year < 2031) assert.equal(revenue, 0);
    }
    assert.ok(financed.points.at(-1)!.households[0].incomeReal > without.points.at(-1)!.households[0].incomeReal);
    assert.ok(financed.points.at(-1)!.households[1].incomeReal < without.points.at(-1)!.households[1].incomeReal);
  });
  test("no additional AI uplift means no AI capital levy or transfer", () => {
    for (const point of run({ aiPotential: 0, capitalLevy: 50, policyDelay: 0 }).points) for (const household of point.households) {
      assert.equal(household.levyReal, 0);
      assert.equal(household.transferReal, 0);
    }
  });
  test("diffusion is bounded, delayed and halves the remaining gap at its half-life", () => {
    const result = run({ adoptionLag: 2, diffusionYears: 4, workloadGrowth: 0, energyEfficiency: 0 });
    assert.equal(result.points[2].diffusion, 0);
    near(result.points[6].diffusion, 0.5);
    near(result.points[10].diffusion, 0.75);
    for (const point of result.points) assert.ok(point.effectiveDiffusion >= 0 && point.effectiveDiffusion <= point.diffusion && point.diffusion <= 1);
  });
  test("energy demand multiplies efficiency, delivery respects delays, scarcity gates AI", () => {
    const constrained = run({ workloadGrowth: 20, energyEfficiency: 10, powerGrowth: 10, powerDelay: 2, energyPriceResponse: 20 });
    near(constrained.points[1].energyDemandIndex, 108);
    near(constrained.points[2].energySupplyIndex, 100);
    near(constrained.points[3].energySupplyIndex, 110);
    const point = constrained.points[5];
    near(point.effectiveDiffusion, point.diffusion * Math.min(1, point.energySupplyIndex / point.energyDemandIndex));
    const ample = run({ workloadGrowth: 0, energyEfficiency: 0, powerGrowth: 20, powerDelay: 0 });
    for (const observation of ample.points) near(observation.effectiveDiffusion, observation.diffusion);
    for (const observation of ample.points) near(observation.households[0].energyReal, 10);
  });
  test("energy stress reaches only the energy basket component, with an 8% annual cap", () => {
    const stressed = run({ workloadGrowth: 35, energyEfficiency: 0, powerGrowth: 0, energyPriceResponse: 20, otherEssentialGrowth: 0 });
    for (const [index, point] of stressed.points.entries()) for (const [householdIndex, household] of point.households.entries()) {
      near(household.essentialsReal - household.energyReal, ILLUSTRATIVE_HOUSEHOLDS[householdIndex].essentials - ILLUSTRATIVE_HOUSEHOLDS[householdIndex].energy);
      if (index > 0) assert.ok(household.energyReal / stressed.points[index - 1].households[householdIndex].energyReal <= 1.08 + 1e-10);
    }
  });
  test("hours loss is separate from hourly income and productivity", () => {
    const retained = run({ hoursLoss: 0 });
    const lost = run({ hoursLoss: 30 });
    const endpoint = lost.points.at(-1)!;
    near(endpoint.productivityIndex, retained.points.at(-1)!.productivityIndex);
    near(endpoint.hourlyLabourIndex, retained.points.at(-1)!.hourlyLabourIndex);
    near(endpoint.households[0].labourReal, 95 * endpoint.hourlyLabourIndex / 100 * endpoint.hoursIndex / 100);
    assert.ok(endpoint.households[0].roomReal < retained.points.at(-1)!.households[0].roomReal);
  });
  test("negative spending room is retained and essential burdens may exceed 100%", () => {
    const endpoint = run({ baselineGrowth: -1, labourPassThrough: 0, hoursLoss: 30, otherEssentialGrowth: 4, energyPriceResponse: 20, workloadGrowth: 35, energyEfficiency: 0, powerGrowth: 0, capitalLevy: 0 }).points.at(-1)!;
    assert.ok(endpoint.households[0].roomReal < 0);
    assert.ok(endpoint.households[0].roomIndex < 0);
    assert.ok(endpoint.households[0].essentialBurden > 100);
  });
  test("every bounded corner tested stays finite, deterministic and input-immutable", () => {
    for (const boundary of ["min", "max"] as const) {
      const assumptions = Object.fromEntries((Object.keys(ASSUMPTION_RULES) as AssumptionKey[]).map(key => [key, ASSUMPTION_RULES[key][boundary]]));
      const before = JSON.stringify({ anchor, assumptions });
      const result = runHorizonScenario(anchor, assumptions);
      assert.deepEqual(result, runHorizonScenario(anchor, assumptions));
      assert.equal(JSON.stringify({ anchor, assumptions }), before);
      for (const point of result.points) for (const value of [...Object.values(point), ...point.households.flatMap(household => Object.values(household))]) if (typeof value === "number") assert.ok(Number.isFinite(value));
    }
  });
  test("serialised inputs reproduce the exact run and returned data cannot mutate its inputs", () => {
    const result = run();
    const restored = JSON.parse(JSON.stringify(result));
    assert.deepEqual(runHorizonScenario(restored.anchor, restored.assumptions), result);
    result.anchor.productivity = 999;
    result.assumptions.inflation = 6;
    assert.equal(anchor.productivity, 120);
    assert.equal(preset().inflation, 2);
  });
  test("sensitivity tests use bounded whole-year inputs and rank actual endpoint differences", () => {
    for (const scenario of HORIZON_SCENARIOS) {
      const result = horizonSensitivity(anchor, scenario.assumptions);
      assert.equal(result.length, 6);
      for (const [index, item] of result.entries()) {
        const rule = ASSUMPTION_RULES[item.key];
        assert.ok(item.low >= rule.min && item.high <= rule.max);
        near(item.spread, Math.abs(item.highRoom - item.lowRoom));
        if (index) assert.ok(result[index - 1].spread >= item.spread);
      }
    }
  });
});
