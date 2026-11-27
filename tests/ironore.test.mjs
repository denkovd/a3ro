// Iron Ore Tracker (roadmap #55): reference data holds together, and the ABS export reader parses and sums correctly.
import { test } from "node:test";
import assert from "node:assert/strict";

const ref = await import("../lib/ironore/reference.ts");
const ex = await import("../lib/commodity/absExports.ts");
const access = await import("../lib/access.ts");

const inRange = (lon, lat) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;

test("ids are unique and coordinates valid", () => {
  for (const list of [ref.PRODUCERS, ref.IMPORTERS, ref.PORTS, ref.MINES]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of list) assert.ok(inRange(x.lon, x.lat), x.id);
  }
  for (const d of ref.DESTINATIONS) assert.ok(inRange(d.lon, d.lat), d.code);
});

test("every source is https and reviewed, and every reference points at one", () => {
  for (const [id, s] of Object.entries(ref.SOURCES)) {
    assert.match(s.url, /^https:\/\//, id);
    assert.match(s.reviewed, /^\d{4}-\d{2}-\d{2}$/, id);
  }
  for (const p of ref.PORTS) assert.ok(ref.SOURCES[p.source], p.id);
  for (const x of [ref.WA, ref.REQ_OUTLOOK, ref.SIMANDOU]) assert.ok(ref.SOURCES[x.source]);
});

test("totals hold together", () => {
  const listed = ref.PRODUCERS.reduce((a, p) => a + p.mt2025, 0);
  assert.ok(listed <= ref.WORLD_PRODUCTION_MT && listed > 0.9 * ref.WORLD_PRODUCTION_MT, `listed ${listed}`);
  const imp = ref.IMPORTERS.reduce((a, i) => a + i.mt, 0);
  assert.ok(imp < ref.WORLD_TRADE_MT);
  const shares = ref.WA.valueShares.reduce((a, s) => a + s.share, 0);
  assert.ok(Math.abs(shares - 1) < 0.005, `shares ${shares}`);
  assert.ok(ref.PORTS.every((p) => p.throughputMt === null || p.throughputMt > 0));
  const mineCountries = new Set(ref.MINES.map((m) => m.country));
  for (const c of mineCountries) if (c !== "guinea") assert.ok(ref.PRODUCERS.some((p) => p.id === c), c);
});

const csv = (rows) => ["DATAFLOW,COMMODITY_SITC,COUNTRY_DEST,STATE_ORIGIN,FREQ,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE,UNIT_MULT",
  ...rows.map(([dest, state, period, v]) => `ABS:MERCH_EXP(1.1.0),281,${dest},${state},M,${period},${v},AUD,3`)].join("\n");
const months = (n, from = [2024, 10]) => Array.from({ length: n }, (_, i) => {
  const t = from[0] * 12 + (from[1] - 1) + i; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
});

test("ABS query asks for iron ore, every destination and WA", () => {
  const url = ex.exportsUrl(ref.IRON_ORE_EXPORTS, "2021-11");
  assert.match(url, /ABS,MERCH_EXP,1\.1\.0\/281\.TOT\+CHIN\+/);
  assert.match(url, /\.TOT\+5\.M\?startPeriod=2021-11&format=csv$/);
  assert.equal(ex.startPeriodFor(new Date("2026-11-27T00:00:00Z")), "2021-11");
});

test("parses A$ thousands into A$ millions and sums the last 12 months", () => {
  const ps = months(24);
  const rows = ps.flatMap((p, i) => [
    ["TOT", "TOT", p, 10_000_000 + i * 1000], // A$10bn a month
    ["TOT", "5", p, 9_900_000],
    ["CHIN", "TOT", p, 8_000_000],
    ["JAP", "TOT", p, 500_000],
    ["RKOR", "TOT", p, i === 23 ? "" : 400_000], // blank latest value skipped
  ]);
  const s = ex.summarizeExports(ref.IRON_ORE_EXPORTS, ex.parseExportsCsv(csv(rows)), "u", "t");
  assert.equal(s.latestPeriod, ps[23]);
  assert.equal(s.months.length, 24);
  assert.equal(s.months[0].totalAudM, 10_000);
  const expected = ps.slice(12).reduce((a, _, k) => a + 10_000 + (12 + k), 0);
  assert.ok(Math.abs(s.last12AudM - expected) < 1e-6);
  assert.ok(s.prior12AudM > 0 && s.prior12AudM < s.last12AudM);
  assert.equal(s.destinations[0].code, "CHIN");
  assert.ok(Math.abs(s.destinations[0].share - 96_000 / expected) < 1e-9);
  assert.equal(s.destinations.find((d) => d.code === "RKOR").latestAudM, null);
  assert.ok(s.states[0].share > 0.98 && s.states[0].share < 1);
  assert.ok(s.otherLast12AudM > 0);
});

test("refuses empty or short answers", () => {
  assert.throws(() => ex.parseExportsCsv("NoRecordsFound"));
  assert.throws(() => ex.summarizeExports(ref.IRON_ORE_EXPORTS, ex.parseExportsCsv(csv(months(6).map((p) => ["TOT", "TOT", p, 1]))), "u", "t"), /12 months/);
  assert.throws(() => ex.parseExportsCsv("A,B\n1,2"), /missing required columns/);
});

test("labelled cells (CODE: Label) are read by their code", () => {
  const text = ["DATAFLOW,COMMODITY_SITC: Commodity,COUNTRY_DEST: Country,STATE_ORIGIN: State,FREQ: Frequency,TIME_PERIOD: Time,OBS_VALUE,UNIT_MULT: Unit multiplier",
    ...months(12).map((p) => `ABS:MERCH_EXP(1.1.0),281: Iron ore,TOT: Total,TOT: Total,M: Monthly,${p},5000000,3: Thousands`)].join("\n");
  const s = ex.summarizeExports(ref.IRON_ORE_EXPORTS, ex.parseExportsCsv(text), "u", "t");
  assert.equal(s.last12AudM, 60_000);
});

test("iron ore module is free, listed and its API public", () => {
  const m = access.MODULE_ACCESS.find((x) => x.id === "ironore");
  assert.equal(m.level, "public");
  assert.equal(m.data, "open");
  assert.equal(access.canSeeRoute("/Projects/Iron-Ore-Tracker", access.ANONYMOUS), true);
  assert.equal(access.canSeeRoute("/api/ironore/exports", access.ANONYMOUS), true);
  assert.equal(ex.periodLabel("2026-09"), "Sep 2026");
});
