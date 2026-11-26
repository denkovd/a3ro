/* Roadmap #11 (track record) and #21 (data as of). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideLog, logSignal, macroReadings, pulseReading, type LoggedSignal, type SignalReading } from "../src/trackRecord/signalLog";
import { moduleStatusFromJobs, latestOf } from "../src/storage/dataStatusRepo";
import type { Pulse } from "../src/australia/pulse";
import type { MacroSnapshotRow } from "../src/storage/macroRepo";
import type { Queryable, QueryResultLike } from "../src/storage/db";

const reading = (state: string): SignalReading => ({ signal: "au-pulse", state, label: state, detail: {} });
const row = (state: string, firedOn: string, previousState: string | null = null, id = 1): LoggedSignal =>
  ({ id, signal: "au-pulse", firedOn, state, previousState });

test("decideLog: first reading is logged", () => {
  assert.deepEqual(decideLog(reading("up/down"), null, "2026-11-27"), { kind: "insert", previousState: null });
});

test("decideLog: an unchanged state writes nothing", () => {
  assert.deepEqual(decideLog(reading("up/down"), row("up/down", "2026-11-01"), "2026-11-27"), { kind: "none" });
});

test("decideLog: a change on a later day is a new row that remembers the old state", () => {
  assert.deepEqual(decideLog(reading("down/down"), row("up/down", "2026-11-01"), "2026-11-27"), { kind: "insert", previousState: "up/down" });
});

test("decideLog: a second change on the same day rewrites that day's row; flipping back removes it", () => {
  assert.deepEqual(decideLog(reading("mixed/up"), row("down/down", "2026-11-27", "up/down", 7), "2026-11-27"), { kind: "update", id: 7 });
  assert.deepEqual(decideLog(reading("up/down"), row("down/down", "2026-11-27", "up/down", 7), "2026-11-27"), { kind: "delete", id: 7 });
});

test("logSignal writes through the fake DB", async () => {
  const rows: Record<string, unknown>[] = [];
  const db: Queryable = {
    async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
      if (text.startsWith("select id, signal")) return { rows: rows.filter((r) => r.signal === params[0]).slice(-1) };
      if (text.startsWith("insert into signal_log")) {
        rows.push({ id: rows.length + 1, signal: params[0], fired_on: params[1], state: params[2], previous_state: params[3] });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  assert.equal(await logSignal(db, reading("up/down"), "2026-11-27"), "insert");
  assert.equal(await logSignal(db, reading("up/down"), "2026-11-28"), "none");
  assert.equal(await logSignal(db, reading("down/down"), "2026-11-29"), "insert");
  assert.deepEqual(rows.map((r) => [r.state, r.previous_state]), [["up/down", null], ["down/down", "up/down"]]);
});

test("pulseReading: needs both axes", () => {
  const base = {
    engineVersion: 3, asOf: "", signals: [], pillars: [], moved: [], leads: {},
    growth: { up: 4, down: 1, steady: 0, excluded: [], members: [], share: 0.8 },
    inflation: { up: 1, down: 3, steady: 0, excluded: [], members: [], share: 0.25 },
    coverage: { primary: 12, withData: 11, stale: [], missing: [] },
  };
  const ok = pulseReading({ ...base, quadrant: { growth: "up", inflation: "down", label: "Leading indicators improving, price pressure easing" } } as Pulse);
  assert.equal(ok?.state, "up/down");
  assert.equal(ok?.detail.growthShare, 0.8);
  assert.equal(pulseReading({ ...base, quadrant: { growth: null, inflation: "down", label: "Not enough current readings" } } as Pulse), null);
});

test("macroReadings: regime and weather, nothing while pending", () => {
  const snap = {
    runDate: "2026-11-26", quadrant: "GOLDILOCKS", regimeHeadline: "Growth up, inflation down",
    growthYoy: 2, growthMomentum: 0.1, inflationYoy: 2.5, inflationMomentum: -0.1, regimeCoverage: 1,
    marketRegime: "GOLDILOCKS", marketRiskOn: 0.7, liquidityScore: 30, liquidityLegs: [],
  } as unknown as MacroSnapshotRow;
  const reads = macroReadings(snap);
  assert.deepEqual(reads.map((r) => r.signal), ["us-macro-quadrant", "macro-weather"]);
  assert.equal(reads[0].state, "GOLDILOCKS");
  assert.equal(macroReadings({ ...snap, quadrant: "PENDING", marketRegime: "PENDING" } as MacroSnapshotRow).some((r) => r.signal === "us-macro-quadrant"), false);
});

test("data status: a module takes the latest of its jobs; modules with no run are left out", () => {
  assert.equal(latestOf([null, "2026-11-26T02:20:00.000Z", "2026-11-26T03:01:00.000Z"]), "2026-11-26T03:01:00.000Z");
  const s = moduleStatusFromJobs(
    { "australia-watch": "2026-11-26T02:20:00.000Z", "australia-oecd": "2026-11-26T03:01:00.000Z", macro: "2026-11-26T07:16:00.000Z" },
    { trend: "2026-11-25T00:00:00.000Z", earnings: null },
  );
  assert.equal(s.australia.updatedAt, "2026-11-26T03:01:00.000Z");
  assert.equal(s.regime.updatedAt, "2026-11-26T07:16:00.000Z");
  assert.equal(s.trend.updatedAt, "2026-11-25T00:00:00.000Z");
  assert.equal(s.commodity, undefined);
  assert.equal(s.earnings, undefined);
});
