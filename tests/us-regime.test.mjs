import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function load(path, mocks = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((id) => mocks[id] ?? require(id), module, module.exports);
  return module.exports;
}
const { macroFreshness, formatMacroUpdated, formatMacroPeriod } = await load("app/components/projects/macro/macroFreshness.ts");
const now = Date.parse("2026-10-11T07:00:00Z");
const current = {
  computedAt: "2026-10-11T06:00:00Z",
  cycles: [{ key: "growth", asOf: "2026-08-01" }, { key: "inflation", asOf: "2026-09-01" }],
};

test("a healthy daily computation can use lagged monthly releases", () => {
  assert.equal(macroFreshness(current, now), "current");
  assert.equal(formatMacroPeriod("2026-08-01"), "Aug 2026");
  assert.match(formatMacroUpdated(current.computedAt), /11 Oct 2026.*06:00.*UTC/);
});
test("a missed daily cycle or obsolete source period cannot read as current", () => {
  assert.equal(macroFreshness({ ...current, computedAt: "2026-10-08T06:00:00Z" }, now), "stale");
  assert.equal(macroFreshness({ ...current, cycles: [{ key: "growth", asOf: "2026-07-01" }, current.cycles[1]] }, now), "stale");
  assert.equal(macroFreshness({ ...current, computedAt: null }, now), "unknown");
  assert.equal(macroFreshness({ ...current, cycles: [] }, now), "unknown");
});

function surface(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
}

test("an open regime updates, keeps the last read on failure, recovers, and cleans up", async (t) => {
  const events = new Map();
  let tick, interval, cleanup, state, calls = 0, mode = "REFLATION";
  const listeners = {
    addEventListener: (name, handler) => events.set(name, handler),
    removeEventListener: (name) => events.delete(name),
  };
  const document = { visibilityState: "visible", ...listeners };
  surface(t, "document", document);
  surface(t, "window", { ...listeners, setInterval: (fn, ms) => { tick = fn; interval = ms; return 1; }, clearInterval: () => { tick = null; } });
  const { useMacroSnapshot } = await load("app/components/projects/macro/macroData.ts", {
    react: {
      useState: (initial) => { state = initial; return [state, (next) => { state = typeof next === "function" ? next(state) : next; }]; },
      useEffect: (effect) => { cleanup = effect(); },
    },
    "../marketFetch": { fetchMarketSnapshot: async () => {
      calls++;
      if (mode === "failure") throw new Error("offline");
      return Response.json({ macro: { ...current, quadrant: mode } });
    } },
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  useMacroSnapshot();
  await flush();
  assert.equal(interval, 300_000);
  assert.equal(state.quadrant, "REFLATION");
  mode = "failure";
  tick(); await flush();
  assert.equal(state.status, "live");
  assert.equal(state.quadrant, "REFLATION");
  assert.equal(state.refreshError, "offline");
  mode = "GOLDILOCKS";
  events.get("online")(); await flush();
  assert.equal(state.quadrant, "GOLDILOCKS");
  assert.equal(state.refreshError, undefined);
  document.visibilityState = "hidden";
  const before = calls;
  tick(); await flush();
  assert.equal(calls, before);
  document.visibilityState = "visible";
  events.get("visibilitychange")(); await flush();
  assert.equal(calls, before + 1);
  cleanup();
  assert.equal(events.size, 0);
  assert.equal(tick, null);
});

test("initial network failure retries automatically", async (t) => {
  let tick, state, cleanup, fail = true;
  surface(t, "document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
  surface(t, "window", { setInterval: (fn) => { tick = fn; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} });
  const { useMacroSnapshot } = await load("app/components/projects/macro/macroData.ts", {
    react: { useState: (initial) => { state = initial; return [state, (next) => { state = typeof next === "function" ? next(state) : next; }]; }, useEffect: (effect) => { cleanup = effect(); } },
    "../marketFetch": { fetchMarketSnapshot: async () => { if (fail) throw new Error("offline"); return Response.json({ macro: { ...current, quadrant: "DEFLATION" } }); } },
  });
  useMacroSnapshot();
  await new Promise((r) => setImmediate(r));
  assert.equal(state.status, "error");
  fail = false; tick();
  await new Promise((r) => setImmediate(r));
  assert.equal(state.status, "live");
  assert.equal(state.quadrant, "DEFLATION");
  cleanup();
});

test("the dedicated cron requires auth and exposes failed cycles as failures", async (t) => {
  const oldSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "regime-test";
  t.after(() => oldSecret === undefined ? delete process.env.CRON_SECRET : process.env.CRON_SECRET = oldSecret);
  let calls = 0, report = { written: 1, quadrant: "REFLATION", panel: ["internal"] };
  const auth = await load("app/api/_lib/cronAuth.ts");
  const { GET } = await load("app/api/cron/macro/route.ts", {
    "../../_lib/cronAuth": auth,
    "@a3ro/oil-backend": { createDb: async () => ({}), runMacroCycle: async () => { calls++; return report; } },
  });
  assert.equal((await GET(new Request("http://localhost/api/cron/macro"))).status, 401);
  assert.equal(calls, 0);
  const request = () => new Request("http://localhost/api/cron/macro", { headers: { Authorization: "Bearer regime-test" } });
  const success = await GET(request());
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { written: 1, quadrant: "REFLATION" });
  report = { written: 0, error: "FRED unavailable" };
  assert.equal((await GET(request())).status, 503);
  report = { written: 0 };
  assert.equal((await GET(request())).status, 503);
});
