import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parsePinkSheet, pinkMonth, summarise } from "../src/commodities/pinkSheet";

function workbook(): Buffer {
  const rows: unknown[][] = [
    ["World Bank Commodity Price Data (The Pink Sheet)"], ["Monthly prices in nominal US dollars"], [],
    [null, "Crude oil, average", "Crude oil, Brent", "Coal, Australian", "Liquefied natural gas, Japan", "Iron ore, cfr spot", "Copper", "Gold"],
    [null, "($/bbl)", "($/bbl)", "($/mt)", "($/mmbtu)", "($/dmtu)", "($/mt)", "($/troy oz)"],
  ];
  const y = new Date().getUTCFullYear();
  for (let yr = y - 7; yr <= y; yr++) for (let m = 1; m <= 12; m++) {
    if (yr === y && m > 10) break;
    rows.push([`${yr}M${String(m).padStart(2, "0")}`, 80, 82, 130, 12, yr === y ? 100 + m : 90, 9000 + m, 2000]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["notes"]]), "AFOSHEET");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Monthly Prices");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("pink sheet: month codes", () => {
  assert.equal(pinkMonth("2026M10"), "2026-10");
  assert.equal(pinkMonth("2026"), null);
});

test("pink sheet: finds the three columns, keeps about six years", () => {
  const { series } = parsePinkSheet(workbook());
  assert.deepEqual(series.map((s) => s.id).sort(), ["copper", "iron_ore", "lng_japan"]);
  const iron = series.find((s) => s.id === "iron_ore")!;
  assert.equal(iron.unit, "$/dmtu");
  assert.ok(iron.points[0].month >= `${new Date().getUTCFullYear() - 6}-01`);
  const sum = summarise(iron.points)!;
  assert.equal(sum.latest.value, 110);
  assert.ok(Math.abs(sum.ytd! - (110 / 90 - 1)) < 1e-9);
  assert.equal(sum.high5y.value, 110);
});
