import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DIVIDEND_BUILD_STEPS, DIVIDEND_CURRENT_STEP, DIVIDEND_STAGES, VALUE_CHAIN_LAYERS, stageStatus } from "../src/dividend/framework";
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

  test("planned stages point to a build step that has not happened yet", () => {
    for (const stage of DIVIDEND_STAGES) {
      assert.ok(stage.step in DIVIDEND_BUILD_STEPS);
      if (stageStatus(stage) === "planned") assert.ok(stage.step > DIVIDEND_CURRENT_STEP, `${stage.id} is planned but its step has passed`);
      assert.ok(stage.measures.length > 0);
    }
  });

  test("only the households layer is live in step 1", () => {
    assert.deepEqual(VALUE_CHAIN_LAYERS.filter(layer => layer.live).map(layer => layer.id), ["households"]);
  });
});
