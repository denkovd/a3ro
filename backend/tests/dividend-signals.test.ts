import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSXModule from "xlsx";
import { parseBtos, parseEci, parseIndeedSectors, readEpochArchive } from "../src/dividend/signals/parsers";
import { EXPOSURE_GROUPS, adoptionSummary, buildSignalsSnapshot, capabilitySummary, conversionGap, frontierByMonth, postingsSummary } from "../src/dividend/signals/snapshot";
import { fetchSignals } from "../src/dividend/signals/fetch";
import { runSignalCycle } from "../src/ingest/signalCycle";
import { getStoredSignals } from "../src/storage/signalRepo";
import type { EciModel } from "../src/dividend/signals/types";

const XLSX_DEFAULT = (XLSXModule as unknown as { default?: typeof XLSXModule }).default;
const XLSX = { CFB: XLSXModule.CFB ?? XLSX_DEFAULT?.CFB, read: XLSXModule.read ?? XLSX_DEFAULT?.read, write: XLSXModule.write ?? XLSX_DEFAULT?.write, utils: XLSXModule.utils ?? XLSX_DEFAULT?.utils } as typeof XLSXModule;

// Fixtures are trimmed copies of the real files (Epoch ECI CSV, Census BTOS National.xlsx from Dec 2025, Indeed sector CSV).
const fixture = (name: string) => readFileSync(new URL(`./fixtures/dividend/${name}`, import.meta.url));
const eciCsv = fixture("eci-sample.csv").toString("utf8");
const model = (date: string, score: number, open = false, name = `m-${date}-${score}`): EciModel => ({ model: name, name, organization: "Lab", date, score, open });

describe("Epoch Capabilities Index", () => {
  test("parses the real CSV, skipping unscored or undated models", () => {
    const { models } = parseEci(eciCsv);
    assert.ok(models.length >= 20);
    assert.ok(models.every(item => Number.isFinite(item.score) && /^\d{4}-\d{2}-\d{2}$/.test(item.date)));
    assert.ok(models.some(item => item.open) && models.some(item => !item.open));
    assert.deepEqual(models.map(item => item.date), [...models.map(item => item.date)].sort());
  });

  test("parses the eci_scores.csv layout Epoch switched to on 18 Nov 2026", () => {
    const { models } = parseEci(fixture("eci-scores-20261118.csv").toString("utf8"));
    assert.ok(models.length >= 20);
    assert.ok(models.every(item => Number.isFinite(item.score) && /^\d{4}-\d{2}-\d{2}$/.test(item.date)));
    assert.ok(models.some(item => item.open) && models.some(item => !item.open));
  });

  test("rejects a changed header instead of guessing", () => {
    assert.throws(() => parseEci(eciCsv.replace("ECI Score", "Score")), /header/);
  });

  test("finds the CSV inside Epoch's zip by file name", () => {
    const zip = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(zip, "benchmark_data/epoch_capabilities_index.csv", Buffer.from(eciCsv));
    XLSX.CFB.utils.cfb_add(zip, "benchmark_data/gpqa_diamond.csv", Buffer.from("a,b\n1,2\n"));
    const bytes = XLSX.CFB.write(zip, { type: "array", fileType: "zip" }) as number[];
    assert.equal(readEpochArchive(new Uint8Array(bytes)), eciCsv);
  });

  test("the frontier is a running maximum and the open-weights gap uses open models only", () => {
    const models = [model("2024-01-10", 120), model("2024-03-05", 118), model("2024-03-20", 130, true), model("2025-03-01", 140), model("2025-04-02", 135, true)];
    assert.deepEqual(frontierByMonth(models).map(point => [point.period, point.value]).filter(([period]) => ["2024-01", "2024-02", "2024-03", "2025-04"].includes(period as string)), [["2024-01", 120], ["2024-02", 120], ["2024-03", 130], ["2025-04", 140]]);
    const summary = capabilitySummary(models)!;
    assert.equal(summary.leader.score, 140);
    assert.equal(summary.openGap, 5);
    assert.equal(summary.gainLast12Months, 10);
    assert.deepEqual(summary.gainSinceStart, { from: "2024-01", value: 20 });
  });
});

describe("Census BTOS business AI use", () => {
  const bytes = fixture("btos-national-20251215.xlsx");

  test("reads the real workbook: AI use and expected use, dated by reference-period end", () => {
    const result = parseBtos(bytes);
    assert.match(result.useQuestion, /last two weeks.*Artificial Intelligence/);
    assert.deepEqual(result.points.at(-1), { period: "2025-11-30", sampleCode: "202525", use: 17.2, expected: 20.9 });
    assert.ok(result.points.every(point => point.use === null || (point.use > 0 && point.use < 100)));
  });

  test("Nov 2026 workbook: 'Super Intelligence (formerly AI)' wording and the extra employee-use question", () => {
    const { points } = parseBtos(fixture("btos-national-20261118.xlsx"));
    assert.ok(points.length > 0);
  });

  test("fails loudly if the AI question disappears", () => {
    const workbook = XLSX.read(bytes, { type: "buffer" });
    const sheet = workbook.Sheets["Response Estimates"];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null }).filter(row => !/artificial intelligence/i.test(String(row[1] ?? "")));
    workbook.Sheets["Response Estimates"] = XLSX.utils.aoa_to_sheet(rows);
    assert.throws(() => parseBtos(XLSX.write(workbook, { type: "array", bookType: "xlsx" })), /AI-use question/);
  });

  test("six-month change compares the latest estimate with the one six months earlier", () => {
    const summary = adoptionSummary([
      { period: "2026-01-04", use: 17.7, expected: 21 },
      { period: "2026-03-15", use: 19, expected: 22 },
      { period: "2026-09-06", use: 23.8, expected: 27 },
    ], "q")!;
    assert.equal(summary.latest.use, 23.8);
    assert.ok(Math.abs(summary.changeSixMonths! - 4.8) < 1e-9);
    assert.equal(summary.monthly.length, 3);
  });
});

