import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import * as capitalCore from "../lib/costOfCapital.ts";
import {
  CAPITAL_MARKETS, CAPITAL_METHODOLOGY, monthEnd, equitySourceUrl,
  calculateCapitalObservation, validateEquity, validateCapitalDataset,
  parseCapitalCsv, parseMonthlyBond, parseDailyBond, parseChinaBond,
  latestCapitalObservations, commonCapitalObservations, mergeCapitalObservation, validateHolidayOverride,
} from "../lib/costOfCapital.ts";
import { australiaCapitalCheckDate, capitalCheckDate, capitalRefreshPlan } from "../lib/capitalSchedule.ts";
import { refreshCapital, fetchBond, US_MONTHLY_URL } from "../scripts/refresh-cost-of-capital.mjs";

const now = new Date("2026-11-15T10:00:00Z");
const asOf = "2026-09-30";
const checkedAt = "2026-11-02T00:00:00Z";
const empty = () => ({ version: 2, methodology: CAPITAL_METHODOLOGY, observations: [] });
const equity = (marketId = "AU") => ({ marketId, asOf, priceEarnings: 20, checkedAt, sourceUrl: equitySourceUrl(marketId) });
const bond = { asOf, bondYield: 4, observations: [], sourceUrl: "https://www.rba.gov.au/statistics/tables/csv/f2.1-data.csv", checkedAt };
const fixture = async (name) => readFile(new URL(`fixtures/capital/${name}`, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
async function loadTs(path, mocks) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => mocks[name] ?? require(name), module, module.exports);
  return module.exports;
}

test("all seven estimates use trailing earnings yield plus the matching monthly bond yield", () => {
  for (const market of CAPITAL_MARKETS) {
    const row = calculateCapitalObservation(equity(market.id), bond, now);
    assert.equal(row.earningsYield, 5); assert.equal(row.current, 9);
    assert.equal(row.bondBasis, "monthly-average");
    assert.equal("longRunMean" in row, false);
  }
  assert.equal(calculateCapitalObservation(equity(), { ...bond, bondYield: -0.5 }, now).current, 4.5);
});

test("mismatched months, fabricated dates, wrong index and invalid P/E never produce estimates", () => {
  assert.throws(() => calculateCapitalObservation(equity(), { ...bond, asOf: "2026-10-31" }, now), /same completed month/);
  for (const priceEarnings of [0, -1, NaN, Infinity]) assert.throws(() => validateEquity({ ...equity(), priceEarnings }, now), /P\/E/);
  for (const date of ["2026-02-30", "2026-09-29", "2026-11-30"]) assert.throws(() => validateEquity({ ...equity(), asOf: date }, now), /completed month/);
  assert.throws(() => validateEquity({ ...equity(), sourceUrl: equitySourceUrl("US") }, now), /official MSCI/);
  assert.throws(() => validateEquity({ ...equity(), checkedAt: "2026-12-01T00:00:00Z" }, now), /source-check/);
  assert.equal(monthEnd("2028-02"), "2028-02-29");
});

test("the common-month view waits for every market, retaining independently released months", () => {
  let data = empty();
  for (const market of CAPITAL_MARKETS) data = mergeCapitalObservation(data, calculateCapitalObservation(equity(market.id), bond, now));
  const october = calculateCapitalObservation({ ...equity("US"), asOf: "2026-10-31" }, { ...bond, asOf: "2026-10-31" }, now);
  data = mergeCapitalObservation(data, october);
  assert.equal(data.observations.length, 8);
  assert.equal(latestCapitalObservations(data)[0].asOf, "2026-10-31");
  assert.deepEqual(new Set(commonCapitalObservations(data).map((row) => row.asOf)), new Set([asOf]));
  assert.equal(commonCapitalObservations({ ...data, observations: data.observations.filter((row) => row.marketId !== "JP") }).length, 0);
  assert.throws(() => mergeCapitalObservation(data, calculateCapitalObservation(equity("US"), bond, now)), /backward/);
});

