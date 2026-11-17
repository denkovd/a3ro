import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/components/landing/sequence.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { pullbackState, SPINE, spineRunway, spinePosition, spineStop, orbitState, nodeState } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));

test("the opening camera holds its scale while the routes are revealed", () => {
  assert.deepEqual(pullbackState(0), { turn: 0, scale: 1, lift: -0, opacity: 1 });
  assert.equal(pullbackState(0.35).scale, 1);
  assert.equal(pullbackState(0.45).turn, 100);
  assert.equal(pullbackState(0.55).opacity, 1);
});

test("the camera pulls away without disappearing before its final handoff", () => {
  const middle = pullbackState(0.75);
  assert.ok(middle.scale > 0.68 && middle.scale < 1);
  assert.ok(middle.lift < 0 && middle.lift > -90);
  assert.ok(middle.opacity > 0 && middle.opacity < 1);
  const end = pullbackState(1);
  assert.ok(Math.abs(end.scale - 0.68) < 1e-10);
  assert.equal(end.lift, -90);
  assert.equal(end.opacity, 0);
});

test("scrolling backwards or skipping positions restores the same camera state", () => {
  const positions = Array.from({ length: 501 }, (_, index) => index / 500);
  const forward = positions.map(pullbackState);
  assert.deepEqual(forward, positions.toReversed().map(pullbackState).toReversed());
  for (let index = 1; index < forward.length; index++) {
    assert.ok(forward[index].scale <= forward[index - 1].scale);
    assert.ok(forward[index].opacity <= forward[index - 1].opacity);
    assert.ok(Math.abs(forward[index].scale - forward[index - 1].scale) < 0.005);
  }
  assert.deepEqual(pullbackState(-1), pullbackState(0));
  assert.deepEqual(pullbackState(2), pullbackState(1));
});

const COUNT = 6;
const atStop = (index) => (1 + spineStop(index, COUNT)) / spineRunway(COUNT);

test("the first module docks as the stage pins and the last stays docked on release", () => {
  assert.equal(spinePosition(0, COUNT), -SPINE.entrance);
  assert.equal(spinePosition(1 / spineRunway(COUNT), COUNT), 0);
  assert.equal(spinePosition(1, COUNT), COUNT - 1);
  assert.deepEqual(spinePosition(-1, COUNT), spinePosition(0, COUNT));
  assert.deepEqual(spinePosition(2, COUNT), spinePosition(1, COUNT));
});

test("every module has a resting stop where its card faces the reader", () => {
  for (let index = 0; index < COUNT; index++) {
    assert.equal(spinePosition(atStop(index), COUNT), index);
    const state = orbitState(index - spinePosition(atStop(index), COUNT));
    assert.deepEqual([state.angle, state.x, state.depth, state.shade, state.presence, state.focus], [0, 0, 0, 0, 1, 1]);
  }
  // Half of each slot is a hold: nudging the scroll inside it changes nothing.
  const nudge = (SPINE.hold * SPINE.slot * 0.45) / spineRunway(COUNT);
  for (let index = 1; index < COUNT - 1; index++) {
    assert.equal(spinePosition(atStop(index) - nudge, COUNT), index);
    assert.equal(spinePosition(atStop(index) + nudge, COUNT), index);
  }
});

test("the ring turns one way, without jumps, and reverses exactly", () => {
  const positions = Array.from({ length: 2001 }, (_, index) => index / 2000);
  const forward = positions.map((p) => spinePosition(p, COUNT));
  assert.deepEqual(forward, positions.toReversed().map((p) => spinePosition(p, COUNT)).toReversed());
  for (let index = 1; index < forward.length; index++) {
    assert.ok(forward[index] >= forward[index - 1]);
    assert.ok(forward[index] - forward[index - 1] < 0.02);
  }
});

test("neighbours sit a sixth of a turn away and vanish before turning their backs", () => {
  const next = orbitState(1), previous = orbitState(-1);
  assert.equal(next.angle, SPINE.step);
  assert.equal(previous.angle, -SPINE.step);
  assert.ok(Math.abs(next.x + previous.x) < 1e-12 && next.x > 0.86);
  assert.ok(Math.abs(next.depth + 0.5) < 1e-12);
  assert.ok(next.presence === 1 && next.focus === 0 && next.shade > 0.5 && next.shade < 0.7);
  for (const offset of [1.5, -1.5, 2, -3, 5]) assert.equal(orbitState(offset).presence, 0);
  assert.ok(Math.abs(orbitState(1.5).angle) <= 90);
  assert.ok(Math.abs(orbitState(5).angle) <= 150);
  // Exactly one card is ever fully in focus, and focus hands over at the midpoint.
  assert.ok(Math.abs(orbitState(0.5).focus) < 1e-12 && Math.abs(orbitState(-0.5).focus) < 1e-12);
});

test("spine markers queue above the junction and below the card, never across its face", () => {
  assert.deepEqual(nodeState(0), { rail: 0, foot: 0, visible: 1, focus: 1 });
  assert.deepEqual(nodeState(-2), { rail: -2, foot: 0, visible: 1, focus: 0 });
  assert.deepEqual(nodeState(1), { rail: 1, foot: 1, visible: 1, focus: 0 });
  assert.deepEqual(nodeState(3), { rail: 3, foot: 1, visible: 1, focus: 0 });
  for (let offset = -3; offset <= 3; offset += 0.01) {
    const a = nodeState(offset), b = nodeState(offset + 0.01);
    assert.ok(b.rail + b.foot >= a.rail + a.foot);
    // A marker is hidden whenever it changes sides, so the jump is never seen.
    if (b.foot !== a.foot) assert.ok(a.visible === 0 && b.visible === 0);
  }
});