describe("Indeed postings by occupation", () => {
  const csv = fixture("indeed-sample.csv").toString("utf8");

  test("monthly means of total postings, ignoring new-postings rows", () => {
    const { sectors, latestDay } = parseIndeedSectors(csv);
    assert.ok(sectors.length >= 40);
    assert.equal(latestDay.slice(0, 7), "2026-10");
    const nursing = sectors.find(item => item.sector === "Nursing")!;
    assert.equal(nursing.points[0].period, "2020-02");
    assert.ok(Math.abs(nursing.points[0].value - 100) < 2);
  });

  test("every grouped occupation exists in the real data", () => {
    const names = new Set(parseIndeedSectors(csv).sectors.map(item => item.sector));
    for (const name of [...EXPOSURE_GROUPS.exposed, ...EXPOSURE_GROUPS.handsOn]) assert.ok(names.has(name), name);
  });

  test("baskets are simple averages and need every member", () => {
    const sectors = [...EXPOSURE_GROUPS.exposed.map(sector => ({ sector, points: [{ period: "2022-11", value: 120 }, { period: "2026-10", value: 80 }] })), ...EXPOSURE_GROUPS.handsOn.map(sector => ({ sector, points: [{ period: "2022-11", value: 110 }, { period: "2026-10", value: 120 }] }))];
    const summary = postingsSummary(sectors, "2026-10-31")!;
    assert.equal(summary.gap, -40);
    assert.equal(summary.gapAtLaunch, 10);
    assert.equal(postingsSummary(sectors.slice(1), "2026-10-31"), null);
  });
});

describe("Conversion gap", () => {
  const series = (pre: number, post: number) => {
    const points: { period: string; value: number }[] = [];
    let value = 100;
    for (let year = 2016; year <= 2026; year++) for (let q = 1; q <= 4; q++) {
      if (year === 2026 && q > 2) break;
      points.push({ period: `${year}-Q${q}`, value });
      value *= 1 + (`${year}-Q${q}` >= "2022-Q4" ? post : pre) / 400;
    }
    return points;
  };

  test("annualised growth since 2022-Q4 minus the 2016-Q4→2019-Q4 trend", () => {
    const result = conversionGap(series(1.4, 2.4))!;
    assert.equal(result.from, "2022-Q4");
    assert.equal(result.to, "2026-Q2");
    // Quarterly compounding: 1.4% and 2.4% a year annualise to about 1.41% and 2.42%.
    assert.ok(Math.abs(result.annualTrend - 1.407) < 0.005);
    assert.ok(Math.abs(result.annualSince - 2.422) < 0.005);
    assert.ok(Math.abs(result.gap - 1.014) < 0.005);
  });

  test("missing baseline quarters give no gap rather than a guess", () => {
    assert.equal(conversionGap(series(1, 2).filter(point => point.period !== "2019-Q4")), null);
    assert.equal(conversionGap([]), null);
  });
});

describe("Signal fetching and storage", () => {
  test("one failing source never blocks the others", async () => {
    const fetchImpl = (async (url: string) => url.includes("census.gov") ? new Response(fixture("btos-national-20251215.xlsx")) : new Response("down", { status: 503 })) as typeof fetch;
    const results = await fetchSignals({ fetchImpl, now: new Date("2026-11-18T00:00:00Z") });
    assert.deepEqual(results.map(item => [item.source, item.dataset !== null]), [["epoch", false], ["btos", true], ["indeed", false]]);
    assert.match(results[0].error!, /503/);
  });

  test("the cycle archives what it fetched and records a run for every source", async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql.trim().split(/\s+/).slice(0, 3).join(" ")); return { rows: [], rowCount: 0 }; } };
    const fetchImpl = (async (url: string) => url.includes("census.gov") ? new Response(fixture("btos-national-20251215.xlsx")) : new Response("down", { status: 503 })) as typeof fetch;
    const report = await runSignalCycle(db as never, { fetchImpl });
    assert.deepEqual(report.results.map(item => item.archived), [false, true, false]);
    assert.equal(queries.filter(sql => sql.includes("dividend_signal_vintages")).length, 1);
    assert.equal(queries.filter(sql => sql.includes("dividend_signal_runs")).length, 3);
  });

  test("stored data with an unknown source is ignored and missing sources read as unavailable", async () => {
    const rowsFor = (sql: string) => sql.includes("vintages")
      ? [{ source_key: "btos", payload: { useQuestion: "q", points: [{ period: "2026-09-06", sampleCode: "202618", use: 23.8, expected: 27 }] }, data_url: "u", last_verified_at: "2026-11-18T00:00:00Z" }, { source_key: "other", payload: {}, data_url: "u", last_verified_at: "2026-11-18T00:00:00Z" }]
      : [{ source_key: "btos", checked_at: "2026-11-18T00:00:00Z", health: "healthy", error: null }];
    const db = { query: async (sql: string) => ({ rows: rowsFor(sql), rowCount: 1 }) };
    const stored = await getStoredSignals(db as never);
    assert.deepEqual(Object.keys(stored.datasets), ["btos"]);
    const snapshot = buildSignalsSnapshot(stored.datasets, stored.states);
    assert.equal(snapshot.adoption?.latest.use, 23.8);
    assert.equal(snapshot.capability, null);
    assert.deepEqual(snapshot.sources.map(item => item.health), ["unavailable", "healthy", "unavailable"]);
  });
});
