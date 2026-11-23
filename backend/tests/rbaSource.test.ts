import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseRbaCsv, parseRbaDate, rbaObservations, createRbaTableLoader, fetchRbaSeries, type RbaTable } from "../src/sources/rba";
import { AUSTRALIA_INDICATORS, AUSTRALIA_REGISTRY, rbaSpec, rbaTables } from "../src/australia/registry";
import { historicalContext } from "../src/australia/watch";
import { runAustraliaWatchCycle } from "../src/ingest/australiaWatchCycle";

const TABLES = ["f1.1", "f2.1", "f3", "f11.1", "i2", "d1"];
const fixture = (t: string) => readFile(new URL(`./fixtures/rba/${t}-data.csv`, import.meta.url), "utf8");
async function loadAll(): Promise<Map<string, RbaTable>> {
  return new Map(await Promise.all(TABLES.map(async (t) => [t, parseRbaCsv(t, await fixture(t))] as [string, RbaTable])));
}
const NOW = "2026-11-18T00:00:00.000Z";
const series = async (id: Parameters<typeof rbaObservations>[0]) => rbaObservations(id, await loadAll(), NOW);
const last = <T>(xs: T[]) => xs[xs.length - 1];

describe("RBA CSV parsing", () => {
  test("reads all three RBA date styles and rejects impossible dates", () => {
    assert.equal(parseRbaDate("31/10/2026"), "2026-10-31");
    assert.equal(parseRbaDate("31-Oct-2026"), "2026-10-31");
    assert.equal(parseRbaDate("13-Nov-26"), "2026-11-13");
    assert.equal(parseRbaDate("31/02/2026"), null);
    assert.equal(parseRbaDate("Series ID"), null);
  });
  test("handles quoted fields with commas in the header", async () => {
    const t = parseRbaCsv("i2", await fixture("i2"));
    assert.equal(t.columns.get("GRCPAIAD")?.units, "Index, 2024/25=100");
    assert.equal(t.columns.get("GRCPAISDR")?.index, 2);
  });
  test("fails loudly on an unrecognised date row instead of skipping it", () => {
    assert.throws(() => parseRbaCsv("x", "Title,A\nSeries ID,ABC\n2026-10-31,1.0\n"), /unrecognised date/);
  });
  test("fails when the Series ID row is missing", () => {
    assert.throws(() => parseRbaCsv("x", "Title,A\n31/10/2026,1.0\n"), /Series ID row missing/);
  });
});

