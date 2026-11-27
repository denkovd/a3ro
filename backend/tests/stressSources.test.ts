import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { apraObservations, excelQuarter, findApraWorkbookUrl, parseApraTable } from "../src/sources/apra";
import { recentMonths, sumCsv } from "../src/sources/aemo";

test("APRA: picks the current property exposures workbook, not the historical one", () => {
  const html = `<a href="/system/files/2026-09/Quarterly%20authorised%20deposit-taking%20institution%20performance.xlsx">p</a>
    <a href="/system/files/2026-09/Quarterly%20authorised%20deposit-taking%20institution%20property%20exposures%20statistics%20June%202026.xlsx">x</a>
    <a href="/system/files/2020-03/Quarterly%20authorised%20deposit-taking%20institution%20property%20exposures%20-%20Historical%20data.xlsx">h</a>`;
  assert.match(findApraWorkbookUrl(html)!, /^https:\/\/www\.apra\.gov\.au\/system\/files\/2026-09\/.*June%202026\.xlsx$/);
  assert.equal(excelQuarter(46203), "2026-Q2");
  assert.equal(excelQuarter(43555), "2019-Q1");
});

test("APRA: non-performing and 30-89 day shares from Table 1b", () => {
  const rows = [["Table 1b"], [null], [null, null, "Quarter end"], [null, null, 46112, 46203], [null],
    ["Total credit oustanding", null, 2_500_000, 2_560_000], ["Loans 30-89 days past due", null, 12_500, 13_824], ["Non-performing loans", null, 25_000, 25_856]];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Tab 1b");
  const t = parseApraTable(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
  const npl = apraObservations("housing_npl_share", t, "u", "2026-11-28T00:00:00Z");
  assert.deepEqual(npl.map((o) => [o.referencePeriod, o.value]), [["2026-Q1", 1], ["2026-Q2", 1.01]]);
  assert.equal(apraObservations("housing_arrears_share", t, "u", "x").at(-1)!.value, 0.54);
});

test("AEMO: demand-weighted price and the months to fetch", () => {
  const s = sumCsv("REGION,SETTLEMENTDATE,TOTALDEMAND,RRP,PERIODTYPE\nNSW1,2026/10/01 00:05:00,100,50,TRADE\nNSW1,2026/10/01 00:10:00,300,150,TRADE\n");
  assert.equal(s.pd / s.d, 125);
  assert.deepEqual(recentMonths(new Date("2026-11-28T00:00:00Z"), 3), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(recentMonths(new Date("2026-12-02T00:00:00Z"), 2), ["2026-10", "2026-11"]);
});

import { asicByIndustry, asicObservations, asicTotals, findAsicWorkbookUrl } from "../src/sources/asic";

function asicBook() {
  const t1 = [[null, "Australian insolvency statistics"], [null, "Table 1"], [null, "Month", "FY26", "FY27", "Change"], [null, null, "No.", "No."],
    [null, "Jul", 1362, 1213], [null, "Aug", 1090, 1808], [null, "Nov", 1071, null], [null, "Jan", 634, null]];
  const t12 = [[null, "Table 1.2"], [null, "Period", "Period (calendar year)", "Period (quarter)", "Period (month)", "Accommodation and Food Services", "Construction"],
    [null, "2026-2027", "2026", "September", "Jul", 40, 300], [null, "2026-2027", "2026", "September", "Aug", 45, 320], [null, "2026-2027", "2026", "September Total", null, 85, 620]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t1), "1");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t12), "1.2");
  return XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

test("ASIC: workbook link, totals by financial year, industries by month", () => {
  assert.equal(findAsicWorkbookUrl('<a href="https://download.asic.gov.au/media/x/asic-insolvency-statistics-series-1-and-series-2-published-23-november-2026.xlsx">'), "https://download.asic.gov.au/media/x/asic-insolvency-statistics-series-1-and-series-2-published-23-november-2026.xlsx");
  const wb = asicBook();
  const tot = asicTotals(wb);
  assert.equal(tot.get("2025-07"), 1362); assert.equal(tot.get("2026-08"), 1808); assert.equal(tot.get("2026-01"), 634); assert.equal(tot.has("2026-11"), false);
  const con = asicByIndustry(wb, /^construction$/i);
  assert.deepEqual([...con.entries()], [["2026-07", 300], ["2026-08", 320]]);
  const obs = asicObservations("company_insolvencies", wb, "u", "x", new Date("2026-08-15T00:00:00Z"));
  assert.ok(obs.every((o) => o.referencePeriod < "2026-08"), "current month left out");
});
