import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runBaselineCycle } from "../src/ingest/baselineCycle";
import { SourceError } from "../src/core/types";
import { QueryResultLike, Queryable } from "../src/storage/db";
import baselines1yFixture from "./fixtures/portwatch-baselines-1y.json" with { type: "json" };
import baselines5yFixture from "./fixtures/portwatch-baselines-5y.json" with { type: "json" };
import baselinesPriorFixture from "./fixtures/portwatch-baselines-prior.json" with { type: "json" };

/** Stub Queryable: routes `select max(computed_at)` to a configurable
 *  `newest` value (or null for an empty table) and records every other
 *  query (the upserts) so tests can assert on write counts. */
class StubDb implements Queryable {
  calls: { text: string; params?: unknown[] }[] = [];
  newest: string | null;

  constructor(newest: string | null) {
    this.newest = newest;
  }

  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    this.calls.push({ text, params });
    if (text.includes("max(computed_at)")) {
      return { rows: [{ newest: this.newest }], rowCount: this.newest ? 1 : 0 };
    }
    // upsertBaselines insert
    return { rows: [], rowCount: 1 };
  }
}

const FIXED_NOW = new Date("2026-07-07T00:00:00.000Z");

/** Same where-clause routing as portwatchBaselines.test.ts (see that
 *  file's comment: `+` must be converted to a space before decoding —
 *  URLSearchParams uses application/x-www-form-urlencoded, not plain
 *  percent-encoding, for the space character). */
const stubFetchSuccess = () => {
  global.fetch = async (url: string | URL) => {
    const urlStr = decodeURIComponent(String(url).replace(/\+/g, " "));
    if (urlStr.includes(" AND date < DATE ")) {
      return new Response(JSON.stringify(baselinesPriorFixture), { status: 200 });
    }
    if (urlStr.includes("DATE '2025-07-07'")) {
      return new Response(JSON.stringify(baselines1yFixture), { status: 200 });
    }
    if (urlStr.includes("DATE '2021-07-08'")) {
      return new Response(JSON.stringify(baselines5yFixture), { status: 200 });
    }
    return new Response(JSON.stringify({ features: [] }), { status: 200 });
  };
};

