import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/components/landing/sequence.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { sequenceTiming, sequenceState, readingProgress, orbitPose } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

for (const mobile of [false, true]) {
  const timing = sequenceTiming(mobile, 5);
  const at = (distance) => sequenceState(distance / timing.total, timing);
  test(`${mobile ? "phone" : "desktop"}: exact half-turn completes before morphing`, () => {
    assert.equal(at(0).turn, 0);
    assert.equal(at(timing.rotation / 2).turn, 90);
    assert.equal(at(timing.rotation).turn, 180);
    assert.equal(at(timing.rotation).morph, 0);
    assert.equal(at(timing.cardsStart).morph, 1);
    assert.equal(at(timing.total).turn, 180);
  });
  test(`${mobile ? "phone" : "desktop"}: every card has a stable middle 65%`, () => {
    for (let i = 0; i < 5; i++) {
      for (const fraction of [0.175, 0.3, 0.5, 0.7, 0.825]) {
        const state = at(timing.cardsStart + (i + fraction) * timing.card);
        assert.ok(Math.abs(state.orbit - i) < 1e-10);
        assert.equal(state.active, i);
        assert.equal(state.appear, 1);
      }
      assert.equal(sequenceState(readingProgress(i, timing), timing).active, i);
      const pose = orbitPose(i, i, 1200, 800, mobile);
      assert.equal(pose.x, 0);
      assert.equal(pose.y, 0);
      assert.equal(pose.z, 0);
      assert.equal(pose.opacity, 1);
      assert.equal(pose.scale, 1);
    }
  });
  test(`${mobile ? "phone" : "desktop"}: reversing and skipping scroll never changes the result`, () => {
    const positions = Array.from({ length: 501 }, (_, i) => i / 500);
    const forward = positions.map((p) => sequenceState(p, timing));
    const backward = positions.toReversed().map((p) => sequenceState(p, timing)).toReversed();
    assert.deepEqual(forward, backward);
    for (let i = 1; i < forward.length; i++) {
      assert.ok(forward[i].turn >= forward[i - 1].turn);
      assert.ok(forward[i].orbit >= forward[i - 1].orbit);
      assert.ok(Math.abs(forward[i].orbit - forward[i - 1].orbit) < 0.1);
    }
    assert.deepEqual(sequenceState(-1, timing), sequenceState(0, timing));
    assert.deepEqual(sequenceState(2, timing), sequenceState(1, timing));
  });
  test(`${mobile ? "phone" : "desktop"}: phase and card boundaries are continuous`, () => {
    const boundaries = [timing.rotation, timing.cardsStart, timing.cardsEnd, timing.total,
      ...Array.from({ length: 5 }, (_, i) => timing.cardsStart + i * timing.card)];
    for (const boundary of boundaries) {
      const left = at(boundary - 0.00001), right = at(boundary + 0.00001);
      for (const key of ["turn", "morph", "orbit", "appear", "release"]) {
        assert.ok(Math.abs(left[key] - right[key]) < 0.0001, `${key} at ${boundary}`);
      }
    }
    assert.equal(at(timing.cardsEnd).release, 0);
    assert.equal(at(timing.total).release, 1);
  });
}

test("the helix changes lateral position, height and depth, with a shallower phone radius", () => {
  const desktop = orbitPose(1, 0.5, 1200, 800, false);
  const phone = orbitPose(1, 0.5, 390, 780, true);
  assert.ok(desktop.x > 0 && desktop.y > 0 && desktop.z < 0);
  assert.ok(phone.x > 0 && phone.y > 0 && phone.z < 0);
  assert.ok(phone.x < desktop.x && Math.abs(phone.z) < Math.abs(desktop.z));
  assert.ok(orbitPose(0, 0.5, 1200, 800, false).x < 0);
});
