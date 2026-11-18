import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseSdmxCsv } from "../src/sources/abs";
import { fetchOecdSeries } from "../src/sources/oecd";
import { fetchAustraliaReleaseSchedules } from "../src/sources/absReleases";
import { AUSTRALIA_INDICATORS, AUSTRALIA_REGISTRY, indicatorsInSection, oecdSpec, primaryByPillar } from "../src/australia/registry";
import { historicalContext } from "../src/australia/watch";
import { runAustraliaWatchCycle } from "../src/ingest/australiaWatchCycle";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-18T00:00:00Z");

describe("OECD composite indicators", () => {
  test("keys confirmed against sdmx.oecd.org on 18 Nov 2026", () => {
    assert.equal(oecdSpec("oecd_cli").key, "AUS.M.LI.IX._Z.AA.IX._Z.H");
    assert.equal(oecdSpec("oecd_consumer_confidence").key, "AUS.M.CCICP.IX._Z.AA.IX._Z.H");
    assert.equal(oecdSpec("oecd_business_confidence").key, "AUS.M.BCICP.IX._Z.AA.IX._Z.H");
    for (const id of ["oecd_cli", "oecd_consumer_confidence", "oecd_business_confidence"] as const) assert.equal(oecdSpec(id).dataflow, "OECD.SDD.STES,DSD_STES@DF_CLI,");
  });
  test("parses OECD SDMX-CSV: lower-case label columns, no TSEST, rows out of order", async () => {
    const rows = parseSdmxCsv("oecd_cli", await fixture("oecd-cli.csv"), "https://source", NOW.toISOString(), "OECD");
    assert.deepEqual(rows.map((r) => r.referencePeriod), ["2026-07", "2026-08", "2026-09", "2026-10"]);
    assert.equal(rows.at(-1)?.value, 99.97236);
    assert.equal(rows[0].unit, "Index");
    assert.equal(rows[0].adjustment, "Amplitude adjusted");
    assert.equal(rows[0].unitMultiplier, 0);
    assert.equal(historicalContext(rows)?.direction, "Broadly steady");
  });
  test("requests the OECD API with the registry key and a rolling start period", async () => {
    const urls: string[] = [];
    const csv = await fixture("oecd-cli.csv");
    const rows = await fetchOecdSeries("oecd_cli", { now: NOW, fetchImpl: (async (url: string) => { urls.push(url); return new Response(csv); }) as typeof fetch });
    assert.equal(urls[0], "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,/AUS.M.LI.IX._Z.AA.IX._Z.H?startPeriod=2015-11&format=csvfilewithlabels");
    assert.equal(rows.length, 4);
  });
  test("an OECD rate limit (429) degrades only OECD cards", async () => {
    const runs: [string, string, string | null][] = [];
    const db = { query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("australia_watch_fetch_runs")) runs.push([String(params[0]), String(params[2]), params[4] as string | null]);
      return { rows: [] };
    } };
    const abs = await readFile(new URL("./fixtures/abs-labour.csv", import.meta.url), "utf8");
    const report = await runAustraliaWatchCycle(db as never, { now: () => NOW, fetchImpl: (async (url: string) =>
      url.includes("oecd.org") ? new Response("Too Many Requests", { status: 429 }) : url.includes("ABS,LF,") ? new Response(abs) : new Response("NoRecordsFound")) as typeof fetch });
    assert.match(report.results.oecd_cli.error ?? "", /OECD HTTP 429/);
    assert.equal(report.results.unemployment_rate.error, undefined);
    assert.ok(runs.some(([id, h]) => id === "oecd_business_confidence" && h === "degraded"));
  });
  test("OECD cards get no invented release date; they link to the OECD CLI page", async () => {
    const schedules = await fetchAustraliaReleaseSchedules({ now: NOW, fetchImpl: (async () => new Response("down", { status: 503 })) as typeof fetch });
    assert.equal(schedules.oecd_cli.next, null);
    assert.equal(schedules.oecd_cli.health, "unavailable");
    assert.match(schedules.oecd_cli.sourceUrl, /oecd\.org/);
  });
  test("composite pillar sits last; landing tiles swap hours worked for the OECD CLI", () => {
    assert.equal(primaryByPillar().at(-1)?.pillar, "composite");
    const tiles = indicatorsInSection("primary").filter((i) => (AUSTRALIA_REGISTRY[i] as { summaryTile?: boolean }).summaryTile);
    assert.deepEqual(tiles, ["monthly_headline_cpi_yoy", "monthly_trimmed_mean_cpi_yoy", "unemployment_rate", "cash_rate_target", "yield_curve_10y_3y", "oecd_cli"]);
    assert.equal(AUSTRALIA_INDICATORS.filter((i) => AUSTRALIA_REGISTRY[i].source === "oecd_sdmx").length, 3);
  });
});
