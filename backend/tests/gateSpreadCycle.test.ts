import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runGateSpreadCycle } from "../src/ingest/gateSpreadCycle";
import { QueryResultLike, Queryable } from "../src/storage/db";

const FIXED_NOW = new Date("2026-07-07T00:00:00.000Z");
const DAY_MS = 86_400_000;

/** Stub Queryable: answers the freshness read with `newest` (or throws
 *  `guardError`), and counts one row per UPDATE unless `missRows`. */
class StubDb implements Queryable {
  calls: { text: string; params?: unknown[] }[] = [];
  constructor(
    public newest: string | null,
    public opts: { guardError?: Error; missRows?: boolean } = {},
  ) {}

  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    this.calls.push({ text, params });
    if (text.includes("max(weekly_computed_at)")) {
      if (this.opts.guardError) throw this.opts.guardError;
      return { rows: [{ newest: this.newest }], rowCount: 1 };
    }
    return { rows: [], rowCount: this.opts.missRows ? 0 : 1 };
  }
}

/** Five steady years of daily rows for Hormuz and Suez, in one page. */
function stubFetchHistory() {
  const features: { attributes: Record<string, unknown> }[] = [];
  for (const [portid, n] of [["chokepoint6", 40], ["chokepoint1", 20]] as const) {
    for (let t = Date.parse("2021-07-01T00:00:00.000Z"); t <= FIXED_NOW.getTime(); t += DAY_MS) {
      features.push({ attributes: { portid, date: new Date(t).toISOString().slice(0, 10), n_tanker: n, capacity_tanker: n * 50_000 } });
    }
  }
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ features }), { status: 200 });
  };
  return () => calls;
}

describe("runGateSpreadCycle", () => {
  let originalFetch: typeof global.fetch;
  const setup = () => { originalFetch = global.fetch; };
  const teardown = () => { global.fetch = originalFetch; };

  test("fresh spreads (< maxAgeDays old) skip the fetch entirely", async () => {
    setup();
    try {
      const fetchCalls = stubFetchHistory();
      const db = new StubDb(new Date(Date.now() - 3 * DAY_MS).toISOString());
      const report = await runGateSpreadCycle(db, { now: () => FIXED_NOW });
      assert.equal(report.skipped, "fresh (3d old)");
      assert.equal(report.computed, 0);
      assert.equal(report.written, 0);
      assert.equal(report.error, undefined);
      assert.equal(fetchCalls(), 0);
      assert.equal(db.calls.length, 1); // the freshness read only
    } finally {
      teardown();
    }
  });

  test("nothing stored yet (first run after the migration) fetches and writes straight away", async () => {
    setup();
    try {
      const fetchCalls = stubFetchHistory();
      const db = new StubDb(null);
      const report = await runGateSpreadCycle(db, { now: () => FIXED_NOW });
      assert.equal(report.skipped, undefined);
      assert.equal(report.error, undefined);
      assert.equal(report.computed, 8); // 2 gates × 2 metrics × 2 windows
      assert.equal(report.written, 8);
      assert.equal(fetchCalls(), 1);
      const updates = db.calls.filter((c) => c.text.includes("update corridor_baselines"));
      assert.equal(updates.length, 8);
      // keyed like the baseline row, spread sent as JSON text for the jsonb column
      const first = updates[0];
      assert.deepEqual(first.params?.slice(0, 3), ["hormuz", "tanker_transits", "1y"]);
      const sent = JSON.parse(String(first.params?.[3]));
      assert.equal(sent.p50, 40);
      assert.equal(sent.mad, 0);
      assert.ok(first.text.includes("weekly_computed_at = now()"));
      // it must never insert: a spread without its baseline row means nothing
      assert.equal(db.calls.some((c) => /insert into/i.test(c.text)), false);
    } finally {
      teardown();
    }
  });

  test("stale spreads (>= maxAgeDays old) refetch; custom maxAgeDays is honoured", async () => {
    setup();
    try {
      const fetchCalls = stubFetchHistory();
      const stale = new StubDb(new Date(Date.now() - 40 * DAY_MS).toISOString());
      assert.equal((await runGateSpreadCycle(stale, { now: () => FIXED_NOW })).written, 8);
      const tenDays = new StubDb(new Date(Date.now() - 10 * DAY_MS).toISOString());
      assert.equal((await runGateSpreadCycle(tenDays, { now: () => FIXED_NOW })).skipped, "fresh (10d old)");
      assert.equal((await runGateSpreadCycle(tenDays, { now: () => FIXED_NOW, maxAgeDays: 5 })).written, 8);
      assert.equal(fetchCalls(), 2);
    } finally {
      teardown();
    }
  });

  test("spreads with no baseline row to attach to are computed but not counted as written", async () => {
    setup();
    try {
      stubFetchHistory();
      const db = new StubDb(null, { missRows: true });
      const report = await runGateSpreadCycle(db, { now: () => FIXED_NOW });
      assert.equal(report.computed, 8);
      assert.equal(report.written, 0);
      assert.equal(report.error, undefined);
    } finally {
      teardown();
    }
  });

  test("migration 022 not applied is reported in plain words, and nothing is fetched", async () => {
    setup();
    try {
      const fetchCalls = stubFetchHistory();
      const db = new StubDb(null, { guardError: new Error('column "weekly_computed_at" does not exist') });
      const report = await runGateSpreadCycle(db, { now: () => FIXED_NOW });
      assert.ok(report.error?.startsWith("migration 022_gate_weekly_spread.sql not applied:"));
      assert.equal(report.written, 0);
      assert.equal(fetchCalls(), 0);
    } finally {
      teardown();
    }
  });

  test("a token-required answer from PortWatch is captured as auth, never thrown", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: { code: 499, message: "Token Required" } }), { status: 200 });
      const db = new StubDb(null);
      const report = await runGateSpreadCycle(db, { now: () => FIXED_NOW });
      assert.ok(report.error?.startsWith("auth:"), report.error);
      assert.equal(report.written, 0);
      assert.equal(db.calls.length, 1); // nothing written after a failed fetch
    } finally {
      teardown();
    }
  });

  test("an unknown throw is wrapped as bad_payload; the cycle never rejects", async () => {
    setup();
    try {
      const db = new StubDb(null, { guardError: new Error("db connection reset") });
      const report = await runGateSpreadCycle(db, { now: () => FIXED_NOW });
      assert.ok(report.error?.includes("bad_payload"));
      assert.ok(report.error?.includes("db connection reset"));
      global.fetch = async () => { throw new Error("socket hang up"); };
      await assert.doesNotReject(() => runGateSpreadCycle(new StubDb(null), { now: () => FIXED_NOW }));
    } finally {
      teardown();
    }
  });
});
