import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DIVIDEND_BUILD_STEPS, DIVIDEND_CURRENT_STEP, DIVIDEND_STAGES, VALUE_CHAIN_LAYERS, nextStageStep, stageStatus } from "../src/dividend/framework";
import { DIVIDEND_INDICATORS } from "../src/dividend/indicators";

describe("AI Dividend measurement chain", () => {
  test("every live indicator key exists in the baseline", () => {
    const keys = new Set(DIVIDEND_INDICATORS.map(indicator => indicator.key));
    for (const stage of DIVIDEND_STAGES) for (const key of stage.liveIndicatorKeys) assert.ok(keys.has(key), `${stage.id} references unknown indicator ${key}`);
  });

  test("every baseline indicator is shown by at least one stage", () => {
    const shown = new Set(DIVIDEND_STAGES.flatMap(stage => stage.liveIndicatorKeys));
    for (const indicator of DIVIDEND_INDICATORS) assert.ok(shown.has(indicator.key), `${indicator.key} is not placed in the chain`);
  });

  test("stage ids are unique and the chain ends with the outlook", () => {
    assert.equal(new Set(DIVIDEND_STAGES.map(stage => stage.id)).size, DIVIDEND_STAGES.length);
    assert.equal(DIVIDEND_STAGES.at(-1)?.id, "outlook");
  });

  test("every measure belongs to a real build step and status follows them", () => {
    for (const stage of DIVIDEND_STAGES) {
      assert.ok(stage.measures.length > 0);
      for (const measure of stage.measures) assert.ok(measure.step in DIVIDEND_BUILD_STEPS);
      const status = stageStatus(stage);
      const next = nextStageStep(stage);
      assert.equal(status === "complete", next === null);
      if (next !== null) assert.ok(next > DIVIDEND_CURRENT_STEP);
    }
    assert.equal(stageStatus(DIVIDEND_STAGES.find(stage => stage.id === "capability")!, 2), "planned");
    assert.equal(stageStatus(DIVIDEND_STAGES.find(stage => stage.id === "capability")!, 3), "complete");
    assert.equal(stageStatus(DIVIDEND_STAGES.find(stage => stage.id === "distribution")!, 1), "partial");
  });

  test("a stage that shows baseline indicators already has a live measure", () => {
    for (const stage of DIVIDEND_STAGES) if (stage.liveIndicatorKeys.length) assert.notEqual(stageStatus(stage), "planned", stage.id);
  });

  test("every value-chain layer is live by step 2", () => {
    assert.ok(DIVIDEND_CURRENT_STEP >= 2);
    for (const layer of VALUE_CHAIN_LAYERS) assert.ok(layer.step <= DIVIDEND_CURRENT_STEP, layer.id);
  });
});
