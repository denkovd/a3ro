import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/components/landing/sequence.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { pullbackState } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));

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
