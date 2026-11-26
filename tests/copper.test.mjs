// Copper Tracker (roadmap #56): reference data holds together, the shared ABS reader sums two SITC codes
// and several states, and the COMEX copper stocks parser reads the CME report layout.
import { test } from "node:test";
import assert from "node:assert/strict";

const ref = await import("../lib/copper/reference.ts");
const ex = await import("../lib/commodity/absExports.ts");
const cx = await import("../lib/copper/comexStocks.ts");
const access = await import("../lib/access.ts");

const inRange = (lon, lat) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;

test("ids unique, coordinates valid, sources present", () => {
  for (const list of [ref.COUNTRIES, ref.SITES]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of list) assert.ok(inRange(x.lon, x.lat), x.id);
  }
  for (const c of ref.COUNTRIES) if (c.rlon !== undefined) assert.ok(inRange(c.rlon, c.rlat), c.id);
  for (const d of ref.DESTINATIONS) assert.ok(inRange(d.lon, d.lat), d.code);
  for (const [id, s] of Object.entries(ref.SOURCES)) { assert.match(s.url, /^https:\/\//, id); assert.match(s.reviewed, /^\d{4}-\d{2}-\d{2}$/, id); }
  for (const s of ref.SITES) if (s.source) assert.ok(ref.SOURCES[s.source], s.id);
});

test("totals hold together", () => {
  const mined = ref.COUNTRIES.reduce((a, c) => a + (c.mine2025 ?? 0), 0);
  const refined = ref.COUNTRIES.reduce((a, c) => a + (c.refined2025 ?? 0), 0);
  assert.ok(mined < ref.WORLD_MINE_KT && mined > 0.8 * ref.WORLD_MINE_KT, `mined ${mined}`);
  assert.ok(refined < ref.WORLD_REFINED_KT && refined > 0.85 * ref.WORLD_REFINED_KT, `refined ${refined}`);
  assert.ok(ref.RESERVES.australiaJorcKt < ref.RESERVES.australiaKt);
});

const csv = (rows) => ["COMMODITY_SITC,COUNTRY_DEST,STATE_ORIGIN,TIME_PERIOD,OBS_VALUE,UNIT_MULT",
  ...rows.map(([sitc, dest, state, period, v]) => `${sitc},${dest},${state},${period},${v},3`)].join("\n");
const months = (n) => Array.from({ length: n }, (_, i) => { const t = 2025 * 12 + 9 + i; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; });

test("copper query covers both SITC codes, destinations and states", () => {
  const url = ex.exportsUrl(ref.COPPER_EXPORTS, "2021-11");
  assert.match(url, /\/283\+682\.TOT\+CHIN\+JAP\+/);
  assert.match(url, /\.TOT\+4\+3\+1\+5\.M\?/);
});

test("sums ores and refined copper; missing months count as nil", () => {
  const ps = months(12);
  const rows = ps.flatMap((p, i) => [
    ["283", "TOT", "TOT", p, 600_000], ["682", "TOT", "TOT", p, i === 0 ? "" : 400_000],
    ["283", "CHIN", "TOT", p, 300_000], ["682", "USA", "TOT", p, 100_000],
    ["283", "TOT", "4", p, 200_000], ["682", "TOT", "4", p, 300_000], ["283", "TOT", "1", p, 350_000],
  ]);
  const s = ex.summarizeExports(ref.COPPER_EXPORTS, ex.parseExportsCsv(csv(rows)), "u", "t");
  assert.equal(s.months[0].totalAudM, 600);
  assert.equal(s.months[1].totalAudM, 1000);
  assert.equal(s.last12AudM, 600 * 12 + 400 * 11);
  assert.deepEqual(s.sitcLast12.map((x) => x.code), ["283", "682"]);
  assert.equal(s.destinations[0].code, "CHIN");
  assert.equal(s.destinations.find((d) => d.code === "USA").last12AudM, 1200);
  assert.equal(s.states[0].name, "South Australia");
  assert.equal(s.states[0].last12AudM, 500 * 12);
  assert.equal(s.states.find((x) => x.code === "3").last12AudM, 0);
});

// Rows shaped like CME's metals stock reports: title lines, dates, a header row, depositories, then totals.
const report = [
  ["COMMODITY EXCHANGE, INC."], ["METAL DEPOSITORY STATISTICS"], [null, "Report Date: 11/25/2026"], [null, "Activity Date: 11/24/2026"],
  ["COPPER", null, null, null, null, null, null, "(IN SHORT TONS)"],
  ["DEPOSITORY", null, "PREV TOTAL", "RECEIVED", "WITHDRAWN", "NET CHANGE", "ADJUSTMENT", "TOTAL TODAY"],
  ["SOME WAREHOUSE LLC"], ["Registered", null, 100, 0, 0, 0, 0, 100], ["Eligible", null, 50, 0, 0, 0, 0, 50], ["Total", null, 150, 0, 0, 0, 0, 150],
  ["TOTAL REGISTERED", null, 459665, 0, 3231, -3231, 0, 456434],
  ["TOTAL ELIGIBLE", null, 347144, 3157, 0, 3157, 0, 350301],
  ["COMBINED TOTAL", null, 806809, 3157, 3231, -74, 0, 806735],
];

test("COMEX copper report parses totals and dates", () => {
  const s = cx.parseCopperStockRows(report, "u", "t");
  assert.equal(s.reportDate, "2026-11-25");
  assert.equal(s.activityDate, "2026-11-24");
  assert.equal(s.registered, 456434);
  assert.equal(s.eligible, 350301);
  assert.equal(s.total, 806735);
  assert.equal(s.prevTotal, 806809);
  assert.equal(s.unit, "short tons");
});

test("COMEX parser refuses a changed layout", () => {
  assert.throws(() => cx.parseCopperStockRows(report.filter((r) => r[0] !== "TOTAL ELIGIBLE")), /missing/);
  assert.throws(() => cx.parseCopperStockRows(report.map((r) => r.map((c) => (c === "TOTAL TODAY" ? "TODAY" : c)))), /column/);
  assert.throws(() => cx.parseCopperStockRows(report.map((r) => (r[0] === "COMBINED TOTAL" ? [r[0], null, 1, 0, 0, 0, 0, 900000] : r))), /add up/);
});

test("copper module is free, listed and its APIs public", () => {
  const m = access.MODULE_ACCESS.find((x) => x.id === "copper");
  assert.equal(m.level, "public");
  assert.equal(access.canSeeRoute("/Projects/Copper-Tracker", access.ANONYMOUS), true);
  assert.equal(access.canSeeRoute("/api/copper/comex", access.ANONYMOUS), true);
  assert.equal(access.canSeeRoute("/api/copper/exports", access.ANONYMOUS), true);
});
