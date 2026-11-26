// LNG Tracker (roadmap #57): reference data holds together and the ABS spec is right.
import { test } from "node:test";
import assert from "node:assert/strict";

const ref = await import("../lib/lng/reference.ts");
const ex = await import("../lib/commodity/absExports.ts");
const access = await import("../lib/access.ts");
const jobs = await import("../lib/manualJobs.ts");

const inRange = (lon, lat) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;

test("ids unique, coordinates valid, sources present", () => {
  for (const list of [ref.EXPORTERS, ref.IMPORTERS, ref.PLANTS]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of list) assert.ok(inRange(x.lon, x.lat), x.id);
  }
  for (const d of ref.DESTINATIONS) assert.ok(inRange(d.lon, d.lat), d.code);
  assert.ok(inRange(ref.HORMUZ.lon, ref.HORMUZ.lat));
  for (const [id, s] of Object.entries(ref.SOURCES)) { assert.match(s.url, /^https:\/\//, id); assert.match(s.reviewed, /^\d{4}-\d{2}-\d{2}$/, id); }
  for (const p of ref.PLANTS) assert.ok(ref.SOURCES[p.source], p.id);
  for (const id of ref.HORMUZ.sources) assert.ok(ref.SOURCES[id], id);
});

test("totals hold together", () => {
  const exp = ref.EXPORTERS.reduce((a, e) => a + e.mt, 0);
  const imp = ref.IMPORTERS.reduce((a, e) => a + e.mt, 0);
  assert.ok(exp < ref.WORLD_TRADE_MT && imp < ref.WORLD_TRADE_MT);
  const top3 = ref.EXPORTERS.slice(0, 3).reduce((a, e) => a + e.mt, 0) / ref.WORLD_TRADE_MT;
  assert.ok(Math.abs(top3 - ref.TOP3_SHARE) < 0.02, `top3 ${top3}`);
  assert.equal(ref.PLANTS.length, 10);
  const cap = ref.PLANTS.reduce((a, p) => a + p.mtpa, 0);
  assert.ok(cap > 80 && cap < 90, `capacity ${cap}`);
  const au = ref.EXPORTERS.find((e) => e.id === "australia");
  assert.ok(au.mt < cap, "exports below capacity");
});

test("ABS query asks for SITC 343 by destination and WA, Qld, NT", () => {
  const url = ex.exportsUrl(ref.LNG_EXPORTS, "2021-11");
  assert.match(url, /\/343\.TOT\+JAP\+CHIN\+/);
  assert.match(url, /\.TOT\+5\+3\+7\.M\?/);
});

test("Hormuz note is dated and has a weekly check", () => {
  assert.match(ref.HORMUZ.asOf, /\d{1,2} [A-Z][a-z]{2} \d{4}/);
  const job = jobs.MANUAL_JOBS.find((j) => j.id === "lng-hormuz");
  assert.equal(job.everyDays, 7);
});

test("LNG module is free, listed and its API public", () => {
  const m = access.MODULE_ACCESS.find((x) => x.id === "lng");
  assert.equal(m.level, "public");
  assert.equal(access.canSeeRoute("/Projects/LNG-Tracker", access.ANONYMOUS), true);
  assert.equal(access.canSeeRoute("/api/lng/exports", access.ANONYMOUS), true);
});
