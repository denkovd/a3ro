import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { comparableChange, estimateFreshness, isRevision, historicalContext } from "../src/australia/watch";
import { parseAbsCsv } from "../src/sources/abs";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const retrievedAt = "2026-09-30T00:00:00.000Z";

describe("Historical context", () => {
  test("uses only preceding observations for the norm, with sample standard deviation", () => {
    const rows=Array.from({length:25},(_,i)=>({indicator:"trimmed_mean_cpi_yoy" as const,frequency:"quarterly" as const,referencePeriod:`${2020+Math.floor(i/4)}-Q${i%4+1}`,value:i===24?8:2+i%2}));
    const context=historicalContext(rows)!;
    assert.equal(context.baseline.length,24);
    assert.equal(context.mean,2.5);
    assert.ok(context.z!==null && context.z>10);
    assert.equal(context.direction,"Rising");
  });
  test("does not invent a norm from a short history", () => {
    assert.equal(historicalContext([{indicator:"unemployment_rate",frequency:"monthly",referencePeriod:"2026-01",value:4}])!.z,null);
  });
  test("hours are compared to the exact year-earlier month and missing months stay missing", () => {
    const context=historicalContext([
      {indicator:"hours_worked",frequency:"monthly",referencePeriod:"2025-01",value:1000},
      {indicator:"hours_worked",frequency:"monthly",referencePeriod:"2026-01",value:1100},
      {indicator:"hours_worked",frequency:"monthly",referencePeriod:"2026-02",value:1200},
    ])!;
    assert.equal(context.points.length,1);
    assert.ok(Math.abs(context.points[0].value-10)<1e-9);
    assert.equal(context.direction,"Unavailable");
  });
  test("estimated freshness changes at the monthly and quarterly lag boundaries", () => {
    assert.equal(estimateFreshness("monthly","2026-08",new Date("2026-10-20")),"fresh");
    assert.equal(estimateFreshness("monthly","2026-08",new Date("2026-10-21")),"aging");
    assert.equal(estimateFreshness("quarterly","2026-Q2",new Date("2026-11-13")),"fresh");
    assert.equal(estimateFreshness("quarterly","2026-Q2",new Date("2026-11-14")),"aging");
  });
});

describe("ABS Australia Watch parser", () => {
  test("parses quarterly year-on-year CPI with source precision and no invented publication date", async () => {
    const rows = parseAbsCsv("trimmed_mean_cpi_yoy", await fixture("abs-cpi.csv"), "https://source", retrievedAt);
    assert.deepEqual(rows.map((r) => [r.referencePeriod, r.value]), [["2026-Q1", 3.5], ["2026-Q2", 3.6]]);
    assert.equal(rows[0].publicationDate, null);
    assert.equal(rows[0].frequency, "quarterly");
  });
  test("parses monthly unemployment and preserves its unrounded source value", async () => {
    const rows = parseAbsCsv("unemployment_rate", await fixture("abs-labour.csv"), "https://source", retrievedAt);
    assert.equal(rows[1].value, 4.64629609);
    assert.equal(rows[1].unitMultiplier, 0);
  });
  test("parses hours worked as source thousands, not millions", async () => {
    const rows = parseAbsCsv("hours_worked", await fixture("abs-hours.csv"), "https://source", retrievedAt);
    assert.equal(rows[1].value, 2009106.80803);
    assert.equal(rows[1].unitMultiplier, 3);
  });
});

describe("Australia Watch honesty rules", () => {
  test("uses the prior comparable period and does not substitute missing data", async () => {
    const rows = parseAbsCsv("unemployment_rate", await fixture("abs-labour.csv"), "https://source", retrievedAt);
    const change = comparableChange(rows)!;
    // 4.64629609 - 4.48447608 = 0.16182001. 1e-9 accepts the IEEE-754
    // subtraction and still rejects an error of 0.000001.
    assert.ok(change.delta !== null && Math.abs(change.delta - 0.16182001) < 1e-9);
    assert.equal(comparableChange([rows[1]])!.delta, null);
  });
  test("estimated expected-data freshness is frequency-specific", () => {
    assert.equal(estimateFreshness("monthly", "2026-08", new Date("2026-09-30T00:00:00Z")), "fresh");
    assert.equal(estimateFreshness("monthly", "2026-07", new Date("2026-09-30T00:00:00Z")), "aging");
    assert.equal(estimateFreshness("quarterly", "2026-Q2", new Date("2026-09-30T00:00:00Z")), "fresh");
    assert.equal(estimateFreshness("quarterly", "2025-Q4", new Date("2026-09-30T00:00:00Z")), "stale");
    assert.equal(estimateFreshness("monthly", null, new Date()), "unavailable");
  });
  test("detects a revision to a non-latest reference period", async () => {
    const rows = parseAbsCsv("unemployment_rate", await fixture("abs-labour.csv"), "https://source", retrievedAt);
    const revisedEarlier = { ...rows[0], value: 4.5 };
    assert.equal(isRevision(rows[0], revisedEarlier), true);
    assert.equal(isRevision(rows[1], rows[1]), false);
  });
});
