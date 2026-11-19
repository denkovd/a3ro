import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eiaRetailUrl, droughtUrl, parseDataCentres, parseDroughtState, parseEiaRetail, parseFredPrices, stateFromAddress } from "../src/dividend/constraints/parsers";
import { buildConstraintsSnapshot, buildoutGauge, commodityGauge, financingGauge, powerDemandGauge, powerPriceGauge, rollingYoY, waterGauge } from "../src/dividend/constraints/gauges";
import { fetchSignals } from "../src/dividend/signals/fetch";
import type { DataCentresPayload, EiaPayload } from "../src/dividend/signals/types";
import type { ValueChainSnapshot } from "../src/dividend/valueChain/types";

// Real Epoch data-centre snapshot (April 2026, via a public mirror); other sources are built in their documented formats.
const centresCsv = readFileSync(new URL("./fixtures/dividend/epoch-data-centres-20260420.csv", import.meta.url), "utf8");

function months(from: string, count: number) {
  const out: string[] = [];
  let index = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)) - 1;
  for (let i = 0; i < count; i++, index++) out.push(`${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`);
  return out;
}

/** 36 months; sales grow `growth`% a year from month 13, prices `priceGrowth`%. */
function eiaBody(growth: number, priceGrowth: number) {
  const data: Record<string, unknown>[] = [];
  months("2023-10", 36).forEach((period, i) => {
    const year = i < 12 ? 0 : i < 24 ? 1 : 2;
    for (const [stateid, sectorid, base] of [["US", "ALL", 330000], ["US", "COM", 115000], ["VA", "COM", 7000], ["VA", "ALL", 12000], ["CA", "COM", 9000]] as const) {
      data.push({ period, stateid, sectorid, sales: String(base * (1 + growth / 100) ** year), price: (12 * (1 + priceGrowth / 100) ** year).toFixed(4), "sales-units": "million kilowatt hours" });
    }
  });
  return { response: { total: data.length, data } };
}

describe("Constraint source parsers", () => {
  test("EIA rows keep only tracked states and sectors, with numeric strings parsed", () => {
    const parsed = parseEiaRetail(eiaBody(3, 4));
    assert.ok(parsed.rows.every(row => ["US", "VA"].includes(row.state) && ["ALL", "COM"].includes(row.sector)));
    assert.equal(parsed.rows.length, 36 * 4);
    assert.equal(typeof parsed.rows[0].sales, "number");
    assert.throws(() => parseEiaRetail({ error: "API key invalid" }), /error/);
    assert.throws(() => parseEiaRetail({ response: {} }), /shape/);
  });

  test("the EIA URL asks for both measures, states and sectors", () => {
    const url = decodeURIComponent(eiaRetailUrl("KEY", "2015-01"));
    for (const part of ["electricity/retail-sales/data/", "data[]=sales", "data[]=price", "facets[stateid][]=US", "facets[stateid][]=VA", "facets[sectorid][]=COM", "facets[sectorid][]=ALL", "frequency=monthly", "start=2015-01"]) assert.ok(url.includes(part), part);
  });

  test("FRED CSV parses and HTML error pages are rejected", () => {
    const csv = "observation_date,PURANUSDM\n" + months("2020-01", 30).map((period, i) => `${period}-01,${40 + i}`).join("\n") + "\n2022-07-01,.";
    assert.equal(parseFredPrices(csv, "PURANUSDM").length, 30);
    assert.throws(() => parseFredPrices("<html>not found</html>", "X"), /HTML/);
  });

  test("real Epoch data-centre CSV: power, US states from addresses, owner tags stripped", () => {
    const { sites } = parseDataCentres(centresCsv);
    assert.ok(sites.length >= 15);
    assert.ok(sites.every(site => site.powerMw > 0));
    const carlisle = sites.find(site => site.name === "Anthropic-Amazon New Carlisle")!;
    assert.equal(carlisle.state, "IN");
    assert.equal(carlisle.owner, "Amazon");
    assert.ok(sites.filter(site => site.country === "United States").every(site => site.state === null || /^[A-Z]{2}$/.test(site.state)));
    assert.equal(stateFromAddress("5502 Spinks Rd, Abilene, TX 79601"), "TX");
    assert.equal(stateFromAddress("Somewhere, ZZ 12345"), null);
    assert.equal(stateFromAddress("175 Private Road 1604, Abilene, TX 79601, Shackelford County"), "TX");
    assert.equal(stateFromAddress("Madison Mega Site Nissan Parkway and Highway 22 Canton, Mississippi Madison County"), "MS");
    assert.equal(stateFromAddress("1 Main St, Charleston, West Virginia"), "WV");
    assert.equal(stateFromAddress("2950 S. Litchfield Road"), null);
  });

  test("Drought Monitor: latest week's D2-or-worse share, tolerant of field case and date format", () => {
    const body = [{ MapDate: "20260929", D0: 60, D1: 40, D2: 20, D3: 5, D4: 0 }, { mapDate: "2026-10-06T00:00:00", d0: "70.5", d1: "50.1", d2: "33.3", d3: "10", d4: "1" }];
    assert.deepEqual(parseDroughtState("TX", body), { state: "TX", date: "2026-10-06", severeOrWorse: 33.3 });
    assert.throws(() => parseDroughtState("TX", []), /no rows/);
    assert.match(droughtUrl("48", new Date("2026-09-01T00:00:00Z"), new Date("2026-10-13T00:00:00Z")), /aoi=48&startdate=9%2F1%2F2026&enddate=10%2F13%2F2026&statisticsType=1$/);
  });
});

