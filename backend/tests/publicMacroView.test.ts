import { test } from "node:test";
import assert from "node:assert/strict";
import { publicMacroSnapshot } from "../src/macro/publicView";

test("public macro view drops raw Yahoo, ICE and Cboe numbers but keeps derived reads", () => {
  const row = {
    quadrant: "REFLATION", marketRegime: "GOLDILOCKS", marketRiskOn: 0.6,
    globalBonds: { symbol: "BWX", label: "x", asOf: "2026-11-20", return1m: -1.2, return3m: 0.4, drawdown1y: -3 },
    liquidityLegs: [
      { key: "global_bonds", value: -1.2, normalized: 0.8, source: "yahoo" },
      { key: "equity_vol", value: 18.4, normalized: 0.32, source: "fred" },
      { key: "credit_hy_oas", value: 3.1, normalized: 0.02, source: "fred" },
      { key: "dollar_broad", value: 121.4, normalized: 0.4, source: "fred" },
    ],
    components: [{ key: "credit_hy_oas", value: 3.1, normalized: 0.02 }, { key: "growth_indpro", value: 1.2, normalized: 0.3 }],
    vamsReads: [{ symbol: "CL=F", displayName: "WTI", state: "bull", z: 2.1, return63: 12.5, spotReturn63: 10.2, asOf: "2026-11-20", confirms: ["REFLATION"] }],
  } as never;
  const out = publicMacroSnapshot(row) as any;
  assert.equal(out.globalBonds, null);
  assert.deepEqual(out.liquidityLegs.map((l: any) => [l.key, l.value, l.normalized]), [["global_bonds", null, 0.8], ["equity_vol", null, 0.32], ["credit_hy_oas", null, 0.02], ["dollar_broad", 121.4, 0.4]]);
  assert.deepEqual(out.components.map((l: any) => [l.key, l.value]), [["credit_hy_oas", null], ["growth_indpro", 1.2]]);
  assert.deepEqual(out.vamsReads[0], { symbol: "CL=F", displayName: "WTI", state: "bull", z: null, return63: null, spotReturn63: null, asOf: "2026-11-20", confirms: ["REFLATION"] });
  assert.equal(out.marketRegime, "GOLDILOCKS");
  assert.equal((row as any).vamsReads[0].return63, 12.5, "the stored row is not mutated");
});
