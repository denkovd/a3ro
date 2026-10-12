import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNbsEnergy, parseCustomsImports, customsImportLinks, nbsEnergyLinks, withImportGrowth, NbsChinaSource, CustomsChinaSource } from "../src/sources/chinaOil";
import { chinaSummary, chinaMapText, chinaPeriod } from "../../app/components/projects/oil/china";
import { metricFreshness } from "../../app/components/projects/oil/dataQuality";
import { runCorridorCycle } from "../src/ingest/corridorPipeline";
import type { CorridorMetricLatest } from "../src/core/corridorTypes";
import { getLatestCorridorMetrics, getCorridorMetricSeries } from "../src/storage/corridorRepo";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/china/${name}.html`, import.meta.url), "utf8");
const now = "2026-10-11T00:00:00Z";
const nbsUrl = "https://www.stats.gov.cn/english/PressRelease/202609/t20260916_1965338.html";
const customsUrl = "http://english.customs.gov.cn/Statics/1c29d265-76bf-4a44-9867-224c6ba7ec52.html";
const nbs = parseNbsEnergy(fixture("nbs-august"), nbsUrl, now);
const imports = parseCustomsImports(fixture("customs-preliminary-august"), customsUrl, now);
const latest = (rows = [...imports, ...nbs]): CorridorMetricLatest[] => rows.map(r => ({ ...r, updatedAt: now }));

test("NBS extracts monthly oil figures and coverage-adjusted growth, excluding YTD totals", () => {
  assert.equal(nbs.find(r => r.metric === "crude_processing")?.value, 59.07);
  assert.equal(nbs.find(r => r.metric === "crude_production")?.value, 18.43);
  assert.equal(nbs.find(r => r.metric === "crude_processing")?.meta?.yoyPct, "-6.9");
  assert.equal(nbs[0].meta?.periodEnd, "2026-08-31");
  assert.equal(nbs[0].meta?.publishedDate, "2026-09-16");
});
test("older NBS petroleum wording still extracts monthly volumes, not cumulative production", () => {
  const rows = parseNbsEnergy(fixture("nbs-may-2025"), "https://www.stats.gov.cn/english/PressRelease/202506/t20250620_1960220.html", now);
  assert.equal(rows[0].value, 18.47);
  assert.equal(rows[1].value, 59.11);
  assert.equal(rows[1].meta?.yoyPct, "-1.8");
});
test("Customs quantities use 10,000 tonnes; cumulative growth is not monthly YoY", () => {
  assert.equal(imports[0].value, 37.928);
  assert.equal(imports[0].meta?.yoyPct, undefined);
  assert.equal(imports[0].meta?.publishedDate, "2026-09-09");
  const prior = { ...imports[0], periodDate: "2025-08-01", value: 49.18, meta: { ...imports[0].meta, periodStart: "2025-08-01" } };
  const growth = withImportGrowth([imports[0], prior])[0];
  assert.ok(Math.abs(Number(growth.meta?.yoyPct) - (-22.88)) < 0.02);
});
test("Jan–Feb stays combined using Customs cumulative quantity and actual calendar days", () => {
  const feb = parseCustomsImports(fixture("customs-february"), customsUrl, now)[0];
  assert.equal(feb.value, 96.934);
  assert.equal(feb.meta?.periodStart, "2026-01-01");
  assert.equal(Number(feb.meta?.dailyKt), 96934 / 59);
  assert.equal(chinaPeriod(feb), "Jan–Feb 2026");
  const combined = parseCustomsImports(fixture("customs-janfeb-2025"), customsUrl, now)[0];
  assert.equal(combined.value, 83.854);
  assert.equal(combined.meta?.yoyPct, "-5");
  assert.equal(combined.meta?.periodStart, "2025-01-01");
  const leap = parseCustomsImports(fixture("customs-janfeb-2025").replaceAll("2025", "2024"), customsUrl, now)[0];
  assert.equal(Number(leap.meta?.dailyKt), 83854 / 60);
});
test("source discovery handles Customs unquoted links and only official same-host pages", () => {
  assert.equal(customsImportLinks(fixture("customs-preliminary")).length, 7);
  assert.ok(nbsEnergyLinks(fixture("nbs-index")).some(l => l.url === nbsUrl));
  assert.deepEqual(nbsEnergyLinks('<a href="https://evil.example/a.html">Energy Production in August 2026</a>'), []);
});
test("format drift, missing units, missing publication and future releases fail closed", () => {
  assert.throws(() => parseCustomsImports(fixture("customs-preliminary-august").replaceAll("10,000 Tons", "Barrels"), customsUrl, now));
  assert.throws(() => parseNbsEnergy("<title>Energy Production in August 2026</title><p>Nothing available</p>", nbsUrl, now));
  assert.throws(() => parseNbsEnergy(fixture("nbs-august"), nbsUrl, "2026-08-01T00:00:00Z"));
});
test("China monthly freshness and summaries respect period mismatch and missing growth", () => {
  assert.equal(metricFreshness(nbs[0], Date.parse(now)), "current");
  assert.equal(metricFreshness(nbs[0], Date.parse("2026-10-20")), "current");
  assert.equal(metricFreshness(nbs[0], Date.parse("2026-12-01")), "stale");
  assert.match(chinaSummary(latest(), Date.parse(now)), /incomplete/);
  const mismatched = latest().map(r => r.metric === "crude_imports" ? { ...r, periodDate: "2026-09-01" } : r);
  assert.match(chinaSummary(mismatched, Date.parse(now)), /different reporting periods/);
  assert.match(chinaSummary(latest(), Date.parse("2026-12-01")), /Historical/);
  assert.match(chinaMapText(latest(), false, Date.parse(now)), /37.93 MT/);
  assert.equal(chinaMapText(latest(), true, Date.parse(now)), "IMPORTS 37.93 MT · AUG 26");
});
test("public China provenance is allowlisted and combined-period history survives storage reads", async () => {
  const db = { query: async () => ({ rows: [{ corridor: "china", metric: "crude_imports", period_date: "2026-02-01", value: "96.934", unit: "Mt", source_id: "gacc-china", observed_at: now, updated_at: now, meta: { periodStart: "2026-01-01", sourceUrl: customsUrl, privateDebug: "must not reach client" } }] }) };
  const [row] = await getLatestCorridorMetrics(db);
  assert.equal(row.meta?.privateDebug, undefined);
  assert.equal(row.meta?.sourceUrl, customsUrl);
  const [point] = await getCorridorMetricSeries(db, "china", "crude_imports", "2026-01-01", "2026-02-28");
  assert.equal(point.periodStart, "2026-01-01");
});
test("a Customs failure is isolated from NBS ingestion", async () => {
  const db = { query: async () => ({ rows: [], rowCount: 1 }) };
  const report = await runCorridorCycle(db, { sources: [new NbsChinaSource(async url => url === nbsUrl ? fixture("nbs-august") : fixture("nbs-index")), new CustomsChinaSource(async () => { throw new Error("Customs unavailable"); })] });
  assert.equal(report.polled.find(r => r.sourceId === "nbs-china")?.ok, true);
  assert.equal(report.polled.find(r => r.sourceId === "gacc-china")?.ok, false);
});
