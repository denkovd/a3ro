import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateAustraliaCapital, parseRbaBondCsv } from "../lib/australiaCapital.ts";

const snapshot = {
  version: 1, asOf: "2026-09-30", checkedAt: "2026-11-01T00:00:00Z",
  priceEarnings: 20, bondAsOf: "2026-09-30", bondYield: 4, sources: [],
};
const history = [
  { asOf: "2000-03-31", priceEarnings: 10, bondYield: 5 },
  { asOf: "2000-06-30", priceEarnings: 20, bondYield: 5 },
];
const csv = [
  "F2.1 GOVERNMENT BONDS", "Series ID,OTHER,FCMYGBAG10",
  "31-Aug-2026,2,3.5", "30-Sep-2026,2,4", "31-Oct-2026,2,4.5",
].join("\n");

test("matches the equity month instead of using a more recent bond observation", () => {
  assert.deepEqual(parseRbaBondCsv(csv, "2026-09-30"), { bondAsOf: "2026-09-30", bondYield: 4 });
  assert.throws(() => parseRbaBondCsv(csv, "2026-07-31"), /matching bond yield/);
  assert.throws(() => parseRbaBondCsv(csv.replace("2026,2,4\n", "2026,2,\n"), "2026-09-30"), /missing/);
  assert.throws(() => parseRbaBondCsv(csv.replace("FCMYGBAG10", "OTHER10"), "2026-09-30"), /missing/);
});

test("averages historical earnings yields, not historical P/E ratios", () => {
  assert.deepEqual(calculateAustraliaCapital(snapshot, history), { current: 9, longRunMean: 12.5, gap: -3.5 });
});

test("rejects invalid or mismatched inputs rather than publishing a plausible number", () => {
  assert.throws(() => calculateAustraliaCapital({ ...snapshot, priceEarnings: 0 }, history), /positive P\/E/);
  assert.throws(() => calculateAustraliaCapital({ ...snapshot, bondAsOf: "2026-08-31" }, history), /same month/);
  assert.throws(() => calculateAustraliaCapital(snapshot, []), /missing/);
  assert.throws(() => calculateAustraliaCapital(snapshot, [{ ...history[0], bondYield: NaN }]), /finite bond yield/);
});

test("the checked-in Australian reference contains every quarter from 1995 Q1 to 2019 Q1", async () => {
  const baseline = JSON.parse(await readFile(new URL("../lib/data/australia-capital-baseline.json", import.meta.url), "utf8"));
  const { observations } = baseline;
  assert.equal(observations.length, 97);
  assert.equal(observations[0].asOf, "1995-03-31");
  assert.equal(observations.at(-1).asOf, "2019-03-31");
  const quarters = observations.map(({ asOf }) => Number(asOf.slice(0, 4)) * 4 + (Number(asOf.slice(5, 7)) / 3) - 1);
  for (let i = 1; i < quarters.length; i++) assert.equal(quarters[i] - quarters[i - 1], 1);
  assert.equal(calculateAustraliaCapital(snapshot, observations).longRunMean.toFixed(2), "10.90");
});
