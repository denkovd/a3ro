import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeTapeStance } from "../src/scores/engine";

const RUN = "2026-07-11";

describe("computeTapeStance (composite headline)", () => {
  test("fewer than 2 composites live → PENDING", () => {
    const t = computeTapeStance(RUN, { flowStress: 70, tightness: null, macroPressure: null });
    assert.equal(t.stance, "PENDING");
    assert.equal(t.coverage.available, 1);
  });

  test("macro divergence leads, even over a tight supply side", () => {
    const t = computeTapeStance(RUN, { flowStress: 80, tightness: 80, macroPressure: 50, macroDiverging: true });
    assert.equal(t.stance, "MACRO_DRIVEN");
    assert.equal(t.label, "MACRO-DRIVEN");
  });

  test("hot supply side (not diverging) → SUPPLY_TIGHT", () => {
    const t = computeTapeStance(RUN, { flowStress: 40, tightness: 75, macroPressure: 40 });
    assert.equal(t.stance, "SUPPLY_TIGHT");
    assert.equal(t.label, "SUPPLY-TIGHT");
  });

  test("both supply legs low → SUPPLY_AMPLE", () => {
    const t = computeTapeStance(RUN, { flowStress: 20, tightness: 25, macroPressure: 45 });
    assert.equal(t.stance, "SUPPLY_AMPLE");
  });

  test("macro hot with middling supply → MACRO_DRIVEN", () => {
    const t = computeTapeStance(RUN, { flowStress: 50, tightness: 50, macroPressure: 70 });
    assert.equal(t.stance, "MACRO_DRIVEN");
  });

  test("all middling → BALANCED; crowded-long positioning surfaces in the headline", () => {
    const t = computeTapeStance(RUN, {
      flowStress: 50, tightness: 50, macroPressure: 50, positioningStance: "CROWDED_LONG",
    });
    assert.equal(t.stance, "BALANCED");
    assert.equal(t.coverage.available, 3);
    assert.match(t.headline, /crowded long/i);
  });
});
