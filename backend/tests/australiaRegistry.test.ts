import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUSTRALIA_INDICATORS, AUSTRALIA_REGISTRY, absSpec, indicatorsInSection, isAustraliaIndicator, primaryByPillar } from "../src/australia/registry";
import { estimateFreshness, historicalContext } from "../src/australia/watch";
import { parseAbsCsv } from "../src/sources/abs";
import { fetchAustraliaReleaseSchedules } from "../src/sources/absReleases";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("Australia Watch registry", () => {
  test("monthly CPI is primary and quarterly CPI sits in the comparison section", () => {
    assert.deepEqual(indicatorsInSection("primary").slice(0, 4), ["monthly_headline_cpi_yoy", "monthly_trimmed_mean_cpi_yoy", "unemployment_rate", "hours_worked"]);
    assert.ok(indicatorsInSection("primary").indexOf("monthly_headline_cpi_yoy") < indicatorsInSection("primary").indexOf("ppi_final_demand_yoy"));
    assert.deepEqual(indicatorsInSection("comparison"), ["trimmed_mean_cpi_yoy", "headline_cpi_yoy"]);
    assert.equal(AUSTRALIA_INDICATORS.length, Object.keys(AUSTRALIA_REGISTRY).length);
  });
  test("monthly CPI keys match the confirmed ABS CPI 2.0.0 structure (MEASURE.INDEX.TSEST.REGION.FREQ)", () => {
    // Confirmed against data.api.abs.gov.au on 17 Nov 2026: 3 = annual % change, 10001 = All groups,
    // 999902 = Trimmed mean, 10 = Original, 20 = Seasonally adjusted, 50 = Australia.
    assert.equal(AUSTRALIA_REGISTRY.monthly_headline_cpi_yoy.dataflow, "ABS,CPI,2.0.0");
    assert.equal(AUSTRALIA_REGISTRY.monthly_headline_cpi_yoy.key, "3.10001.10.50.M");
    assert.equal(AUSTRALIA_REGISTRY.monthly_trimmed_mean_cpi_yoy.key, "3.999902.20.50.M");
  });
  test("every ABS key's frequency suffix matches the declared frequency", () => {
    for (const id of AUSTRALIA_INDICATORS.filter((i) => AUSTRALIA_REGISTRY[i].source === "abs_sdmx")) {
      const def = absSpec(id);
      assert.equal(def.key.at(-1), def.frequency === "monthly" ? "M" : "Q", id);
    }
  });
  test("primary series group into pillars in a fixed order; comparison series are excluded", () => {
    const groups = primaryByPillar();
    assert.deepEqual(groups.map((g) => g.pillar), ["stress", "inflation", "labour", "financial", "housing", "demand", "external", "composite"]);
    assert.equal(groups.flatMap((g) => g.indicators).length, indicatorsInSection("primary").length);
    assert.ok(!groups.flatMap((g) => g.indicators).includes("headline_cpi_yoy"));
  });
  test("registry orders are unique so page order is deterministic", () => {
    const orders = AUSTRALIA_INDICATORS.map((i) => AUSTRALIA_REGISTRY[i].order);
    assert.equal(new Set(orders).size, orders.length);
  });
  test("unknown ids are rejected", () => {
    assert.equal(isAustraliaIndicator("monthly_headline_cpi_yoy"), true);
    assert.equal(isAustraliaIndicator("toString"), false);
    assert.equal(isAustraliaIndicator(""), false);
  });
});

