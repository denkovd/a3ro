import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGoogleTrendsCsv } from "../app/components/projects/narrative/narrativeCsv";

test("parses a single-term Google Trends export", () => {
  const csv = [
    "Category: All categories",
    "",
    "Week,ai: (Worldwide)",
    "2026-06-26,40",
    "2026-07-19,55",
    "2026-07-26,<1",
  ].join("\n");
  const result = parseGoogleTrendsCsv(csv, "ai", "trends.csv");
  assert.equal(result.error, null);
  assert.equal(result.skippedRows, 0);
  assert.deepEqual(result.datapoints, [
    { narrativeId: "ai", date: "2026-06-26", metric: "google_trends", value: 40, source: "trends.csv" },
    { narrativeId: "ai", date: "2026-07-19", metric: "google_trends", value: 55, source: "trends.csv" },
    { narrativeId: "ai", date: "2026-07-26", metric: "google_trends", value: 0, source: "trends.csv" },
  ]);
});

test("averages a multi-term export into one signal per row", () => {
  const csv = ["Week,ai: (Worldwide),gpu: (Worldwide)", "2026-07-26,40,60"].join("\n");
  const result = parseGoogleTrendsCsv(csv, "ai", "trends.csv");
  assert.equal(result.error, null);
  assert.equal(result.datapoints[0].value, 50);
});

test("skips unparseable rows but keeps the rest, honestly reporting the count", () => {
  const csv = ["Week,ai: (Worldwide)", "not-a-date,40", "2026-07-26,60"].join("\n");
  const result = parseGoogleTrendsCsv(csv, "ai", "trends.csv");
  assert.equal(result.skippedRows, 1);
  assert.equal(result.datapoints.length, 1);
});

test("reports an error when no header row is found", () => {
  const result = parseGoogleTrendsCsv("garbage,file,contents", "ai", "trends.csv");
  assert.equal(result.datapoints.length, 0);
  assert.ok(result.error);
});
