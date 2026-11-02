import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the real hook with lifecycle/network dependencies controlled. This
// catches regressions where a mounted page never reloads, or loses good data.
function hookHarness() {
  let state, effect, cleanup, tick, calls = 0, fail = false;
  const listeners = new Map();
  const document = {
    visibilityState: "visible",
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(new URL("../app/components/projects/australia/australiaWatchData.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const stubs = {
    react: {
      useState: initial => { state = initial; return [state, value => { state = typeof value === "function" ? value(state) : value; }]; },
      useEffect: fn => { effect = fn; },
    },
    "../marketFetch": { fetchMarketSnapshot: async () => {
      calls++;
      if (fail) throw new Error("offline");
      return Response.json({ observations: [{ indicator: "unemployment_rate", value: calls }], fetchStates: {}, releaseSchedules: {} });
    } },
    "../../../../backend/src/australia/watch": { estimateFreshness: () => "fresh" },
  };
  new Function("require", "module", "exports", "document", "window", "setInterval", "clearInterval", outputText)(
    id => { if (!stubs[id]) throw new Error(`Unexpected import ${id}`); return stubs[id]; }, module, module.exports, document, window,
    (fn, interval) => { assert.equal(interval, 60_000); tick = fn; return 1; },
    () => { tick = undefined; },
  );
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {
    start: async () => { module.exports.useAustraliaWatch(); cleanup = effect(); await settle(); },
    tick: async () => { tick?.(); await settle(); },
    fire: async name => { listeners.get(name)?.(); await settle(); },
    hide: () => { document.visibilityState = "hidden"; },
    show: () => { document.visibilityState = "visible"; },
    fail: () => { fail = true; }, recover: () => { fail = false; },
    stop: () => cleanup(), state: () => state, calls: () => calls, listeners,
    helpers: module.exports,
  };
}

test("mounted Australia Watch refreshes periodically, on return, and cleans up", async () => {
  const h = hookHarness();
  await h.start();
  assert.equal(h.state().status, "ready");
  assert.equal(h.calls(), 1);
  await h.tick();
  assert.equal(h.state().observations[0].value, 2);
  h.hide();
  await h.tick();
  assert.equal(h.calls(), 2);
  h.show();
  await h.fire("visibilitychange");
  assert.equal(h.calls(), 3);
  await h.fire("focus");
  assert.equal(h.calls(), 4);
  h.stop();
  assert.equal(h.listeners.size, 0);
  await h.tick();
  assert.equal(h.calls(), 4);
});

test("refresh failure preserves observations and the next attempt recovers", async () => {
  const h = hookHarness();
  await h.start();
  const observations = h.state().observations;
  h.fail();
  await h.tick();
  assert.equal(h.state().status, "ready");
  assert.equal(h.state().refreshError, true);
  assert.equal(h.state().observations, observations);
  h.recover();
  await h.tick();
  assert.equal(h.state().refreshError, false);
  assert.equal(h.state().observations[0].value, 3);
  h.stop();
});

test("initial failure recovers and source checks expire independently of observation age", async () => {
  const h = hookHarness();
  h.fail();
  await h.start();
  assert.equal(h.state().status, "error");
  h.recover();
  await h.tick();
  assert.equal(h.state().status, "ready");
  const now = new Date("2026-11-02T00:00:00Z");
  assert.equal(h.helpers.fetchOverdue("2026-10-26T00:00:00Z", now), true);
  assert.equal(h.helpers.fetchOverdue("2026-11-01T00:00:00Z", now), false);
  assert.equal(h.helpers.fetchOverdue(null, now), true);
  h.stop();
});