test("Australia checks one day after the qualifying RBA Friday, including holiday and year boundaries", () => {
  assert.equal(australiaCapitalCheckDate("2026-10"), "2026-11-07");
  assert.equal(australiaCapitalCheckDate("2026-09"), "2026-10-03");
  assert.equal(australiaCapitalCheckDate("2025-12"), "2026-01-10"); // New Year's Day means Friday 2nd is too early
  assert.equal(australiaCapitalCheckDate("2026-03"), "2026-04-11"); // Good Friday
  assert.equal(australiaCapitalCheckDate("2026-04"), "2026-05-09"); // Friday 1st is too early
  assert.equal(capitalCheckDate("US", "2026-10"), "2026-11-03");
  assert.equal(capitalCheckDate("GB", "2026-10"), "2026-11-04");
});

test("release gating uses each source country's date and stops polling a completed month", () => {
  const markets = [{ id: "AU", timeZone: "Australia/Sydney" }];
  assert.equal(capitalRefreshPlan(markets, [], new Date("2026-11-06T12:59:00Z"))[0].due, false);
  assert.equal(capitalRefreshPlan(markets, [], new Date("2026-11-06T13:00:00Z"))[0].due, true);
  assert.equal(capitalRefreshPlan(markets, [{ marketId: "AU", asOf: "2026-10-31" }], now)[0].due, false);
});

test("parsers read verified official-source formats and calculate full-month averages", async () => {
  assert.equal(parseMonthlyBond(await fixture("rba.csv"), asOf, "Series ID", "FCMYGBAG10").bondYield, 5.283);
  assert.equal(parseMonthlyBond(await fixture("boe.csv"), asOf, "DATE", "IUMAMNPY").bondYield, 5.2421);
  assert.equal(parseMonthlyBond(await fixture("fed.csv"), asOf, "Time Period", "RIFLGFCY10_N.M").bondYield, 4.99);
  assert.equal(parseDailyBond(await fixture("snb.csv"), asOf, "CH").observations.length, 22);
  assert.ok(Math.abs(parseDailyBond(await fixture("mof.csv"), asOf, "JP").bondYield - 2.992158) < 0.00001);
  const cn = parseChinaBond(await fixture("chinabond.json"), asOf);
  assert.equal(cn.observations[0].date, "2026-09-01"); // China midnight is the preceding UTC date
  assert.equal(cn.observations.at(-1).date, asOf);
  assert.equal(cn.observations.length, 22);
  assert.ok(parseDailyBond(await fixture("ecb.csv"), asOf, "EA").bondYield > 3);
});

test("missing final daily observations, duplicates and wrong instruments cannot publish partial months", async () => {
  const snb = await fixture("snb.csv");
  assert.throws(() => parseDailyBond(snb.replace(/^"2026-09-30".*\r?\n?/m, ""), asOf, "CH"), /Incomplete/);
  assert.throws(() => parseDailyBond(snb + '"2026-09-30";"CHF";"10J";"0.586"\n', asOf, "CH"), /Duplicate/);
  const ecb = await fixture("ecb.csv");
  assert.throws(() => parseDailyBond(ecb.replaceAll("G_N_C", "G_N_A"), asOf, "EA"), /Unexpected ECB/);
  const cn = JSON.parse(await fixture("chinabond.json")); cn[0].dcq = 5;
  assert.throws(() => parseChinaBond(JSON.stringify(cn), asOf), /10-year/);
  assert.deepEqual(parseCapitalCsv('a,"b,c","d""e"\n1,"two\nlines",3'), [["a", "b,c", 'd"e'], ["1", "two\nlines", "3"]]);
});

test("US fallback preserves the same monthly instrument, and records the source actually used", async () => {
  const result = await fetchBond("US", asOf, async (url) => {
    if (url === US_MONTHLY_URL) return fixture("fed.csv");
    throw new Error("FRED unavailable");
  }, now);
  assert.equal(result.bondYield, 4.99); assert.equal(result.sourceUrl, US_MONTHLY_URL);
});

