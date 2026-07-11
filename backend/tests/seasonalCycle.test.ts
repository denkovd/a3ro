import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runSeasonalCycle } from "../src/ingest/seasonalCycle";
import { upsertSeasonalBaselines, getSeasonalBaselines } from "../src/storage/seasonalRepo";
import { SeasonalBaseline } from "../src/core/seasonalTypes";
import { QueryResultLike, Queryable } from "../src/storage/db";

class StubDb implements Queryable {
  calls: { text: string; params: unknown[] }[] = [];
  responses: QueryResultLike[] = [];
  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    this.calls.push({ text, params });
    const next = this.responses[this.calls.length - 1] ?? this.responses[this.responses.length - 1];
    return next ?? { rows: [], rowCount: 0 };
  }
}

function mkBand(partial: Partial<SeasonalBaseline> = {}): SeasonalBaseline {
  return {
    metric: "us_crude_stocks",
    isoWeek: 28,
    meanValue: 440,
    minValue: 400,
    maxValue: 480,
    sampleCount: 5,
    sampleFrom: "2021-07-16",
    sampleTo: "2026-07-03",
    computedAt: "2026-07-11T00:00:00.000Z",
    ...partial,
  };
}

describe("seasonalRepo", () => {
  test("upsertSeasonalBaselines binds all columns and counts writes", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }];
    const written = await upsertSeasonalBaselines(db, [mkBand()]);
    assert.equal(written, 1);
    const call = db.calls[0];
    assert.match(call.text, /insert into seasonal_baselines/);
    assert.match(call.text, /on conflict \(metric, iso_week\)/);
    assert.deepEqual(call.params, [
      "us_crude_stocks", 28, 440, 400, 480, 5, "2021-07-16", "2026-07-03",
    ]);
  });

  test("getSeasonalBaselines maps rows (dates via local components)", async () => {
    const db = new StubDb();
    db.responses = [
      {
        rows: [
          {
            metric: "gasoline_stocks",
            iso_week: 28,
            mean_value: "220",
            min_value: 200,
            max_value: 240,
            sample_count: 5,
            sample_from: new Date(2021, 6, 16), // Jul 16 local
            sample_to: new Date(2026, 6, 3), // Jul 3 local
            computed_at: new Date("2026-07-11T00:00:00.000Z"),
          },
        ],
      },
    ];
    const rows = await getSeasonalBaselines(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].metric, "gasoline_stocks");
    assert.equal(rows[0].isoWeek, 28);
    assert.equal(rows[0].meanValue, 220);
    assert.equal(rows[0].sampleFrom, "2021-07-16");
    assert.equal(rows[0].sampleTo, "2026-07-03");
  });
});

describe("runSeasonalCycle — freshness guard + isolation", () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: string | undefined;

  const setup = () => {
    originalFetch = global.fetch;
    originalEnv = process.env.EIA_API_KEY;
    process.env.EIA_API_KEY = "test-key";
  };
  const teardown = () => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) process.env.EIA_API_KEY = originalEnv;
    else delete process.env.EIA_API_KEY;
  };

  test("skips the EIA fetch entirely when the table is fresh", async () => {
    setup();
    try {
      let fetched = false;
      global.fetch = async () => {
        fetched = true;
        return new Response("{}", { status: 200 });
      };
      const db = new StubDb();
      // newest computed_at = now → age 0 days
      db.responses = [{ rows: [{ newest: new Date() }] }];
      const report = await runSeasonalCycle(db);
      assert.match(report.skipped ?? "", /fresh/);
      assert.equal(report.written, 0);
      assert.equal(fetched, false);
    } finally {
      teardown();
    }
  });

  test("captures SourceError from the fetch instead of throwing", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response("invalid api_key supplied", { status: 403 });
      const db = new StubDb();
      db.responses = [{ rows: [{ newest: null }] }]; // empty table → refresh
      const report = await runSeasonalCycle(db);
      assert.match(report.error ?? "", /auth/);
      assert.equal(report.written, 0);
    } finally {
      teardown();
    }
  });

  test("stale table → fetches, groups, writes", async () => {
    setup();
    try {
      global.fetch = async () => {
        const data = [
          { period: "2024-07-05", value: "400000" },
          { period: "2025-07-04", value: "410000" },
          { period: "2026-07-03", value: "420000" },
        ];
        return new Response(JSON.stringify({ response: { data } }), { status: 200 });
      };
      const db = new StubDb();
      const responses: QueryResultLike[] = [{ rows: [{ newest: null }] }];
      for (let i = 0; i < 4; i++) responses.push({ rows: [], rowCount: 1 }); // one band upsert per metric
      db.responses = responses;
      const report = await runSeasonalCycle(db);
      assert.equal(report.error, undefined);
      assert.equal(report.written, 4);
    } finally {
      teardown();
    }
  });
});
