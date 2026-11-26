import test from "node:test";
import assert from "node:assert/strict";
import { ago, buildExecuteNewsletter, countdown, sydneyLabel } from "../src/execute/format";
import { getExecuteRecord, listExecuteUpcoming } from "../src/storage/executeRepo";
import type { ExecuteTrade, ExecuteUpcoming } from "../src/execute/types";
import type { Queryable } from "../src/storage/db";

const NOW = new Date("2026-12-03T00:00:00Z");

const event = (over: Partial<ExecuteUpcoming> = {}): ExecuteUpcoming => ({
  id: 1, kind: "FOMC", eventTime: "2026-12-09T19:00:00.000Z", armTime: "2026-12-08T19:00:00.000Z",
  signal: { eventId: 1, snapshotAt: NOW.toISOString(), asOfBar: NOW.toISOString(), state: "preview", btcPrice: 60_000, move7dPct: -5.2, z: -0.89, zThreshold: 0.75, lean: "long", checklist: null },
  ...over,
});

const closed = (over: Partial<ExecuteTrade> = {}): ExecuteTrade => ({
  mode: "paper", eventKind: "CPI", eventTime: "2026-11-10T13:30:00.000Z", armedAt: "2026-11-09T13:00:00.000Z", side: "long", riskPct: 3, z: -0.96, move7dPct: -4,
  levels: null, entries: [], exits: [], stop: null, pnlPct: -3.22, status: "closed", skipReason: null, openedAt: null, closedAt: "2026-11-11T02:00:00.000Z", ...over,
});

test("Sydney labels use Australian daylight time", () => {
  // 19:00 UTC on 9 Dec = 6:00am AEDT on 10 Dec
  assert.match(sydneyLabel("2026-12-09T19:00:00Z"), /10 Dec.*6:00\s?am/i);
});

test("countdown and ago", () => {
  assert.equal(countdown("2026-12-04T03:30:00Z", NOW), "1d 3h");
  assert.equal(countdown("2026-12-03T00:20:00Z", NOW), "20m");
  assert.equal(countdown("2026-12-02T00:00:00Z", NOW), "now");
  assert.equal(ago("2026-12-02T21:00:00Z", NOW), "3h ago");
});

test("newsletter block only when an event is inside 7 days", () => {
  assert.equal(buildExecuteNewsletter([event()], [], NOW)?.free.includes("FOMC"), true);
  assert.equal(buildExecuteNewsletter([event({ eventTime: "2026-12-10T00:00:01Z" })], [], NOW), null);
  assert.equal(buildExecuteNewsletter([event({ eventTime: "2026-12-02T00:00:00Z" })], [], NOW), null);
});

test("free edition has dates only; premium adds lean, arming and the last trade", () => {
  const block = buildExecuteNewsletter([event()], [closed(), closed({ eventTime: "2026-10-14T12:30:00.000Z", closedAt: "2026-10-15T00:00:00.000Z", pnlPct: 2 })], NOW)!;
  assert.ok(!/z |lean|long|short|%/i.test(block.free.replace("Leans", "")), block.free);
  assert.match(block.premium, /z -0\.89 → fade the sell-off \(long\)/);
  assert.match(block.premium, /Arms .*24h before/);
  assert.match(block.premium, /Last forward paper trade: CPI 2026-11-10, long, -3\.22%/);
  assert.match(block.premium, /not financial advice/);
});

test("premium edition says when there is no forward trade yet", () => {
  assert.match(buildExecuteNewsletter([event()], [], NOW)!.premium, /no closed trades yet/);
});

function stubDb(handler: (sql: string, params: unknown[]) => Record<string, unknown>[]): Queryable & { calls: string[] } {
  const calls: string[] = [];
  return { calls, query: async (sql: string, params: unknown[] = []) => { calls.push(sql); return { rows: handler(sql, params) }; } };
}

test("upcoming events join the latest signal and compute arm time", async () => {
  const db = stubDb(sql => sql.includes("from public.execute_events")
    ? [{ id: 7, kind: "CPI", event_time: "2026-12-10T13:30:00Z" }]
    : [{ event_id: 7, snapshot_at: "2026-12-03T00:15:00Z", as_of_bar: "2026-12-02T23:00:00Z", state: "preview", btc_price: "61000.5", move_7d_pct: "3.1", z: "0.81", z_threshold: "0.75", lean: "short", checklist: null }]);
  const [e] = await listExecuteUpcoming(db, NOW);
  assert.equal(e.armTime, "2026-12-09T13:30:00.000Z");
  assert.equal(e.signal?.lean, "short");
  assert.equal(e.signal?.z, 0.81);
  assert.match(db.calls[1], /distinct on \(event_id\)/);
});

test("record reads are scoped to one mode and the frozen strategy version", async () => {
  const seen: unknown[][] = [];
  const db = stubDb((_sql, params) => { seen.push(params); return []; });
  const rec = await getExecuteRecord(db, "paper");
  assert.equal(rec.stats, null);
  assert.deepEqual(seen, [["paper", "v1.1"], ["paper", "v1.1"]]);
});