describe("Constraint gauges", () => {
  test("rolling 12-month change needs 24 consecutive months", () => {
    const points = months("2024-01", 24).map((period, i) => ({ period, value: i < 12 ? 100 : 103 }));
    assert.deepEqual(rollingYoY(points), [{ period: "2025-12", value: 3 }]);
    assert.deepEqual(rollingYoY(points.filter(point => point.period !== "2024-06")), []);
  });

  test("electricity demand and price bands", () => {
    const tight = powerDemandGauge(parseEiaRetail(eiaBody(3, 1)));
    assert.equal(tight.status, "tight");
    assert.equal(tight.value, 3);
    assert.equal(powerDemandGauge(parseEiaRetail(eiaBody(1.5, 1))).status, "watch");
    assert.equal(powerDemandGauge(parseEiaRetail(eiaBody(0.2, 1))).status, "easy");
    assert.equal(powerPriceGauge(parseEiaRetail(eiaBody(1, 6))).status, "tight");
    assert.equal(powerPriceGauge(parseEiaRetail(eiaBody(1, 3))).status, "watch");
    assert.equal(powerDemandGauge(undefined).status, "no_data");
  });

  test("commodity gauge compares the latest price with its 5-year average", () => {
    const flat = months("2020-01", 72).map(period => ({ date: `${period}-01`, value: 50 }));
    assert.equal(commodityGauge("uranium", flat).status, "easy");
    const spike = [...flat.slice(0, -1), { date: flat.at(-1)!.date, value: 90 }];
    const gauge = commodityGauge("uranium", spike);
    assert.equal(gauge.status, "tight");
    assert.ok(Math.abs(gauge.value! - 90 / ((50 * 59 + 90) / 60)) < 0.01);
    assert.equal(commodityGauge("copper", flat.slice(0, 30)).status, "no_data");
  });

  test("water: share of tracked US power in states with widespread severe drought", () => {
    const centres: DataCentresPayload = { sites: [
      { name: "A", country: "United States", state: "TX", powerMw: 600, h100e: null, capexBn: null, owner: "" },
      { name: "B", country: "United States", state: "VA", powerMw: 400, h100e: null, capexBn: null, owner: "" },
      { name: "C", country: "UAE", state: null, powerMw: 900, h100e: null, capexBn: null, owner: "" },
    ] };
    const drought = { states: [{ state: "TX", date: "2026-11-10", severeOrWorse: 40 }, { state: "VA", date: "2026-11-10", severeOrWorse: 5 }] };
    const gauge = waterGauge(centres, drought);
    assert.equal(gauge.value, 60);
    assert.equal(gauge.status, "tight");
    assert.match(gauge.detail, /TX \(40%\)/);
    assert.equal(waterGauge(centres, undefined).status, "no_data");
  });

  test("build-out growth needs two snapshots at least 90 days apart", () => {
    const at = (date: string, mw: number) => ({ retrievedAt: date, payload: { sites: [{ name: "A", country: "United States", state: "TX", powerMw: mw, h100e: null, capexBn: 10, owner: "" }] } });
    assert.equal(buildoutGauge(at("2026-11-18T00:00:00Z", 2000)).status, "no_data");
    assert.equal(buildoutGauge(at("2026-11-18T00:00:00Z", 2000), at("2026-10-18T00:00:00Z", 1000)).status, "no_data");
    const yearly = buildoutGauge(at("2026-11-18T00:00:00Z", 2000), at("2025-11-18T00:00:00Z", 1000));
    assert.equal(yearly.status, "tight");
    assert.equal(yearly.value, 2);
  });

  test("financing: hyperscaler capex as a share of operating cash flow", () => {
    const company = (ticker: string, capex: number, cash: number) => ({ ticker, layer: "hyperscalers", name: ticker, stale: false, periodEnd: "2026-09-30", ttm: { capex: { value: capex }, operatingCashFlow: { value: cash } } });
    const snapshot = { companies: [company("MSFT", 80, 100), company("META", 70, 80)], layers: [{ layer: "hyperscalers", capexGrowth: 0.5, revenueGrowth: 0.15 }] } as unknown as ValueChainSnapshot;
    const gauge = financingGauge(snapshot);
    assert.equal(gauge.value, round(150 / 180));
    assert.equal(gauge.status, "watch");
    assert.match(gauge.detail, /META at 88%/);
    assert.equal(financingGauge(null).status, "no_data");
  });

  test("source status says whether each constraint source was loaded or last checked", () => {
    const centres = { source: "datacentres" as const, retrievedAt: "2026-11-18T00:00:00Z", dataUrl: "", payload: parseDataCentres(centresCsv) };
    const snapshot = buildConstraintsSnapshot({ datacentres: centres }, undefined, null, new Date(), [{ source: "eia", health: "unavailable", checkedAt: "2026-11-18T08:50:00Z" }]);
    assert.deepEqual(snapshot.sources.map(item => [item.source, item.loaded, item.checkedAt]), [["eia", false, "2026-11-18T08:50:00Z"], ["fred", false, null], ["datacentres", true, null], ["drought", false, null]]);
  });

  test("the snapshot always lists every gauge, counting the ones without data", () => {
    const snapshot = buildConstraintsSnapshot({}, undefined, null);
    assert.equal(snapshot.gauges.length, 8);
    assert.equal(snapshot.summary.noData, 8);
    assert.ok(snapshot.gauges.every(gauge => gauge.rule && gauge.whoGains && gauge.source.url.startsWith("https://")));
  });
});

