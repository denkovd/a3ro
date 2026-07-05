import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { insertCorridorMetrics, getLatestCorridorMetrics } from "../src/storage/corridorRepo";
import { CorridorMetricRecord } from "../src/core/corridorTypes";
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

function makeRecord(overrides: Partial<CorridorMetricRecord> = {}): CorridorMetricRecord {
  return {
    corridor: "usgulf",
    metric: "crude_exports",
    value: 4.1235,
    unit: "Mb/d",
    periodDate: "2024-01-19",
    observedAt: "2024-01-19T00:00:00.000Z",
    source: "eia-usgulf",
    confidence: "official",
    fetchedAt: "2024-01-20T12:00:00.000Z",
    raw: { value: 4123.5, unit: "MBBL/D" },
    meta: { seriesId: "WCREXUS2", endpoint: "v2/seriesid" },
    ...overrides,
  };
}

describe("corridorRepo", () => {
  test("insertCorridorMetrics upserts n records and returns the written count", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }];

    const records = [
      makeRecord({ periodDate: "2024-01-19", value: 4.1235 }),
      makeRecord({
        periodDate: "2024-01-12", value: 4.0552, metric: "refinery_utilization", unit: "%",
      }),
    ];

    const written = await insertCorridorMetrics(db, records);

    assert.equal(written, 2);
    assert.equal(db.calls.length, 2);
  });

  test("insertCorridorMetrics passes params in column order", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }];

    const record = makeRecord();
    await insertCorridorMetrics(db, [record]);

    const call = db.calls[0];
    assert.match(call.text, /insert into corridor_metrics/i);
    assert.match(call.text, /on conflict \(corridor, metric, period_date\) do update/i);

    // column order: corridor, metric, period_date, value, unit, source_id,
    // confidence, observed_at, fetched_at, raw_value, raw_unit, meta
    assert.deepEqual(call.params, [
      record.corridor,
      record.metric,
      record.periodDate,
      record.value,
      record.unit,
      record.source,
      record.confidence,
      record.observedAt,
      record.fetchedAt,
      record.raw.value,
      record.raw.unit,
      JSON.stringify(record.meta),
    ]);
  });

  test("insertCorridorMetrics stores null meta as null (no meta on the record)", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 1 }];

    const record = makeRecord({ meta: undefined });
    await insertCorridorMetrics(db, [record]);

    const call = db.calls[0];
    assert.equal(call.params[call.params.length - 1], null);
  });

  test("insertCorridorMetrics returns 0 when nothing is written", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [], rowCount: 0 }];

    const written = await insertCorridorMetrics(db, [makeRecord()]);
    assert.equal(written, 0);
  });

  test("getLatestCorridorMetrics issues a distinct-on query and maps rows", async () => {
    const db = new StubDb();
    db.responses = [
      {
        rows: [
          {
            corridor: "usgulf",
            metric: "crude_exports",
            value: "4.1235",
            unit: "Mb/d",
            period_date: "2024-01-19",
            source_id: "eia-usgulf",
            confidence: "official",
            observed_at: "2024-01-19T00:00:00.000Z",
            fetched_at: "2024-01-20T12:00:00.000Z",
            raw_value: "4123.5",
            raw_unit: "MBBL/D",
            meta: { seriesId: "WCREXUS2", endpoint: "v2/seriesid" },
            updated_at: "2024-01-20T12:00:00.000Z",
          },
        ],
      },
    ];

    const latest = await getLatestCorridorMetrics(db);

    assert.equal(db.calls.length, 1);
    // shape asserted loosely — must contain the distinct-on clause
    assert.match(db.calls[0].text.toLowerCase(), /distinct on \(corridor, metric\)/);

    assert.equal(latest.length, 1);
    assert.equal(latest[0].corridor, "usgulf");
    assert.equal(latest[0].metric, "crude_exports");
    assert.equal(latest[0].value, 4.1235);
    assert.equal(latest[0].unit, "Mb/d");
    assert.equal(latest[0].periodDate, "2024-01-19");
    assert.equal(latest[0].source, "eia-usgulf");
    assert.equal(latest[0].observedAt, "2024-01-19T00:00:00.000Z");
    assert.equal(latest[0].updatedAt, "2024-01-20T12:00:00.000Z");
  });

  test("getLatestCorridorMetrics returns an empty array when no rows exist", async () => {
    const db = new StubDb();
    db.responses = [{ rows: [] }];

    const latest = await getLatestCorridorMetrics(db);
    assert.deepEqual(latest, []);
  });
});
