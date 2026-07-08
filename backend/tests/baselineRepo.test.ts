import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { upsertBaselines, getBaselines, getBaselineAgeDays } from "../src/storage/baselineRepo";
import { CorridorBaseline } from "../src/core/corridorTypes";
import { QueryResultLike, Queryable } from "../src/storage/db";

/** Stub Queryable that records every call (SQL text + params) and lets
 *  a test control what rows/rowCount come back. */
class StubDb implements Queryable {
  calls: { text: string; params: unknown[] }[] = [];
  /** Queued responses returned in call order; last one repeats if exhausted. */
  responses: QueryResultLike[] = [];

  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    this.calls.push({ text, params });
    const next = this.responses[this.calls.length - 1] ?? this.responses[this.responses.length - 1];
    return next ?? { rows: [], rowCount: 0 };
  }
}

function makeBaseline(overrides: Partial<CorridorBaseline> = {}): CorridorBaseline {
  return {
    corridor: "hormuz",
    metric: "tanker_transits",
    win: "1y",
    meanValue: 20.4,
    p10: 11,
    p90: 34,
    yoyPct: 25.0,
    sampleFrom: "2025-07-07",
    sampleTo: "2026-07-07",
    computedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("baselineRepo", () => {
  test("upsertBaselines upserts n rows and returns the written count", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }];

    const rows = [
      makeBaseline({ win: "1y" }),
      makeBaseline({ win: "5y", yoyPct: null, sampleFrom: "2021-07-08" }),
    ];

    const written = await upsertBaselines(db, rows);

    assert.equal(written, 2);
    assert.equal(db.calls.length, 2);
  });

  test("upsertBaselines passes params in column order and includes the on-conflict clause", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }];

    const row = makeBaseline();
    await upsertBaselines(db, [row]);

    const call = db.calls[0];
    assert.match(call.text, /insert into corridor_baselines/i);
    assert.match(call.text, /on conflict \(corridor, metric, win\) do update/i);

    // column order: corridor, metric, win, mean_value, p10, p90, yoy_pct,
    // sample_from, sample_to  (computed_at is `now()` server-side, not a param)
    assert.deepEqual(call.params, [
      row.corridor,
      row.metric,
      row.win,
      row.meanValue,
      row.p10,
      row.p90,
      row.yoyPct,
      row.sampleFrom,
      row.sampleTo,
    ]);
  });

  test("upsertBaselines passes null p10/p90/yoyPct through unchanged", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }];

    const row = makeBaseline({ p10: null, p90: null, yoyPct: null });
    await upsertBaselines(db, [row]);

    const call = db.calls[0];
    assert.equal(call.params[4], null); // p10
    assert.equal(call.params[5], null); // p90
    assert.equal(call.params[6], null); // yoy_pct
  });

  test("upsertBaselines returns 0 when nothing is written", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 0 }];

    const written = await upsertBaselines(db, [makeBaseline()]);
    assert.equal(written, 0);
  });

  test("getBaselines issues a select-all query and maps rows (string numerics coerced)", async () => {
    const db = new StubDb();
    db.responses = [
      {
        rows: [
          {
            corridor: "hormuz",
            metric: "tanker_transits",
            win: "1y",
            mean_value: "20.4",
            p10: "11",
            p90: "34",
            yoy_pct: "25.0",
            sample_from: "2025-07-07",
            sample_to: "2026-07-07",
            computed_at: "2026-07-07T00:00:00.000Z",
          },
        ],
      },
    ];

    const baselines = await getBaselines(db);

    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].text.toLowerCase(), /select \* from corridor_baselines/);

    assert.equal(baselines.length, 1);
    assert.equal(baselines[0].corridor, "hormuz");
    assert.equal(baselines[0].metric, "tanker_transits");
    assert.equal(baselines[0].win, "1y");
    assert.equal(baselines[0].meanValue, 20.4);
    assert.equal(baselines[0].p10, 11);
    assert.equal(baselines[0].p90, 34);
    assert.equal(baselines[0].yoyPct, 25.0);
    assert.equal(baselines[0].sampleFrom, "2025-07-07");
    assert.equal(baselines[0].sampleTo, "2026-07-07");
    assert.equal(baselines[0].computedAt, "2026-07-07T00:00:00.000Z");
  });

  test("getBaselines maps null p10/p90/yoy_pct to null", async () => {
    const db = new StubDb();
    db.responses = [
      {
        rows: [
          {
            corridor: "cape",
            metric: "tanker_transits",
            win: "5y",
            mean_value: 9.2,
            p10: null,
            p90: null,
            yoy_pct: null,
            sample_from: "2021-07-08",
            sample_to: "2026-07-07",
            computed_at: "2026-07-07T00:00:00.000Z",
          },
        ],
      },
    ];

    const baselines = await getBaselines(db);
    assert.equal(baselines[0].p10, null);
    assert.equal(baselines[0].p90, null);
    assert.equal(baselines[0].yoyPct, null);
  });

  test("getBaselines handles Date-object period/timestamp columns (node-postgres driver shape)", async () => {
    const db = new StubDb();
    db.responses = [
      {
        rows: [
          {
            corridor: "suez",
            metric: "tanker_volume",
            win: "1y",
            mean_value: 2.9,
            p10: 1.5,
            p90: 4.0,
            yoy_pct: 10.5,
            // node-postgres parses `date` columns to a JS Date at LOCAL
            // midnight — sample_from/sample_to must format from local
            // components (see toDateStr), not toISOString().
            sample_from: new Date(2025, 6, 7), // local midnight, July 7 2025
            sample_to: new Date(2026, 6, 7), // local midnight, July 7 2026
            computed_at: new Date("2026-07-07T12:34:56.000Z"),
          },
        ],
      },
    ];

    const baselines = await getBaselines(db);
    assert.equal(baselines[0].sampleFrom, "2025-07-07");
    assert.equal(baselines[0].sampleTo, "2026-07-07");
    assert.equal(baselines[0].computedAt, "2026-07-07T12:34:56.000Z");
  });

  test("getBaselines returns an empty array when no rows exist", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [] }];

    const baselines = await getBaselines(db);
    assert.deepEqual(baselines, []);
  });

  test("getBaselineAgeDays returns null when the table is empty", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [{ newest: null }] }];

    const age = await getBaselineAgeDays(db);
    assert.equal(age, null);
  });

  test("getBaselineAgeDays returns whole days since the newest computed_at (Date object)", async () => {
    const db = new StubDb();
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    db.responses = [{ rows: [{ newest: tenDaysAgo }] }];

    const age = await getBaselineAgeDays(db);
    assert.equal(age, 10);
  });

  test("getBaselineAgeDays returns whole days since the newest computed_at (string timestamp)", async () => {
    const db = new StubDb();
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    db.responses = [{ rows: [{ newest: fiveDaysAgo }] }];

    const age = await getBaselineAgeDays(db);
    assert.equal(age, 5);
  });

  test("getBaselineAgeDays issues a max(computed_at) query", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [{ newest: null }] }];

    await getBaselineAgeDays(db);
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].text.toLowerCase(), /max\(computed_at\)/);
  });
});
