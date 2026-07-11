/* ────────────────────────────────────────────────────────────────
   Futures roll module — hand-traced fixtures, incl. the full CL=F
   roll-cycle simulation required by the module spec.
──────────────────────────────────────────────────────────────── */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyBackAdjustment,
  closesMatch,
  contractSymbols,
  detectRoll,
  matchContinuousToContracts,
  verifyAdjustment,
} from "../src/bull/rolls";
import { RegimeBar } from "../src/regime/types";
import { RollEvent } from "../src/bull/types";

const bar = (date: string, close: number): RegimeBar => ({
  date, open: close - 0.5, high: close + 1, low: close - 1, close,
});

/* ── contract symbol generation ───────────────────────────────── */

test("CL contract symbols: monthly, mid-July 2026 → Q/U/V 26", () => {
  assert.deepEqual(
    contractSymbols("CL", ".NYM", "FGHJKMNQUVXZ", "2026-07-10", 3),
    ["CLQ26.NYM", "CLU26.NYM", "CLV26.NYM"],
  );
});

test("GC contract symbols: skips inactive months (GJMQVZ only)", () => {
  assert.deepEqual(
    contractSymbols("GC", ".CMX", "GJMQVZ", "2026-07-10", 3),
    ["GCQ26.CMX", "GCV26.CMX", "GCZ26.CMX"],
  );
});

test("contract symbols roll the year: Dec 2026 → F27", () => {
  assert.deepEqual(
    contractSymbols("CL", ".NYM", "FGHJKMNQUVXZ", "2026-12-15", 2),
    ["CLF27.NYM", "CLG27.NYM"],
  );
});

/* ── close matching ───────────────────────────────────────────── */

test("closesMatch: tick-level rounding passes, adjacent-month spread fails", () => {
  assert.equal(closesMatch(80.11, 80.11), true);
  assert.equal(closesMatch(80.11, 80.13), true);   // 0.02/80 ≈ 0.025% < 0.05%
  assert.equal(closesMatch(80.11, 80.91), false);  // ~1% — a real month spread
});

/* ── full CL=F roll cycle ─────────────────────────────────────── */

/** 10 trading days; the continuous tracks contract A (CLQ26) for
 *  d1–d5 and contract B (CLU26) from d6. Both contracts trade on
 *  d6 (roll date): A closes 80.00, B closes 81.20 → gap +1.20. */
function rollCycleFixture() {
  const dates = ["2026-07-01","2026-07-02","2026-07-03","2026-07-06","2026-07-07",
                 "2026-07-08","2026-07-09","2026-07-10","2026-07-13","2026-07-14"];
  const aCloses = [78.5, 79.0, 78.8, 79.5, 79.8, 80.0];        // d1–d6
  const bCloses = [79.9, 80.4, 80.2, 80.9, 81.0, 81.2, 81.5, 81.3, 81.8, 82.0]; // d1–d10
  const contA = aCloses.map((c, i) => bar(dates[i], c));
  const contB = bCloses.map((c, i) => bar(dates[i], c));
  // continuous = A's closes through d5, then B's from d6
  const contCloses = [...aCloses.slice(0, 5), ...bCloses.slice(5)];
  const continuous = contCloses.map((c, i) => bar(dates[i], c));
  const contracts = new Map<string, RegimeBar[]>([
    ["CLQ26.NYM", contA],
    ["CLU26.NYM", contB],
  ]);
  return { dates, continuous, contracts };
}

test("matchContinuousToContracts tracks the right contract per date", () => {
  const { dates, continuous, contracts } = rollCycleFixture();
  const m = matchContinuousToContracts(continuous, contracts);
  assert.equal(m.get(dates[0]), "CLQ26.NYM");
  assert.equal(m.get(dates[4]), "CLQ26.NYM");
  assert.equal(m.get(dates[5]), "CLU26.NYM");
  assert.equal(m.get(dates[9]), "CLU26.NYM");
});

test("detectRoll: finds the roll date, contracts, and gap from REAL contract closes", () => {
  const { dates, continuous, contracts } = rollCycleFixture();
  const roll = detectRoll("CL=F", continuous, contracts, 0);
  assert.ok(roll);
  assert.equal(roll.rollDate, dates[5]);          // 2026-07-08
  assert.equal(roll.oldContract, "CLQ26.NYM");
  assert.equal(roll.newContract, "CLU26.NYM");
  assert.ok(Math.abs(roll.gap - 1.2) < 1e-9);     // 81.20 − 80.00
  assert.ok(Math.abs(roll.cumAdjustment - 1.2) < 1e-9);
});

