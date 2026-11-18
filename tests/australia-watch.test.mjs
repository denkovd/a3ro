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
    "../../../../backend/src/australia/registry": {
      AUSTRALIA_REGISTRY: { unemployment_rate: { section: "primary", order: 30, shortLabel: "Unemployment", releaseLagDays: 21, summaryTile: true }, cash_rate_target: { section: "primary", order: 200, shortLabel: "Cash rate", releaseLagDays: 5, decimals: 2 }, yield_curve_10y_3y: { section: "primary", order: 220, shortLabel: "Curve 10y–3y", display: "percentage_points", decimals: 2 }, aud_twi: { section: "primary", order: 270, display: "index", decimals: 1 }, dwelling_approvals: { section: "primary", order: 400, display: "count", decimals: 0 }, job_vacancies: { section: "primary", order: 50, display: "thousands", decimals: 1 }, trade_balance_goods: { section: "primary", order: 310, display: "aud_millions", decimals: 0 }, trimmed_mean_cpi_yoy: { section: "comparison", order: 110, shortLabel: "Trimmed mean CPI (Q)", releaseLagDays: 45 } },
      isAustraliaIndicator: id => ["unemployment_rate", "trimmed_mean_cpi_yoy", "cash_rate_target", "yield_curve_10y_3y", "aud_twi", "dwelling_approvals", "job_vacancies", "trade_balance_goods"].includes(id),
    },
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

test("summary tiles show flagged primary series only, in registry order", () => {
  const h = hookHarness();
  const rows = [
    { indicator: "trimmed_mean_cpi_yoy", referencePeriod: "2026-Q3" },
    { indicator: "unemployment_rate", referencePeriod: "2026-09" },
    { indicator: "unemployment_rate", referencePeriod: "2026-10" },
    { indicator: "retired_series", referencePeriod: "2026-10" },
    { indicator: "aud_twi", referencePeriod: "2026-10" },
  ];
  assert.deepEqual(h.helpers.summaryLatest(rows), [{ indicator: "unemployment_rate", referencePeriod: "2026-10" }]);
  assert.equal(h.helpers.shortLabel("unemployment_rate"), "Unemployment");
  assert.equal(h.helpers.shortLabel("retired_series"), "retired_series");
});

test("headline values follow the registry display format", () => {
  const h = hookHarness();
  const o = (indicator, value, extra = {}) => ({ indicator, value, frequency: "monthly", referencePeriod: "2026-10", ...extra });
  assert.equal(h.helpers.displayValue(o("cash_rate_target", 4.6)), "4.60%");
  assert.equal(h.helpers.displayValue(o("yield_curve_10y_3y", 0.386)), "+0.39 pp");
  assert.equal(h.helpers.displayValue(o("yield_curve_10y_3y", -0.2)), "-0.20 pp");
  assert.equal(h.helpers.displayValue(o("aud_twi", 64.7333)), "64.7");
  assert.equal(h.helpers.displayValue(o("unemployment_rate", 4.3)), "4.3%");
  const twi = [o("aud_twi", 64.75, { referencePeriod: "2026-09" }), o("aud_twi", 64.0)];
  assert.equal(h.helpers.delta(twi[1], twi), "-0.8 · -1.2% vs prior month");
  const curve = [o("yield_curve_10y_3y", 0.373, { referencePeriod: "2026-09" }), o("yield_curve_10y_3y", 0.386)];
  assert.equal(h.helpers.delta(curve[1], curve), "+0.01 pp vs prior month");
});

test("counts, thousands and A$ millions format for Phase 2 series", () => {
  const h = hookHarness();
  const o = (indicator, value, referencePeriod = "2026-09", frequency = "monthly") => ({ indicator, value, frequency, referencePeriod });
  assert.equal(h.helpers.displayValue(o("dwelling_approvals", 18311)), "18,311");
  assert.equal(h.helpers.displayValue(o("job_vacancies", 325, "2026-Q3", "quarterly")), "325.0k");
  assert.equal(h.helpers.displayValue(o("trade_balance_goods", 2826)), "$2,826m");
  assert.equal(h.helpers.displayValue(o("trade_balance_goods", -1450)), "-$1,450m");
  assert.equal(h.helpers.displayValue(o("trade_balance_goods", 81157.1)), "$81.2b");
  const approvals = [o("dwelling_approvals", 17173, "2026-08"), o("dwelling_approvals", 18311)];
  assert.equal(h.helpers.delta(approvals[1], approvals), "+1,138 · +6.6% vs prior month");
  const jv = [o("job_vacancies", 328, "2026-Q2", "quarterly"), o("job_vacancies", 325, "2026-Q3", "quarterly")];
  assert.equal(h.helpers.delta(jv[1], jv), "-3.0k · -0.9% vs prior quarter");
  const tb = [o("trade_balance_goods", 184, "2026-08"), o("trade_balance_goods", 2826)];
  assert.equal(h.helpers.delta(tb[1], tb), "+$2,642m vs prior month");
});
