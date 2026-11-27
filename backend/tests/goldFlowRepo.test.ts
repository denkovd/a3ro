import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { upsertGoldFlowMetrics, GoldFlowMetricInput } from "../src/storage/goldFlowRepo";
import { QueryResultLike, Queryable } from "../src/storage/db";

class StubDb implements Queryable {
  calls: { text: string; params: unknown[] }[] = [];
  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    this.calls.push({ text, params });
    return { rows: [], rowCount: Array.isArray(params[0]) ? params[0].length : 0 };
  }
}

const row = (periodDate: string, value: number, extra: Partial<GoldFlowMetricInput> = {}): GoldFlowMetricInput => ({
  locus: "etf_us", metric: "etf_holdings_t", periodDate, value, unit: "tonnes", source: "wgc-etf", ...extra,
});

describe("upsertGoldFlowMetrics", () => {
  test("writes many rows in one set-based statement per 500, skipping non-finite values", async () => {
    const db = new StubDb();
    const rows = Array.from({ length: 1200 }, (_, i) => row(new Date(Date.UTC(2004, 0, 1 + 7 * i)).toISOString().slice(0, 10), i));
    rows.push(row("2030-01-01", Number.NaN));
    const n = await upsertGoldFlowMetrics(db, rows);
    assert.equal(n, 1200);
    assert.deepEqual(db.calls.map((c) => (c.params[0] as unknown[]).length), [500, 500, 200]);
    assert.match(db.calls[0].text, /unnest\(/i);
    assert.match(db.calls[0].text, /on conflict \(locus, metric, period_date\) do update/i);
  });

  test("keeps the last row per key and serialises meta as JSON", async () => {
    const db = new StubDb();
    await upsertGoldFlowMetrics(db, [row("2026-11-20", 1), row("2026-11-20", 2, { meta: { region: "North America" } })]);
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params[3], [2]);
    assert.deepEqual(db.calls[0].params[6], [JSON.stringify({ region: "North America" })]);
  });

  test("sends nothing for an empty list", async () => {
    const db = new StubDb();
    assert.equal(await upsertGoldFlowMetrics(db, []), 0);
    assert.equal(db.calls.length, 0);
  });
});
