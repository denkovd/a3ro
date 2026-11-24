import { test } from "node:test";
import assert from "node:assert/strict";
import { fredBodyToCsv, fredSeriesUrl, parseFredCsv, fetchFredSeries, MACRO_SERIES } from "../src/sources/fredMacro";

test("FRED: API URL when a key is set, CSV link without", () => {
  assert.equal(fredSeriesUrl("CPIAUCSL", "2020-01-01", ""), "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL&cosd=2020-01-01");
  const api = new URL(fredSeriesUrl("CPIAUCSL", "2020-01-01", "k123"));
  assert.equal(api.origin + api.pathname, "https://api.stlouisfed.org/fred/series/observations");
  assert.equal(api.searchParams.get("series_id"), "CPIAUCSL");
  assert.equal(api.searchParams.get("observation_start"), "2020-01-01");
  assert.equal(api.searchParams.get("file_type"), "json");
});

test("FRED: API JSON becomes the same observations as the CSV, missing values skipped", () => {
  const json = JSON.stringify({ observations: [{ date: "2026-01-01", value: "1.5" }, { date: "2026-02-01", value: "." }, { date: "2026-03-01", value: "2" }] });
  const fromApi = parseFredCsv(fredBodyToCsv(json, "X"));
  const fromCsv = parseFredCsv("observation_date,X\n2026-01-01,1.5\n2026-02-01,.\n2026-03-01,2\n");
  assert.deepEqual(fromApi, fromCsv);
  assert.equal(fredBodyToCsv("observation_date,X\n2026-01-01,1", "X"), "observation_date,X\n2026-01-01,1", "CSV passes through");
  assert.throws(() => fredBodyToCsv(JSON.stringify({ error_code: 400, error_message: "Bad Request. The value for variable api_key is not registered." }), "X"), /not registered/);
});

test("FRED macro fetch always sets a timeout and uses the API when FRED_API_KEY is set", async (t) => {
  const prev = process.env.FRED_API_KEY;
  process.env.FRED_API_KEY = "k123";
  t.after(() => { if (prev === undefined) delete process.env.FRED_API_KEY; else process.env.FRED_API_KEY = prev; });
  let seen: { url: string; init?: RequestInit } | null = null;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ observations: [{ date: "2026-01-01", value: "100" }, { date: "2026-02-01", value: "101" }] }));
  }) as unknown as typeof fetch;
  const series = await fetchFredSeries(MACRO_SERIES[0], { fetchImpl, now: new Date("2026-11-24T00:00:00Z") });
  assert.equal(series.observations.length, 2);
  assert.ok(seen!.url.startsWith("https://api.stlouisfed.org/"));
  assert.ok(seen!.init?.signal, "a stalled connection can't hold the cron");
});