describe("Monthly CPI", () => {
  test("parses monthly annual change with monthly periods", async () => {
    const rows = parseAbsCsv("monthly_headline_cpi_yoy", await fixture("abs-cpi-monthly.csv"), "https://source", "2026-11-17T00:00:00.000Z");
    assert.deepEqual(rows.map((r) => [r.referencePeriod, r.value]), [["2026-07", 3.5], ["2026-08", 4], ["2026-09", 4.3]]);
    assert.equal(rows[0].frequency, "monthly");
    assert.equal(rows[0].adjustment, "Original");
  });
  test("rejects quarterly periods for a monthly series", async () => {
    const quarterly = await fixture("abs-cpi.csv");
    assert.throws(() => parseAbsCsv("monthly_trimmed_mean_cpi_yoy", quarterly, "https://source", "2026-11-17T00:00:00.000Z"), /Invalid ABS reference period/);
  });
  test("withholds a norm until 36 prior months exist", () => {
    const rows = Array.from({ length: 19 }, (_, i) => ({ indicator: "monthly_headline_cpi_yoy" as const, frequency: "monthly" as const,
      referencePeriod: new Date(Date.UTC(2025, 3 + i, 1)).toISOString().slice(0, 7), value: 2 + i / 10 }));
    const context = historicalContext(rows)!;
    assert.equal(context.baseline.length, 18);
    assert.equal(context.minimum, 36);
    assert.equal(context.mean, null);
    assert.equal(context.z, null);
    assert.equal(context.direction, "Rising");
  });
  test("estimated freshness uses the CPI lag, not the Labour Force lag", () => {
    // September CPI is due in late October: on 25 Oct it is not yet expected with a 29-day lag.
    assert.equal(estimateFreshness("monthly", "2026-08", new Date("2026-10-25T00:00:00Z"), null, 29), "fresh");
    assert.equal(estimateFreshness("monthly", "2026-08", new Date("2026-10-25T00:00:00Z")), "aging");
    assert.equal(estimateFreshness("monthly", "2026-08", new Date("2026-10-29T00:00:00Z"), null, 29), "aging");
  });
  test("lags longer than a month (RBA D1, ~33 days) look back the right number of months", () => {
    // 18 Nov: September D1 (due ~2 Nov) is expected; October (due ~3 Dec) is not.
    assert.equal(estimateFreshness("monthly", "2026-09", new Date("2026-11-18T00:00:00Z"), null, 33), "fresh");
    assert.equal(estimateFreshness("monthly", "2026-08", new Date("2026-11-18T00:00:00Z"), null, 33), "aging");
    // 1 Nov: September is not yet due, so August is still current.
    assert.equal(estimateFreshness("monthly", "2026-08", new Date("2026-11-01T00:00:00Z"), null, 33), "fresh");
  });
  test("monthly and quarterly CPI share one CPI page request but use their own frequency", async () => {
    const cpi = await fixture("abs-release-cpi.html"), labour = await fixture("abs-release-labour.html");
    const urls: string[] = [];
    const schedules = await fetchAustraliaReleaseSchedules({ now: new Date("2026-11-02T00:00:00Z"), fetchImpl: (async (url: string) => {
      urls.push(url); return new Response(url.includes("consumer-price") ? cpi : labour);
    }) as typeof fetch });
    assert.equal(urls.filter((u) => u.includes("consumer-price")).length, 1);
    assert.equal(new Set(urls).size, urls.length);
    assert.equal(schedules.monthly_headline_cpi_yoy, schedules.monthly_trimmed_mean_cpi_yoy);
    assert.equal(schedules.monthly_headline_cpi_yoy.latestReferencePeriod, "2026-09");
    assert.deepEqual(schedules.monthly_headline_cpi_yoy.next, { referencePeriod: "2026-10", releaseAt: "2026-11-25T00:30:00.000Z" });
    assert.equal(schedules.headline_cpi_yoy.latestReferencePeriod, "2026-Q3");
  });
});

describe("stress watch", () => {
  test("GDP per capita: ANA_AGG chain volume, seasonally adjusted, Australia, quarterly; charted as annual growth", () => {
    const def = AUSTRALIA_REGISTRY.gdp_per_capita;
    assert.equal(def.dataflow, "ABS,ANA_AGG,1.0.0");
    assert.deepEqual(def.key.split("."), ["M1", "GPM_PCA", "20", "AUS", "Q"]);
    assert.equal(def.transform, "yoy_from_level");
    assert.equal(primaryByPillar()[0].pillar, "stress");
    assert.ok(primaryByPillar()[0].indicators.includes("gdp_per_capita"));
  });
});