test("a month-end holiday needs an explicitly verified official calendar and is retained in provenance", async () => {
  const override = { marketId: "CH", asOf, lastTradingDay: "2026-09-29", checkedAt, sourceUrl: "https://data.snb.ch/en/calendar" };
  validateHolidayOverride(override, "CH", asOf, now);
  assert.throws(() => validateHolidayOverride({ ...override, sourceUrl: "https://example.com" }, "CH", asOf, now), /official/);
  assert.throws(() => validateHolidayOverride(override, "JP", asOf, now), /official/);
  const syntheticHolidayCsv = (await fixture("snb.csv")).replace(/^"2026-09-30".*\r?\n?/m, "");
  // Fixture simulates a verified holiday; it does not assert that 30 September was actually a holiday.
  const result = await fetchBond("CH", asOf, async () => syntheticHolidayCsv, now, override);
  assert.equal(result.observations.at(-1).date, "2026-09-29");
  assert.deepEqual(result.holidayCalendar, override);
});

test("late equity releases cause no bond request and no relabelling; a failed country preserves healthy updates", async () => {
  const data = empty(); let requests = 0;
  const waiting = await refreshCapital(data, [equity()], { marketIds: ["AU"], now, fetchSource: async () => { requests++; throw new Error("unexpected"); } });
  assert.equal(requests, 0); assert.equal(waiting.report.waiting.length, 1); assert.deepEqual(waiting.dataset, data);
  const result = await refreshCapital(data, [equity("AU"), equity("US")], { marketIds: ["AU", "US"], now, force: true,
    fetchSource: async (url) => { if (url.includes("rba.gov.au")) return fixture("rba.csv"); throw new Error("Unavailable"); } });
  assert.equal(result.report.updated.length, 1); assert.equal(result.report.errors.length, 1);
  assert.equal(result.dataset.observations[0].marketId, "AU");
  assert.equal(data.observations.length, 0);
});

test("the bundled seed contains seven verified, same-month rows and rejects corrupt arithmetic", async () => {
  const dataset = JSON.parse(await readFile(new URL("../public/data/cost-of-capital.json", import.meta.url), "utf8"));
  validateCapitalDataset(dataset);
  assert.equal(commonCapitalObservations(dataset).length, 7);
  const corrupt = structuredClone(dataset); corrupt.observations[0].current += 1;
  assert.throws(() => validateCapitalDataset(corrupt), /Invalid/);
});

test("the database reader rejects invalid arithmetic before exposing observations", async () => {
  const store = await loadTs("app/api/_lib/capitalStore.ts", { "../../../lib/costOfCapital": capitalCore });
  const row = calculateCapitalObservation(equity(), bond, now);
  const good = await store.readCapitalDataset({ query: async () => ({ rows: [{ payload: row }] }) });
  assert.equal(good.observations[0].current, 9);
  await assert.rejects(store.readCapitalDataset({ query: async () => ({ rows: [{ payload: { ...row, current: 90 } }] }) }), /Invalid/);
  await assert.rejects(store.readCapitalDataset({ query: async () => ({ rows: [] }) }), /not been published/);
});

test("the public API returns database data or an explicitly dated fallback without leaking connection errors", async () => {
  const seed = JSON.parse(await readFile(new URL("../public/data/cost-of-capital.json", import.meta.url), "utf8"));
  let fail = false;
  const route = await loadTs("app/api/capital/latest/route.ts", {
    "@a3ro/oil-backend": { createDb: async () => { if (fail) throw new Error("postgres://private-user:secret@internal-db"); return {}; } },
    "../../_lib/capitalStore": { readCapitalDataset: async () => seed },
    "../../../../public/data/cost-of-capital.json": seed,
  });
  const success = await route.GET();
  assert.equal(success.status, 200); assert.equal((await success.json()).storage, "database");
  fail = true;
  const fallback = await route.GET(), body = await fallback.json();
  assert.equal(body.storage, "bundled-fallback");
  assert.deepEqual(body.observations, seed.observations);
  assert.doesNotMatch(JSON.stringify(body), /private-user|secret|internal-db/);
});
