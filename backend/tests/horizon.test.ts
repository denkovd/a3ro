import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { annualHorizonChange, buildHorizonSnapshot, horizonFreshness, horizonPeriodEnd } from "../src/horizon/engine";
import { parseHorizonCsv, parseBlsHorizon, parseBeaHorizon, parseDfaHorizon, readDfaArchive, fetchHorizonBaseline, fetchHorizonDataset } from "../src/horizon/sources";
import { horizonContentHash, archiveHorizonDataset, getStoredHorizon } from "../src/storage/horizonRepo";
import { runHorizonCycle } from "../src/ingest/horizonCycle";
import type { HorizonDataset, HorizonPoint } from "../src/horizon/types";
import type { Queryable } from "../src/storage/db";

const now = new Date("2026-10-18T00:00:00Z");
const blsPayload = {
  status: "REQUEST_SUCCEEDED", Results: { series: [
    { seriesID: "PRS85006093", data: [{ year: "2026", period: "Q02", value: "120", footnotes: [{ code: "R", text: "revised" }] }, { year: "2025", period: "Q02", value: "100" }, { year: "2025", period: "Q05", value: "999" }] },
    { seriesID: "PRS85006153", data: [{ year: "2026", period: "Q02", value: "110" }] },
    { seriesID: "LNS14000000", data: [{ year: "2026", period: "M09", value: "4.2" }, { year: "2025", period: "M09", value: "4.0" }, { year: "2025", period: "M13", value: "99" }] },
    { seriesID: "CUSR0000SEHF01", data: [{ year: "2026", period: "M09", value: "300.001" }] },
  ] },
};
const beaHeader = 'Year,Ranking,Income Concept,"NIPA Table 2.9, line Number",Quantile or Summary Metric,Value';
const beaRow = (metric: string, value: string, ranking = "Equivalized Disposable Personal Income") => `2024,${ranking},Disposable personal income,13.0,${metric},${value}`;
const beaCsv = [beaHeader, beaRow("0-20%", "0.06"), beaRow("20-40%", "0.10"), beaRow("40-60%", "0.14"), beaRow("60-80%", "0.20"), beaRow("80-100%", "0.50"), beaRow("0-10%", "0.025"), beaRow("Median ($2017)", "90000"), beaRow("Top 1%", "[0.1-0.2]"), beaRow("0-20%", "0.99", "Equivalized Personal Income")].join("\r\r\n");
const dfaCsv = "Date,Category,Net worth\n2026:Q2,TopPt1,10\n2026:Q2,RemainingTop1,20\n2026:Q2,Next9,35\n2026:Q2,Next40,33\n2026:Q2,Bottom50,2\n";
const dataset = (): HorizonDataset => ({ source: "bls", retrievedAt: now.toISOString(), publicationDate: null, dataUrl: "https://api.bls.gov/", series: parseBlsHorizon(blsPayload) });