test("detectRoll accumulates prior adjustments", () => {
  const { continuous, contracts } = rollCycleFixture();
  const roll = detectRoll("CL=F", continuous, contracts, 0.55);
  assert.ok(roll);
  assert.ok(Math.abs(roll.cumAdjustment - 1.75) < 1e-9);
});

test("detectRoll: no switch → null; missing roll-day close → null (never guess)", () => {
  const { continuous, contracts } = rollCycleFixture();
  // Only contract B present → every matched date is B → no switch.
  const onlyB = new Map([["CLU26.NYM", contracts.get("CLU26.NYM")!]]);
  assert.equal(detectRoll("CL=F", continuous, onlyB, 0), null);
  // Old contract stops trading before the roll day → gap not computable.
  const truncatedA = contracts.get("CLQ26.NYM")!.slice(0, 5); // d1–d5 only
  const noOverlap = new Map([
    ["CLQ26.NYM", truncatedA],
    ["CLU26.NYM", contracts.get("CLU26.NYM")!],
  ]);
  assert.equal(detectRoll("CL=F", continuous, noOverlap, 0), null);
});

test("a genuine gap-open cannot fake a roll (no contract switch, no roll)", () => {
  // Continuous jumps 3% overnight but keeps matching the SAME contract.
  const dates = ["2026-07-01","2026-07-02","2026-07-03","2026-07-06"];
  const closes = [80, 80.5, 83.0, 83.4]; // gap-open on d3
  const cont = closes.map((c, i) => bar(dates[i], c));
  const contract = new Map([["CLQ26.NYM", cont.map((b) => ({ ...b }))]]);
  assert.equal(detectRoll("CL=F", cont, contract, 0), null);
});

test("applyBackAdjustment shifts ONLY pre-roll bars; present untouched", () => {
  const { dates, continuous } = rollCycleFixture();
  const roll: RollEvent = {
    symbol: "CL=F", rollDate: dates[5], oldContract: "CLQ26.NYM",
    newContract: "CLU26.NYM", gap: 1.2, cumAdjustment: 1.2,
  };
  const adj = applyBackAdjustment(continuous, roll);
  assert.ok(Math.abs(adj[0].close - (78.5 + 1.2)) < 1e-9);
  assert.ok(Math.abs(adj[4].close - (79.8 + 1.2)) < 1e-9);
  assert.equal(adj[5].close, continuous[5].close);   // roll day itself: new level
  assert.equal(adj[9].close, continuous[9].close);   // latest bar: real traded price
  // continuity: pre-roll d5 (adjusted) to d6 has no artificial 1.2 jump left
  const jump = Math.abs(adj[5].close - adj[4].close);
  assert.ok(jump < 0.5, `residual roll-day jump ${jump} should be market-sized, not gap-sized`);
});

test("verifyAdjustment: passes on correct adjustment, catches a broken one", () => {
  const { dates, continuous } = rollCycleFixture();
  const roll: RollEvent = {
    symbol: "CL=F", rollDate: dates[5], oldContract: "CLQ26.NYM",
    newContract: "CLU26.NYM", gap: 1.2, cumAdjustment: 1.2,
  };
  const adj = applyBackAdjustment(continuous, roll);
  const ok = verifyAdjustment(continuous, adj, [roll], dates[2]);
  assert.equal(ok.ok, true, ok.detail);
  assert.ok(Math.abs(ok.actualDelta - 1.2) < 1e-9);

  // Sabotage: pretend the shift was applied twice.
  const broken = applyBackAdjustment(adj, roll);
  const bad = verifyAdjustment(continuous, broken, [roll], dates[2]);
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /delta mismatch/);

  // Sabotage: adjusting the present must be caught.
  const presentTouched = adj.map((b, i) =>
    i === adj.length - 1 ? { ...b, close: b.close + 1.2 } : b);
  const bad2 = verifyAdjustment(continuous, presentTouched, [roll], dates[2]);
  assert.equal(bad2.ok, false);
  assert.match(bad2.detail, /present/);
});
