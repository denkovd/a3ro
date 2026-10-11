import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadUtility(name) {
  const path = name === "refineries" ? "../lib/oil/refineries.ts" : `../app/components/projects/oil/${name}.ts`;
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { metricFreshness, currentMetrics, quoteStatus, crackSpread, comparablePriorClose } = await loadUtility("dataQuality");
const { REFINERIES, refineryStatus } = await loadUtility("refineries");
const now = Date.parse("2026-10-10T12:00:00Z");
const metric = (name, periodDate, value = 90) => ({ metric: name, periodDate, value, corridor: "usgulf", unit: "%", source: "eia", updatedAt: "2026-10-10T12:00:00Z" });

test("front-month futures are not presented as changes against physical spot closes", () => {
  assert.equal(comparablePriorClose({ source: "yfinance" }, { source: "eia" }), false);
  assert.equal(comparablePriorClose({ source: "yfinance" }, { source: "fred" }), false);
  assert.equal(comparablePriorClose({ source: "eia" }, { source: "fred" }), true);
});

test("refreshing July observations does not make them current", () => {
  const row = metric("refinery_utilization", "2026-07-17");
  assert.equal(metricFreshness(row, now), "stale");
  assert.deepEqual(currentMetrics([row], now), []);
});

test("freshness follows source cadence and rejects invalid/future periods", () => {
  assert.equal(metricFreshness(metric("refinery_utilization", "2026-10-02"), now), "current");
  assert.equal(metricFreshness(metric("gasoline_spot", "2026-10-02"), now), "stale");
  assert.equal(metricFreshness(metric("bunker_sales", "2026-09-01"), now), "current");
  assert.equal(metricFreshness(metric("tanker_transits_7d", "2026-12-01"), now), "stale");
  assert.equal(metricFreshness(metric("tanker_transits_7d", "invalid"), now), "stale");
});

test("missing and non-finite readings cannot become current signals", () => {
  assert.deepEqual(currentMetrics(null, now), []);
  assert.deepEqual(currentMetrics([metric("refinery_utilization", "2026-10-09", NaN)], now), []);
});

test("prices preserve delayed, settlement and stale semantics", () => {
  const quote = { kind: "delayed", observedAt: "2026-10-10T11:50:00Z", staleness: "fresh" };
  assert.equal(quoteStatus(quote, now), "Delayed");
  assert.equal(quoteStatus({ ...quote, kind: "settlement" }, now), "Settlement");
  assert.equal(quoteStatus({ ...quote, kind: "live", observedAt: "2026-10-10T10:00:00Z" }, now), "Last trade");
  assert.equal(quoteStatus({ ...quote, observedAt: "2026-07-29T06:00:00Z" }, now), "Stale");
  assert.equal(quoteStatus({ ...quote, staleness: "dead" }, now), "Last trade");
  assert.equal(quoteStatus(undefined, now), "Unavailable");
});

test("margin proxy requires matched source dates and providers", () => {
  const rows = [metric("gasoline_spot", "2026-10-09", 110), metric("heating_oil_spot", "2026-10-09", 140), metric("wti_spot", "2026-10-09", 80)];
  assert.equal(crackSpread(rows, now).value, 40);
  assert.equal(crackSpread([rows[0], { ...rows[1], periodDate: "2026-10-08" }, rows[2]], now), null);
  assert.equal(crackSpread([rows[0], { ...rows[1], source: "other" }, rows[2]], now), null);
  assert.equal(crackSpread(rows.map(row => ({ ...row, periodDate: "2026-07-17" })), now), null);
  assert.equal(crackSpread(rows.slice(0, 2), now), null);
});

test("operator capacity references cannot imply operating status or an outage", () => {
  assert.equal(new Set(REFINERIES.map(r => r.id)).size, REFINERIES.length);
  for (const r of REFINERIES) {
    assert.ok(r.sourceUrl.startsWith("https://"));
    assert.ok(r.reviewedAt);
    assert.ok(r.lon >= -180 && r.lon <= 180 && r.lat >= -90 && r.lat <= 90);
    if (r.events.length === 0) assert.equal(refineryStatus(r), "Operating status unverified");
  }
  assert.equal(refineryStatus(REFINERIES.find(r => r.id === "grangemouth")), "Refining ceased");
  assert.equal(refineryStatus({ events: [{ date: "2025-04", kind: "closure" }, { date: "2026-09", kind: "restart" }] }), "Operating status unverified");
});