describe("RBA indicators", () => {
  test("every RBA registry entry resolves against the fixture tables", async () => {
    const tables = await loadAll();
    const rba = AUSTRALIA_INDICATORS.filter((i) => AUSTRALIA_REGISTRY[i].source === "rba_csv");
    assert.equal(rba.length, 9);
    for (const id of rba) {
      for (const t of rbaTables(rbaSpec(id).rba)) assert.ok(tables.has(t), `${id} needs ${t}`);
      assert.ok(rbaObservations(id, tables, NOW).length > 0, id);
    }
  });
  test("cash rate target: latest month, publication date on the latest row only", async () => {
    const rows = await series("cash_rate_target");
    assert.deepEqual([last(rows).referencePeriod, last(rows).value], ["2026-10", 4.6]);
    assert.equal(last(rows).publicationDate, "2026-11-02");
    assert.equal(rows[0].publicationDate, null);
    assert.equal(last(rows).frequency, "monthly");
  });
  test("3y less cash and the 10y–3y curve are month-matched differences", async () => {
    const exp = await series("policy_expectations_3y_cash");
    assert.equal(last(exp).referencePeriod, "2026-10");
    assert.equal(last(exp).value, 0.279);
    assert.equal(exp.find((r) => r.referencePeriod === "2026-09")?.value, 0.55);
    const curve = await series("yield_curve_10y_3y");
    assert.equal(last(curve).value, 0.386);
    assert.match(last(curve).sourceComment ?? "", /A3RO calculation/);
  });
  test("a spread stops at the month where either leg is missing and takes the later publication date", async () => {
    const rows = await series("corporate_spread_bbb_3y");
    // F3 is published later than F2.1, so October has a government yield but no BBB yield yet.
    assert.equal(last(rows).referencePeriod, "2026-09");
    assert.equal(last(rows).value, 1);
    assert.equal(last(rows).publicationDate, "2026-11-13");
    assert.match(last(rows).sourceUrl, /f3-data\.csv .*f2\.1-data\.csv/);
  });
  test("TWI: calendar-month average of daily values; the month in progress is dropped", async () => {
    const rows = await series("aud_twi");
    assert.deepEqual(rows.map((r) => r.referencePeriod), ["2026-09", "2026-10"]);
    assert.equal(rows[0].value, 64.75);
    assert.ok(Math.abs(rows[1].value - (64.6 + 64.4 + 65.2) / 3) < 1e-9);
  });
  test("commodity prices skip RBA's empty future rows and chart as annual growth", async () => {
    const rows = await series("commodity_prices_aud");
    assert.equal(last(rows).referencePeriod, "2026-10");
    assert.equal(last(rows).value, 106.6);
    const ctx = historicalContext(rows)!;
    assert.equal(ctx.unit, "% YoY");
    const oct = ctx.points.find((p) => p.period === "2026-10")!;
    assert.ok(Math.abs(oct.value - (106.6 / 101.9 - 1) * 100) < 1e-9);
  });
  test("credit growth reads 12-month growth; an all-blank column is an error, never zeros", async () => {
    const rows = await series("housing_credit_growth");
    assert.deepEqual([last(rows).referencePeriod, last(rows).value], ["2026-09", 7]);
    const tables = await loadAll();
    const blank = new Map(tables); // DGFACB12 is blank in the RBA table; swap it in to prove it fails loudly
    const d1 = tables.get("d1")!;
    blank.set("d1", { ...d1, columns: new Map([...d1.columns].map(([k, v]) => [k === "DGFACBNF12" ? "unused" : k === "DGFACB12" ? "DGFACBNF12" : k, v])) });
    assert.throws(() => rbaObservations("business_credit_growth", blank, NOW), /no observations/);
  });
  test("a missing series ID names the table and series", async () => {
    const tables = await loadAll();
    const f21 = tables.get("f2.1")!;
    tables.set("f2.1", { ...f21, columns: new Map([...f21.columns].filter(([k]) => k !== "FCMYGBAG10")) });
    assert.throws(() => rbaObservations("yield_curve_10y_3y", tables, NOW), /f2\.1: series FCMYGBAG10 missing/);
  });
});

describe("RBA loading", () => {
  test("each table is fetched once per cycle even when several indicators share it", async () => {
    const urls: string[] = [];
    const load = createRbaTableLoader({ fetchImpl: (async (url: string) => {
      urls.push(url); const t = /csv\/(.+)-data\.csv$/.exec(url)![1]; return new Response(await fixture(t));
    }) as typeof fetch });
    await fetchRbaSeries("gov_bond_10y", load);
    await fetchRbaSeries("yield_curve_10y_3y", load);
    await fetchRbaSeries("policy_expectations_3y_cash", load);
    assert.deepEqual(urls.sort(), ["https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv", "https://www.rba.gov.au/statistics/tables/csv/f2.1-data.csv"]);
  });
  test("an RBA outage degrades only RBA indicators; ABS series still write", async () => {
    const writes: string[] = []; const runs: [string, string][] = [];
    const db = { query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("australia_watch_fetch_runs")) runs.push([String(params[0]), String(params[2])]);
      else if (sql.includes("insert into australia_watch_observations")) writes.push(...[params[0]].flat().map(String));
      return { rows: [] };
    } };
    const abs = await readFile(new URL("./fixtures/abs-labour.csv", import.meta.url), "utf8");
    const report = await runAustraliaWatchCycle(db as never, { now: () => new Date(NOW), oecdSpacingMs: 0, oecdRetryDelaysMs: [0, 0], fetchImpl: (async (url: string) =>
      url.includes("rba.gov.au") ? new Response("down", { status: 503 }) : new Response(url.includes("ABS,LF,") ? abs : "NoRecordsFound")) as typeof fetch });
    assert.equal(report.results.unemployment_rate.error, undefined);
    assert.ok(writes.includes("unemployment_rate"));
    assert.match(report.results.cash_rate_target.error ?? "", /RBA f1\.1 HTTP 503/);
    assert.ok(runs.some(([id, h]) => id === "yield_curve_10y_3y" && h === "degraded"));
  });
});
