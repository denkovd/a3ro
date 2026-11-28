/* Roadmap #11: scoring the public track record at 1/3/6 months. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, callFor, hitRates, newOutcomes, scoreCall, scoreSignalLog, type Bar, type LogRow } from "../src/trackRecord/scoring";
import type { Queryable, QueryResultLike } from "../src/storage/db";

const bars = (pairs: [string, number][]): Bar[] => pairs.map(([date, close]) => ({ date, close }));
const row = (signal: string, state: string, firedOn: string, outcomes: LogRow["outcomes"] = {}): LogRow =>
  ({ id: 1, signal, firedOn, state, previousState: null, label: state, outcomes });

test("callFor: each signal maps its states to a market direction", () => {
  assert.deepEqual(callFor("us-macro-quadrant", "GOLDILOCKS"), { symbol: "^GSPC", benchmark: "S&P 500", direction: "up" });
  assert.equal(callFor("us-macro-quadrant", "REFLATION")?.direction, "up");
  assert.equal(callFor("us-macro-quadrant", "INFLATION")?.direction, "down");
  assert.equal(callFor("us-macro-quadrant", "DEFLATION")?.direction, "down");
  assert.equal(callFor("macro-weather", "SUNNY")?.direction, "up");
  assert.equal(callFor("macro-weather", "PARTLY_CLOUDY+WATCH")?.direction, "up");
  assert.equal(callFor("macro-weather", "RAIN")?.direction, "down");
  assert.equal(callFor("macro-weather", "STORM")?.direction, "down");
  assert.deepEqual(callFor("au-pulse", "up/down"), { symbol: "AUDUSD=X", benchmark: "AUD/USD", direction: "up" });
  assert.equal(callFor("au-pulse", "down/up")?.direction, "down");
  assert.equal(callFor("au-pulse", "mixed/up")?.direction, null);
  assert.equal(callFor("something-else", "x"), null);
});

test("addMonths: clamps to the end of shorter months", () => {
  assert.equal(addMonths("2026-11-27", 1), "2026-12-27");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2027-12-15", 3), "2028-03-15");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
});

const up = { symbol: "^GSPC", benchmark: "S&P 500", direction: "up" as const };
const series = bars([["2026-11-26", 90], ["2026-11-27", 100], ["2026-12-24", 104], ["2026-12-28", 106]]);

test("scoreCall: not due yet, or bars not caught up, means no score", () => {
  assert.equal(scoreCall("2026-11-27", up, 1, series, "2026-12-26"), null);
  assert.equal(scoreCall("2026-11-27", up, 1, series.slice(0, 3), "2026-12-30"), null);
});

test("scoreCall: entry is the first close on/after the call, exit the last on/before the due date", () => {
  const o = scoreCall("2026-11-27", up, 1, series, "2026-12-30");
  assert.ok(o && !("noCall" in o));
  assert.deepEqual(o.entry, { date: "2026-11-27", close: 100 });
  assert.deepEqual(o.exit, { date: "2026-12-24", close: 104 });
  assert.equal(o.due, "2026-12-27");
  assert.equal(o.return, 0.04);
  assert.equal(o.hit, true);
  const down = scoreCall("2026-11-27", { ...up, direction: "down" }, 1, series, "2026-12-30");
  assert.ok(down && !("noCall" in down) && down.hit === false);
});

test("scoreCall: a flat close is a miss either way; a no-call state is recorded once due", () => {
  const flat = bars([["2026-11-27", 100], ["2026-12-27", 100]]);
  const o = scoreCall("2026-11-27", up, 1, flat, "2026-12-28");
  assert.ok(o && !("noCall" in o) && o.hit === false);
  assert.deepEqual(scoreCall("2026-11-27", { ...up, direction: null }, 1, [], "2026-12-28"), { noCall: true, scoredOn: "2026-12-28" });
});

test("newOutcomes: never rescored, only missing horizons added", () => {
  const existing = { "1m": { noCall: true as const, scoredOn: "2026-12-28" } };
  const add = newOutcomes(row("us-macro-quadrant", "GOLDILOCKS", "2026-11-27", existing), series, "2026-12-30");
  assert.deepEqual(Object.keys(add), []);
});

test("hitRates: counts scored calls per horizon and leaves no-calls out", () => {
  const scored = (ret: number, direction: "up" | "down") => ({
    symbol: "^GSPC", direction, due: "x", scoredOn: "x", entry: { date: "a", close: 1 }, exit: { date: "b", close: 1 },
    return: ret, hit: direction === "up" ? ret > 0 : ret < 0,
  });
  const rows = [
    row("macro-weather", "SUNNY", "2026-01-01", { "1m": scored(0.02, "up") }),
    row("macro-weather", "RAIN", "2026-02-01", { "1m": scored(0.01, "down") }),
    row("au-pulse", "mixed/up", "2026-03-01", { "1m": { noCall: true, scoredOn: "x" } }),
  ];
  const [m1, m3] = hitRates(rows);
  assert.equal(m1.scored, 2);
  assert.equal(m1.hits, 1);
  assert.equal(m1.rate, 0.5);
  assert.ok(Math.abs((m1.avgReturn ?? 0) - 0.005) < 1e-9); // +2% right, -1% wrong
  assert.equal(m3.scored, 0);
  assert.equal(m3.rate, null);
});

test("scoreSignalLog: writes due horizons with a merge that keeps existing keys", async () => {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const db: Queryable = {
    async query(sql: string, params?: unknown[]): Promise<QueryResultLike> {
      calls.push({ sql, params });
      if (sql.includes("from signal_log")) {
        return { rows: [{ id: 5, signal: "us-macro-quadrant", fired_on: "2026-11-27", state: "GOLDILOCKS", previous_state: null, label: "G", outcomes: {} }] } as QueryResultLike;
      }
      if (sql.includes("from market_bars")) {
        return { rows: series.map((b) => ({ date: b.date, open: b.close, high: b.close, low: b.close, close: b.close })) } as QueryResultLike;
      }
      return { rows: [] } as unknown as QueryResultLike;
    },
  } as Queryable;
  const res = await scoreSignalLog(db, { now: new Date("2026-12-30T07:15:00Z") });
  assert.deepEqual(res, { scored: 1, rows: 1, errors: [] });
  const update = calls.find((c) => c.sql.startsWith("update signal_log"));
  assert.ok(update);
  assert.match(update.sql, /\$2::jsonb \|\| outcomes/);
  assert.deepEqual(Object.keys(JSON.parse(String(update.params?.[1]))), ["1m"]);
});
