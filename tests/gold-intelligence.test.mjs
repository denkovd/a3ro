import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/components/projects/gold/dataQuality.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { reportStatus, validMetric, sortedHistory, historyStart, reportTime } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const now = Date.parse("2026-10-11T12:00:00Z");
const metric = (periodDate, overrides = {}) => ({ locus: "comex", metric: "comex_registered_toz", periodDate, value: 1_000_000, unit: "troy_oz", source: "comex-stocks", observedAt: "2026-10-11T12:00:00Z", ...overrides });

test("freshness follows report dates, even when an old report was fetched today", () => {
  assert.equal(reportStatus(metric("2026-07-01"), "ready", false, now), "Outdated");
  assert.equal(reportStatus(metric("2026-10-09"), "ready", false, now), "Latest report");
  assert.equal(reportStatus(metric("2026-10-09"), "ready", true, now), "Outdated");
  assert.equal(reportStatus(metric("2026-12-01"), "ready", false, now), "Outdated");
});

test("weekly ETF publications allow more lag than daily warehouse reports", () => {
  assert.equal(reportStatus(metric("2026-10-01"), "ready", false, now), "Outdated");
  assert.equal(reportStatus(metric("2026-10-01", { metric: "etf_holdings_t", locus: "etf_us" }), "ready", false, now), "Latest report");
});

test("missing readings distinguish a pending request from unavailable data", () => {
  assert.equal(reportStatus(null, "loading"), "Loading");
  assert.equal(reportStatus(null, "empty"), "Unavailable");
  assert.equal(reportStatus(null, "error"), "Unavailable");
});

test("invalid readings cannot enter report history, while real zero values survive", () => {
  assert.equal(validMetric(metric("2026-10-09", { value: NaN })), false);
  assert.equal(validMetric(metric("2026-10-09", { value: null })), false);
  assert.equal(validMetric(metric("2026-10-09", { value: 0 })), true);
  assert.equal(validMetric(metric("2026-02-30")), false);
  assert.ok(Number.isNaN(reportTime("2026-02-30")));
});

test("history is sorted, isolated to the requested series and deduplicated by observation", () => {
  const rows = sortedHistory([
    metric("2026-10-09", { value: 2, observedAt: "2026-10-10T12:00:00Z" }),
    metric("2026-10-01", { value: 1 }),
    metric("2026-10-09", { value: 3 }),
    metric("2026-10-05", { locus: "etf_us" }),
    metric("2026-10-08", { value: Infinity }),
  ], "comex", "comex_registered_toz");
  assert.deepEqual(rows.map((r) => [r.periodDate, r.value]), [["2026-10-01", 1], ["2026-10-09", 3]]);
});

test("calendar ranges clamp month ends and use UTC across year and leap-year boundaries", () => {
  assert.equal(historyStart(1, new Date("2026-03-31T12:00:00Z")), "2026-02-28");
  assert.equal(historyStart(1, new Date("2024-03-31T12:00:00Z")), "2024-02-29");
  assert.equal(historyStart(3, new Date("2026-01-31T12:00:00Z")), "2025-10-31");
  assert.equal(historyStart(12, new Date("2024-02-29T12:00:00Z")), "2023-02-28");
});