describe("runBaselineCycle", () => {
  let originalFetch: typeof global.fetch;

  const setupTest = () => {
    originalFetch = global.fetch;
  };
  const teardownTest = () => {
    global.fetch = originalFetch;
  };

  test("fresh table (< maxAgeDays old) skips the fetch entirely", async () => {
    setupTest();
    try {
      let fetchCalled = false;
      global.fetch = async () => {
        fetchCalled = true;
        return new Response(JSON.stringify({ features: [] }), { status: 200 });
      };

      // getBaselineAgeDays (storage/baselineRepo.ts) has no `now` injection —
      // it reports whole days since computed_at vs REAL wall-clock time, by
      // design (freshness reflects the real world, not simulated cycle time).
      // So the age here is computed against actual Date.now(), independent
      // of the `now` injected into runBaselineCycle below; a fixed 5-day-old
      // timestamp would drift relative to whatever moment the suite runs.
      const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
      const expectedAgeDays = Math.floor((Date.now() - fiveDaysAgo.getTime()) / 86_400_000);
      const db = new StubDb(fiveDaysAgo.toISOString());
      const report = await runBaselineCycle(db, { now: () => FIXED_NOW });

      assert.equal(report.startedAt, FIXED_NOW.toISOString());
      assert.equal(report.written, 0);
      assert.equal(report.skipped, `fresh (${expectedAgeDays}d old)`);
      assert.equal(report.error, undefined);
      assert.equal(fetchCalled, false);

      // only the freshness-check query ran, no upserts
      assert.equal(db.calls.length, 1);
    } finally {
      teardownTest();
    }
  });

  test("stale table (>= maxAgeDays old) fetches and upserts", async () => {
    setupTest();
    try {
      stubFetchSuccess();

      // computed 40 days before FIXED_NOW; default maxAgeDays = 28
      const db = new StubDb(new Date("2026-05-28T00:00:00.000Z").toISOString());
      const report = await runBaselineCycle(db, { now: () => FIXED_NOW });

      assert.equal(report.skipped, undefined);
      assert.equal(report.error, undefined);
      assert.equal(report.written, 24); // 6 gates × 2 metrics × 2 windows

      // 1 freshness-check query + 24 upsert queries
      assert.equal(db.calls.length, 25);
    } finally {
      teardownTest();
    }
  });

  test("empty table (never computed) always fetches and upserts", async () => {
    setupTest();
    try {
      stubFetchSuccess();

      const db = new StubDb(null);
      const report = await runBaselineCycle(db, { now: () => FIXED_NOW });

      assert.equal(report.skipped, undefined);
      assert.equal(report.written, 24);
    } finally {
      teardownTest();
    }
  });

  test("custom maxAgeDays overrides the default 28-day threshold", async () => {
    setupTest();
    try {
      let fetchCalled = false;
      global.fetch = async () => {
        fetchCalled = true;
        return new Response(JSON.stringify({ features: [] }), { status: 200 });
      };

      // 10 days old — fresh under the default (28) but stale under maxAgeDays: 5
      const db = new StubDb(new Date("2026-06-27T00:00:00.000Z").toISOString());
      const report = await runBaselineCycle(db, { now: () => FIXED_NOW, maxAgeDays: 5 });

      assert.equal(report.skipped, undefined);
      assert.equal(fetchCalled, true);
    } finally {
      teardownTest();
    }
  });

  test("SourceError from the adapter is captured in the report, never thrown", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: { code: 500, message: "Internal error" } }), { status: 200 });

      const db = new StubDb(null);
      const report = await runBaselineCycle(db, { now: () => FIXED_NOW });

      assert.equal(report.written, 0);
      assert.ok(report.error);
      assert.ok(report.error!.startsWith("upstream_error:"));
      assert.equal(report.skipped, undefined);
    } finally {
      teardownTest();
    }
  });

  test("bad_payload SourceError (shape drift) is captured, never thrown", async () => {
    setupTest();
    try {
      global.fetch = async () => new Response(JSON.stringify({ notFeatures: true }), { status: 200 });

      const db = new StubDb(null);
      const report = await runBaselineCycle(db, { now: () => FIXED_NOW });

      assert.equal(report.written, 0);
      assert.ok(report.error);
      assert.ok(report.error!.includes("bad_payload"));
    } finally {
      teardownTest();
    }
  });

  test("an unknown (non-SourceError) throw is wrapped as bad_payload, never thrown", async () => {
    setupTest();
    try {
      // db.query throws for the freshness check itself — an adapter-level bug, not a SourceError
      const db: Queryable = {
        query: async () => {
          throw new Error("db connection reset");
        },
      };

      const report = await runBaselineCycle(db, { now: () => FIXED_NOW });

      assert.equal(report.written, 0);
      assert.ok(report.error);
      assert.ok(report.error!.includes("bad_payload"));
      assert.ok(report.error!.includes("db connection reset"));
    } finally {
      teardownTest();
    }
  });

  test("SourceError instances are never re-wrapped (no double bad_payload prefix)", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: { code: 500, message: "boom" } }), { status: 200 });

      const db = new StubDb(null);
      const report = await runBaselineCycle(db, { now: () => FIXED_NOW });

      assert.ok(report.error);
      // Direct SourceError path formats as "{kind}: {message}" where message
      // already carries "[sourceId] kind: ..." — assert the real kind (upstream_error)
      // leads, not a generic bad_payload wrapper.
      assert.ok(report.error!.startsWith("upstream_error:"));
    } finally {
      teardownTest();
    }
  });

  test("does not throw even when everything fails", async () => {
    setupTest();
    try {
      global.fetch = async () => {
        throw new Error("network down");
      };

      const db = new StubDb(null);
      await assert.doesNotReject(() => runBaselineCycle(db, { now: () => FIXED_NOW }));
    } finally {
      teardownTest();
    }
  });
});