const round = (value: number) => Math.round(value * 100) / 100;

describe("Constraint fetching", () => {
  test("EIA is skipped with a clear error when no key is set; other sources still load", async () => {
    const previous = process.env.EIA_API_KEY;
    delete process.env.EIA_API_KEY;
    try {
      const fetchImpl = (async (url: string) => url.includes("data_centers.csv") ? new Response(centresCsv) : new Response("down", { status: 503 })) as typeof fetch;
      const results = await fetchSignals({ fetchImpl, sources: ["eia", "datacentres"] });
      assert.match(results[0].error!, /EIA_API_KEY/);
      assert.ok(results[1].dataset);
    } finally { if (previous !== undefined) process.env.EIA_API_KEY = previous; }
  });

  test("drought tolerates a few missing states but not a broken service", async () => {
    const ok = (fips: string) => new Response(JSON.stringify([{ mapDate: "2026-11-10", d2: fips === "48" ? 40 : 2 }]));
    const fewFail = (async (url: string) => /aoi=(02|15)&/.test(url) ? new Response("x", { status: 500 }) : ok(url.match(/aoi=(\d+)/)![1])) as typeof fetch;
    const [result] = await fetchSignals({ fetchImpl: fewFail, sources: ["drought"] });
    assert.equal(result.dataset!.payload.states.length, 49);
    const allFail = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const [broken] = await fetchSignals({ fetchImpl: allFail, sources: ["drought"] });
    assert.match(broken.error!, /only 0 states/);
  });
});

// Keep the EIA type in use for readers checking the payload shape.
export type _EiaRows = EiaPayload["rows"];
