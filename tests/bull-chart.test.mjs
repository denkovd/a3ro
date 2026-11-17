import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));

// Transpile a backend module and its relative imports (no deps needed).
function loadModule(relativePath, cache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const localRequire = (id) => {
    if (id.startsWith(".")) return loadModule(path.relative(root, path.resolve(path.dirname(filename), `${id}.ts`)), cache);
    throw new Error(`Unexpected dependency: ${id}`);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}

const engine = loadModule("backend/src/regime/engine.ts");
const chart = loadModule("backend/src/bull/chartSignals.ts");

/** Deterministic trending-then-reversing daily series (weekdays only). */
function series(n = 520) {
  const bars = [];
  const d = new Date("2024-01-01T00:00:00Z");
  let price = 100;
  for (let i = 0; bars.length < n; i++) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      const drift = Math.sin(bars.length / 40) * 0.9 + Math.cos(bars.length / 7) * 0.6;
      const open = price;
      price = Math.max(5, price + drift);
      bars.push({
        date: d.toISOString().slice(0, 10), open,
        high: Math.max(open, price) + 0.8, low: Math.min(open, price) - 0.8, close: price,
      });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return bars;
}

test("the chart trace never changes the Money Line's result", () => {
  const bars = series();
  const plain = engine.runMoneyLine(bars);
  const trace = [];
  const traced = engine.runMoneyLine(bars, undefined, undefined, trace);
  assert.deepEqual(traced, plain);
  assert.ok(plain.flips.length >= 3, "fixture should flip several times");
  assert.equal(trace.length, bars.length - engine.DONCHIAN_LEN);
  const last = trace.at(-1);
  assert.equal(last.line, plain.line);
  assert.equal(last.trend, plain.trend);
  for (const f of plain.flips) {
    const p = trace.find((t) => t.date === f.date);
    assert.equal(p.trend, f.direction, `trend flips on ${f.date}`);
  }
});

test("chart levels match the snapshot the scan would store", () => {
  const bars = series();
  const runDate = "2026-01-15";
  const snap = engine.computeRegime({ symbol: "TEST", displayName: "Test", assetClass: "equity" }, bars, runDate);
  const payload = chart.buildBullChart("TEST", bars, runDate, "max");
  const level = (id) => payload.signals.find((s) => s.id === id);
  assert.equal(level("ml-daily-level")?.value, snap.daily.line);
  assert.equal(level("ml-weekly-level")?.value, snap.weekly.line);
  assert.equal(level("ml-daily").points.at(-1).value, snap.daily.line);
  assert.equal(level("ml-daily-flips").points.length, snap.daily.flips.length);
  assert.equal(level("ml-weekly-flips").points.length, snap.weekly.flips.length);
  assert.equal(payload.bars.at(-1).time, snap.lastCloseDate);
});

test("ranges trim bars and signals together; warm-up is computed on full history", () => {
  const bars = series();
  const full = chart.buildBullChart("TEST", bars, "2026-01-15", "max");
  const q = chart.buildBullChart("TEST", bars, "2026-01-15", "3m");
  assert.ok(q.bars.length > 55 && q.bars.length < 70, `3m ≈ 63 bars, got ${q.bars.length}`);
  const from = q.bars[0].time;
  for (const s of q.signals) {
    if (s.kind === "step" || s.kind === "markers") assert.ok(s.points.every((p) => p.time >= from), s.id);
  }
  // The visible window's levels equal the tail of the full-history run.
  const tail = full.signals.find((s) => s.id === "ml-daily").points.filter((p) => p.time >= from);
  assert.deepEqual(q.signals.find((s) => s.id === "ml-daily").points, tail);
  assert.equal(chart.isChartRange("1y"), true);
  assert.equal(chart.isChartRange("10y"), false);
});