function dfaZip(csv: string): ArrayBuffer {
  const cfb = XLSX.CFB ?? (XLSX as unknown as { default: typeof XLSX }).default.CFB;
  const archive = cfb.utils.cfb_new();
  cfb.utils.cfb_add(archive, "dfa-networth-levels.csv", Buffer.from(csv));
  const bytes = Buffer.from(cfb.write(archive, { type: "buffer", fileType: "zip" }));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("Horizon source definitions", () => {
  test("CSV handles quoted commas, escaped quotes, BOM and doubled carriage returns", () => {
    assert.deepEqual(parseHorizonCsv('\uFEFFname,value\r\r\n"a, b","a""b"\r\r\n'), [{ name: "a, b", value: 'a"b' }]);
    assert.throws(() => parseHorizonCsv('a,b\n"unfinished'), /unterminated/);
    assert.throws(() => parseHorizonCsv("a,b\n1,2,3"), /header/);
  });
  test("BLS excludes annual averages, preserves precision and revision footnotes", () => {
    const result = parseBlsHorizon(blsPayload);
    assert.deepEqual(result[0].points.map(point => point.period), ["2025-Q2", "2026-Q2"]);
    assert.equal(result[0].points[1].status, "revised");
    assert.equal(result[3].points[0].value, 300.001);
    assert.equal(result[2].points.length, 2);
    assert.throws(() => parseBlsHorizon({ status: "REQUEST_NOT_PROCESSED" }), /successful/);
  });
  test("BEA groups non-overlapping disposable-income shares, without mixing ranks or ranges", () => {
    const result = parseBeaHorizon(beaCsv);
    assert.equal(result.find(series => series.key === "income_bottom40")!.points[0].value, 16);
    assert.ok(Math.abs(result.find(series => series.key === "income_middle40")!.points[0].value - 34) < 1e-10);
    assert.equal(result.find(series => series.key === "income_top20")!.points[0].value, 50);
    assert.equal(result.find(series => series.key === "real_median_dpi")!.points[0].value, 90000);
    assert.throws(() => parseBeaHorizon(beaCsv.replace("80-100%,0.50", "80-100%,0.80")), /sum/);
    assert.throws(() => parseBeaHorizon(beaCsv + "\n" + beaRow("0-20%", "0.06")), /duplicate/);
  });
  test("DFA combines both top-one-percent components and divides by all five wealth groups", () => {
    const result = parseDfaHorizon(dfaCsv);
    assert.equal(result[0].points[0].value, 30);
    assert.equal(result[1].points[0].value, 2);
    assert.equal(result[0].points[0].period, "2026-Q2");
    assert.throws(() => parseDfaHorizon(dfaCsv.replace("RemainingTop1", "UnknownGroup")), /categories/);
    assert.throws(() => parseDfaHorizon(dfaCsv + "2026:Q2,Bottom50,2\n"), /duplicate/);
  });
  test("the actual ZIP-reading path finds and parses the bounded CSV", () => {
    const csv = readDfaArchive(dfaZip(dfaCsv));
    assert.deepEqual(parseDfaHorizon(csv), parseDfaHorizon(dfaCsv));
  });
});

describe("Horizon measurement rules", () => {
  test("annual change requires the exact year-earlier observation", () => {
    const points: HorizonPoint[] = [{ period: "2025-Q1", value: 100, status: null }, { period: "2026-Q2", value: 120, status: null }];
    assert.equal(annualHorizonChange(points, "percent").value, null);
    points.unshift({ period: "2025-Q2", value: 110, status: null });
    assert.ok(Math.abs(annualHorizonChange(points, "percent").value! - 100 / 11) < 1e-10);
  });
  test("shares and rates use percentage-point changes, preserving a zero reference", () => {
    const points = [{ period: "2025", value: 0, status: null }, { period: "2026", value: 2, status: null }];
    assert.equal(annualHorizonChange(points, "percentage_points").value, 2);
    assert.equal(annualHorizonChange(points, "percent").value, null);
  });
  test("freshness uses period end and source cadence, not download time", () => {
    assert.equal(horizonPeriodEnd("2024-02", "monthly")!.toISOString().slice(0, 10), "2024-02-29");
    assert.equal(horizonPeriodEnd("2026-Q5", "quarterly"), null);
    assert.equal(horizonFreshness("2026-09", "monthly", now), "current");
    assert.equal(horizonFreshness("2024", "annual", now), "current");
    assert.equal(horizonFreshness("2023", "annual", now), "stale");
    assert.equal(horizonFreshness("2026-Q3", "quarterly", new Date("2026-07-01")), "unavailable");
  });
  test("snapshot preserves missing inputs and rejects future periods", () => {
    const input = dataset();
    input.series[0].points.push({ period: "2027-Q1", value: 999, status: null });
    const snapshot = buildHorizonSnapshot([input], [{ source: "bls", checkedAt: now.toISOString(), health: "healthy", error: null }], now);
    assert.equal(snapshot.status, "partial");
    assert.equal(snapshot.coverage.available, 4);
    assert.equal(snapshot.indicators[0].latest!.value, 120);
    assert.equal(snapshot.indicators.find(indicator => indicator.key === "wealth_top1")!.latest, null);
    assert.equal(snapshot.indicators[0].publicationDate, null);
  });
  test("a failed source check never makes stored data count as verified-current", () => {
    const snapshot = buildHorizonSnapshot([dataset()], [{ source: "bls", checkedAt: now.toISOString(), health: "degraded", error: "offline" }], now);
    assert.equal(snapshot.coverage.current, 0);
    assert.equal(snapshot.indicators[0].latest!.value, 120);
    assert.equal(snapshot.indicators[0].sourceHealth, "degraded");
  });
});

describe("Horizon source and archival failures", () => {
  test("sources fetch independently and one outage does not erase two working sources", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).includes("bls.gov")) return Response.json(blsPayload);
      if (String(url).includes("bea.gov")) return new Response(beaCsv);
      throw new Error("offline");
    }) as typeof fetch;
    const result = await fetchHorizonBaseline({ now, fetchImpl });
    assert.equal(result.datasets.length, 2);
    assert.equal(result.states.find(state => state.source === "dfa")!.health, "unavailable");
    assert.equal(result.states.find(state => state.source === "bea")!.health, "healthy");
  });
  test("missing BLS series are reported as degraded rather than healthy", async () => {
    const fetchImpl = (async (url: string | URL | Request) => String(url).includes("bls.gov") ? Response.json({ status: "REQUEST_SUCCEEDED", Results: { series: [blsPayload.Results.series[0]] } }) : new Response("offline", { status: 503 })) as typeof fetch;
    const result = await fetchHorizonBaseline({ now, fetchImpl });
    assert.equal(result.states[0].health, "degraded");
    assert.equal(result.datasets[0].series[0].points.length, 2);
  });
  test("BLS requests use the current ten-year inclusive window and a single batch", async () => {
    let body: { startyear: string; endyear: string; seriesid: string[] } | undefined;
    const fetchImpl = (async (_url: unknown, init: RequestInit) => { body = JSON.parse(String(init.body)); return Response.json(blsPayload); }) as typeof fetch;
    await fetchHorizonDataset("bls", { now, fetchImpl });
    assert.equal(body!.startyear, "2017");
    assert.equal(body!.endyear, "2026");
    assert.equal(body!.seriesid.length, 4);
  });
  test("content fingerprints ignore retrieval time and detect data revisions", () => {
    const original = dataset();
    const later = { ...original, retrievedAt: "2026-10-19T00:00:00Z" };
    assert.equal(horizonContentHash(original), horizonContentHash(later));
    const revision = structuredClone(original);
    revision.series[0].points[0].value += 1;
    assert.notEqual(horizonContentHash(original), horizonContentHash(revision));
  });
  test("archival writes parameterised payloads, retaining the original vintage on repeat fetch", async () => {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const db: Queryable = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    const hash = await archiveHorizonDataset(db, dataset());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params![1], hash);
    assert.match(calls[0].sql, /on conflict/);
    assert.doesNotMatch(calls[0].sql.split("on conflict")[1], /payload\s*=/);
  });
  test("stored histories are ordered by latest verification, including reversions", async () => {
    const db: Queryable = { query: async sql => {
      if (sql.includes("horizon_source_vintages")) {
        assert.match(sql, /last_verified_at desc/);
        return { rows: [{ source_key: "bls", payload: dataset(), last_verified_at: "2026-10-19T00:00:00Z" }] };
      }
      return { rows: [{ source_key: "bls", checked_at: now.toISOString(), health: "healthy", error: null }] };
    } };
    const result = await getStoredHorizon(db);
    assert.equal(result.datasets[0].retrievedAt, "2026-10-19T00:00:00.000Z");
  });
  test("a database failure is isolated and reported by the ingestion cycle", async () => {
    const db: Queryable = { query: async () => { throw new Error("unavailable"); } };
    const fetchImpl = (async (url: string | URL | Request) => String(url).includes("bls.gov") ? Response.json(blsPayload) : new Response("offline", { status: 503 })) as typeof fetch;
    const result = await runHorizonCycle(db, { now, fetchImpl });
    assert.equal(result.results.length, 3);
    assert.equal(result.results[0].archived, false);
    assert.equal(result.results[0].health, "degraded");
  });
});
