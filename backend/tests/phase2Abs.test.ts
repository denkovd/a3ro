import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAbsCsv } from "../src/sources/abs";
import { ABS_RELEASE_PAGES, QUARTERLY_PUBLICATIONS, fetchAustraliaReleaseSchedules, parseAbsReleasePage } from "../src/sources/absReleases";
import { AUSTRALIA_INDICATORS, AUSTRALIA_REGISTRY, absSpec, primaryByPillar } from "../src/australia/registry";
import { historicalContext } from "../src/australia/watch";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const AT = "2026-11-18T00:00:00.000Z";

describe("Phase 2 ABS series", () => {
  test("keys confirmed against the ABS Data API on 18 Nov 2026", () => {
    const confirmed: Record<string, [string, string]> = {
      dwelling_approvals: ["ABS,BA_GCCSA,1.0.0", "1.1.9.TOT.100.10.AUS.M"],
      private_house_approvals: ["ABS,BA_GCCSA,1.0.0", "1.1.1.TOT.110.10.AUS.M"],
      housing_lending_commitments: ["ABS,LEND_HOUSING,1.1", "FIN_VAL.NEWCOMMITS.DV8368.TOTDWELL.TOT.TOT.20.AUS.Q"],
      job_vacancies: ["ABS,JV,1.0", "M1.7.TOT.20.AUS.Q"],
      underemployment_rate: ["ABS,LF_UNDER,1.0.1", "M23.3.1599.20.AUS.M"],
      household_spending_yoy: ["ABS,HSI_M,1.6.0", "9.TOT.CUR.20.AUS.M"],
      trade_balance_goods: ["ABS,ITGS,1.2.0", "M1.170.20.AUS.M"],
      ppi_final_demand_yoy: ["ABS,PPI_FD,1.1.0", "3.TOT.TOT.TOTXE.Q"],
      import_prices_yoy: ["ABS,ITPI_IMP,1.0.0", "3.6011001.Q"],
      wage_price_index_yoy: ["ABS,WPI,1.2.0", "3.THRPEB.7.TOT.20.AUS.Q"],
    };
    for (const [id, [dataflow, key]] of Object.entries(confirmed)) {
      const def = absSpec(id as never);
      assert.deepEqual([def.dataflow, def.key], [dataflow, key], id);
    }
  });
  test("every ABS release family has a release page; quarterly publications are quarterly series", () => {
    for (const id of AUSTRALIA_INDICATORS) {
      const def = AUSTRALIA_REGISTRY[id];
      if (def.source !== "abs_sdmx") continue;
      assert.ok(ABS_RELEASE_PAGES[def.releaseFamily as keyof typeof ABS_RELEASE_PAGES], `${id} release page`);
      if (QUARTERLY_PUBLICATIONS.has(def.releaseFamily)) assert.equal(def.frequency, "quarterly", id);
    }
  });
  test("the page has its pillars in a fixed order", () => {
    assert.deepEqual(primaryByPillar().map((g) => g.pillar), ["stress", "inflation", "labour", "financial", "housing", "demand", "external", "composite"]);
  });
  test("PPI has no adjustment-type column: parsed with the registry adjustment; blank early values skipped", async () => {
    const rows = parseAbsCsv("ppi_final_demand_yoy", await fixture("abs-ppi-fd.csv"), "https://source", AT);
    assert.deepEqual(rows.map((r) => [r.referencePeriod, r.value]), [["2026-Q1", 3], ["2026-Q2", 3.6], ["2026-Q3", 3.6]]);
    assert.equal(rows[0].adjustment, "Original");
    assert.equal(rows[0].unitMultiplier, null);
  });
  test("job vacancies: thousands, quarterly, charted as annual growth", async () => {
    const rows = parseAbsCsv("job_vacancies", await fixture("abs-job-vacancies.csv"), "https://source", AT);
    assert.equal(rows.at(-1)?.value, 325);
    assert.equal(rows.at(-1)?.unitMultiplier, 3);
    assert.equal(rows.at(-1)?.adjustment, "Seasonally Adjusted");
    const ctx = historicalContext(rows)!;
    assert.equal(ctx.unit, "% YoY");
    assert.ok(Math.abs(ctx.points.find((p) => p.period === "2026-Q3")!.value - (325 / 340.2 - 1) * 100) < 1e-9);
  });
});

describe("Quarterly ABS publications", () => {
  const now = new Date("2026-11-18T00:00:00Z");
  test("Job Vacancies 'August 2026' is the September quarter; next is the December quarter", async () => {
    const s = parseAbsReleasePage(await fixture("abs-release-job-vacancies.html"), "quarterly", "https://source", now, true);
    assert.equal(s.latestReferencePeriod, "2026-Q3");
    assert.deepEqual(s.latest, { referencePeriod: "2026-Q3", releaseAt: "2026-11-04T00:30:00.000Z" });
    assert.deepEqual(s.next, { referencePeriod: "2026-Q4", releaseAt: "2027-01-13T00:30:00.000Z" });
  });
  test("Lending 'September Quarter 2026' parses to 2026-Q3", async () => {
    const s = parseAbsReleasePage(await fixture("abs-release-lending.html"), "quarterly", "https://source", now, true);
    assert.equal(s.latestReferencePeriod, "2026-Q3");
    assert.equal(s.next?.referencePeriod, "2026-Q4");
  });
  test("a monthly page listing the same month twice uses the earliest future date", async () => {
    const s = parseAbsReleasePage(await fixture("abs-release-approvals.html"), "monthly", "https://source", now);
    assert.deepEqual(s.next, { referencePeriod: "2026-10", releaseAt: "2026-12-01T00:30:00.000Z" });
  });
  test("each ABS release page is requested once; job vacancies uses quarter mapping through the family table", async () => {
    const pages: Record<string, string> = {
      "consumer-price": await fixture("abs-release-cpi.html"), "labour-force": await fixture("abs-release-labour.html"),
      "job-vacancies": await fixture("abs-release-job-vacancies.html"), "lending-indicators": await fixture("abs-release-lending.html"),
    };
    const urls: string[] = [];
    const schedules = await fetchAustraliaReleaseSchedules({ now, fetchImpl: (async (url: string) => {
      urls.push(url);
      const hit = Object.keys(pages).find((k) => url.includes(k));
      return hit ? new Response(pages[hit]) : new Response("down", { status: 503 });
    }) as typeof fetch });
    assert.equal(new Set(urls).size, urls.length);
    assert.equal(urls.length, Object.keys(ABS_RELEASE_PAGES).length);
    assert.equal(schedules.job_vacancies.latestReferencePeriod, "2026-Q3");
    assert.equal(schedules.housing_lending_commitments.next?.referencePeriod, "2026-Q4");
    assert.equal(schedules.underemployment_rate, schedules.unemployment_rate);
    assert.equal(schedules.dwelling_approvals.health, "unavailable"); // its page failed; nothing invented
  });
});
