// Uranium Tracker reference data (roadmap #54): every pin is placed, sourced and adds up.
import { test } from "node:test";
import assert from "node:assert/strict";

const fc = await import("../lib/uranium/fuelChain.ts");
const access = await import("../lib/access.ts");

const inRange = (lon, lat) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;

test("ids are unique within each layer", () => {
  for (const list of [fc.MINING_COUNTRIES, fc.MINES, fc.SITES, fc.REACTOR_COUNTRIES]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("coordinates are valid", () => {
  for (const x of [...fc.MINING_COUNTRIES, ...fc.SITES, ...fc.REACTOR_COUNTRIES]) assert.ok(inRange(x.lon, x.lat), x.id);
  for (const m of fc.MINES) if (m.lon !== undefined) assert.ok(inRange(m.lon, m.lat), m.id);
});

test("every source is https and reviewed", () => {
  for (const [id, s] of Object.entries(fc.SOURCES)) {
    assert.match(s.url, /^https:\/\//, id);
    assert.match(s.reviewed, /^\d{4}-\d{2}-\d{2}$/, id);
  }
  for (const x of [...fc.MINES, ...fc.SITES]) assert.ok(fc.SOURCES[x.source], x.id);
});

test("mines and sites point at real countries and stages", () => {
  const countries = new Set(fc.MINING_COUNTRIES.map((c) => c.id));
  for (const m of fc.MINES) assert.ok(countries.has(m.countryId), m.id);
  for (const s of fc.SITES) assert.ok(fc.STAGE_LABEL[s.stage], s.id);
  for (const st of ["conversion", "enrichment", "fabrication"]) assert.ok(fc.SITES.some((s) => s.stage === st), st);
});

test("totals hold together", () => {
  const listed = fc.MINING_COUNTRIES.reduce((a, c) => a + c.t2024, 0);
  assert.ok(listed <= fc.WORLD_MINE_OUTPUT_T[2024] && listed > 0.95 * fc.WORLD_MINE_OUTPUT_T[2024], `listed ${listed}`);
  const ops = fc.REACTOR_COUNTRIES.reduce((a, r) => a + r.operable, 0);
  assert.ok(ops <= fc.REACTOR_WORLD.operable && ops > 0.95 * fc.REACTOR_WORLD.operable, `operable ${ops}`);
  for (const c of fc.MINING_COUNTRIES) {
    const mines = fc.MINES.filter((m) => m.countryId === c.id).reduce((a, m) => a + (m.t2024 ?? 0), 0);
    assert.ok(mines <= c.t2024, `${c.id} mines exceed country`);
  }
});

test("uranium module is free and listed", () => {
  const m = access.MODULE_ACCESS.find((x) => x.id === "uranium");
  assert.equal(m.level, "public");
  assert.deepEqual(m.pages, ["/Projects/Uranium-Tracker"]);
  assert.equal(access.canSeeRoute("/Projects/Uranium-Tracker", access.ANONYMOUS), true);
});
