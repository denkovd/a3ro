import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runCorridorCycle } from "../src/ingest/corridorPipeline";
import { CorridorSource, CorridorSourceDescriptor } from "../src/sources/CorridorSource";
import { CorridorMetricRecord } from "../src/core/corridorTypes";
import { SourceError } from "../src/core/types";
import { QueryResultLike, Queryable } from "../src/storage/db";

/** Stub Queryable that just counts inserts (one row written per query call,
 *  mirroring how insertCorridorMetrics calls db.query once per record). */
class StubDb implements Queryable {
  queries: { text: string; params: unknown[] }[] = [];

  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    this.queries.push({ text, params });
    return { rows: [], rowCount: 1 };
  }
}

function descriptor(id: string): CorridorSourceDescriptor {
  return {
    id,
    name: id,
    confidence: "official",
    corridors: ["usgulf"],
    expectedCadenceMs: 7 * 86_400_000,
    rateLimit: { minIntervalMs: 60_000 },
  };
}

function makeRecord(overrides: Partial<CorridorMetricRecord> = {}): CorridorMetricRecord {
  return {
    corridor: "usgulf",
    metric: "crude_exports",
    value: 4.1,
    unit: "Mb/d",
    periodDate: "2024-01-19",
    observedAt: "2024-01-19T00:00:00.000Z",
    source: "healthy-source",
    confidence: "official",
    fetchedAt: "2024-01-20T00:00:00.000Z",
    raw: { value: 4100, unit: "MBBL/D" },
    ...overrides,
  };
}

class HealthySource implements CorridorSource {
  readonly descriptor = descriptor("healthy-source");
  async fetchLatest(): Promise<CorridorMetricRecord[]> {
    return [
      makeRecord({ metric: "crude_exports", periodDate: "2024-01-19" }),
      makeRecord({ metric: "refinery_utilization", periodDate: "2024-01-19", unit: "%", value: 93.4 }),
    ];
  }
}

class RateLimitedSource implements CorridorSource {
  readonly descriptor = descriptor("flaky-source");
  async fetchLatest(): Promise<CorridorMetricRecord[]> {
    throw new SourceError("flaky-source", "rate_limited", "throttled by upstream");
  }
}

class ThrowsUnknownSource implements CorridorSource {
  readonly descriptor = descriptor("buggy-source");
  async fetchLatest(): Promise<CorridorMetricRecord[]> {
    throw new Error("adapter bug: undefined is not a function");
  }
}

describe("runCorridorCycle", () => {
  test("healthy source: 2 records fetched → upserted via the stub db, report ok:true", async () => {
    const db = new StubDb();
    const report = await runCorridorCycle(db, { sources: [new HealthySource()] });

    assert.equal(report.polled.length, 1);
    const entry = report.polled[0];
    assert.equal(entry.sourceId, "healthy-source");
    assert.equal(entry.ok, true);
    assert.equal(entry.records, 2);
    assert.equal(entry.error, undefined);

    // insertCorridorMetrics calls db.query once per record
    assert.equal(db.queries.length, 2);
  });

  test("SourceError(rate_limited) source: report shows ok:false with rate_limited: prefix", async () => {
    const db = new StubDb();
    const report = await runCorridorCycle(db, { sources: [new RateLimitedSource()] });

    assert.equal(report.polled.length, 1);
    const entry = report.polled[0];
    assert.equal(entry.sourceId, "flaky-source");
    assert.equal(entry.ok, false);
    assert.equal(entry.records, 0);
    assert.ok(entry.error);
    assert.ok(entry.error!.startsWith("rate_limited:"));
  });

  test("one failing source does not affect the healthy source's result", async () => {
    const db = new StubDb();
    const report = await runCorridorCycle(db, {
      sources: [new HealthySource(), new RateLimitedSource()],
    });

    assert.equal(report.polled.length, 2);
    const healthy = report.polled.find((p) => p.sourceId === "healthy-source");
    const flaky = report.polled.find((p) => p.sourceId === "flaky-source");

    assert.ok(healthy);
    assert.equal(healthy.ok, true);
    assert.equal(healthy.records, 2);

    assert.ok(flaky);
    assert.equal(flaky.ok, false);
    assert.ok(flaky.error!.startsWith("rate_limited:"));

    // healthy source's 2 records were still upserted despite the other source failing
    assert.equal(db.queries.length, 2);
  });

  test("unknown throw (not a SourceError) is wrapped as bad_payload", async () => {
    const db = new StubDb();
    const report = await runCorridorCycle(db, { sources: [new ThrowsUnknownSource()] });

    assert.equal(report.polled.length, 1);
    const entry = report.polled[0];
    assert.equal(entry.sourceId, "buggy-source");
    assert.equal(entry.ok, false);
    assert.equal(entry.records, 0);
    assert.ok(entry.error);
    assert.ok(entry.error!.includes("bad_payload"));
  });

  test("startedAt reflects the injected now()", async () => {
    const db = new StubDb();
    const fixedNow = () => new Date("2024-06-01T00:00:00.000Z");
    const report = await runCorridorCycle(db, { sources: [], now: fixedNow });

    assert.equal(report.startedAt, "2024-06-01T00:00:00.000Z");
    assert.deepEqual(report.polled, []);
  });
});
