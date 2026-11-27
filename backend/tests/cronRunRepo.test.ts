import { test } from "node:test";
import assert from "node:assert/strict";
import { recordCronRun, summarizeCronReport } from "../src/storage/cronRunRepo";
import { ageFreshness, groupRevisions, suddenJump } from "../src/storage/dataHealthRepo";

test("Australia Watch: per-indicator map with one failure is degraded and lists the failure first", () => {
  const s = summarizeCronReport({ startedAt: "x", results: { cpi: { written: 3 }, oecd_cli: { written: 0, error: "OECD HTTP 429" } }, degraded: ["oecd_cli"] }, 200);
  assert.equal(s.status, "degraded");
  assert.deepEqual(s.results[0], { name: "oecd_cli", state: "failed", detail: "OECD HTTP 429" });
  assert.equal(s.results.length, 2);
  assert.match(s.error ?? "", /1 of 2 series failed; first: oecd_cli: OECD HTTP 429/);
});

test("ingest: provider lists and failed sub-cycles are read; summary and panel are skipped", () => {
  const s = summarizeCronReport({
    startedAt: "x",
    polled: [{ sourceId: "eia", ok: true, records: 4 }, { sourceId: "yfinance", ok: false, records: 0, skipped: "cooldown" }],
    corridors: { polled: [{ sourceId: "portwatch", ok: false, records: 0 }] },
    gold: { error: "GoldAPI timeout" },
    summary: { prices: { providers: [{ sourceId: "eia", ok: false }] } },
    panel: [{ series: "DGS10", ok: false }],
  }, 200);
  const names = s.results.map((r) => `${r.name}:${r.state}`).sort();
  assert.deepEqual(names, ["corridors/portwatch:failed", "eia:ok", "gold:failed", "yfinance:skipped"]);
  assert.equal(s.status, "degraded");
});

test("dividend signal results use source + archived", () => {
  const s = summarizeCronReport({ results: [{ source: "eia", archived: true, error: null }, { source: "fred", archived: false, error: "HTTP 500" }] }, 503);
  assert.equal(s.status, "failed");
  assert.deepEqual(s.results.map((r) => r.state), ["failed", "ok"]);
});

test("a clean run is ok; a non-JSON 500 is failed with the status as the error", () => {
  assert.deepEqual(summarizeCronReport({ written: 1, runDate: "2026-11-23" }, 200), { status: "ok", results: [], error: null });
  assert.deepEqual(summarizeCronReport(null, 500), { status: "failed", results: [], error: "HTTP 500" });
  assert.equal(summarizeCronReport({ error: "no snapshot written" }, 200).status, "degraded");
});

test("stored details are redacted and capped", () => {
  const s = summarizeCronReport({ results: { x: { error: `failed https://api.x.com/?api_key=SECRET123 ${"y".repeat(900)}` } } }, 200);
  assert.ok(!JSON.stringify(s).includes("SECRET123"));
  assert.ok((s.results[0].detail ?? "").length <= 200);
});

test("recordCronRun inserts the run and trims rows older than 90 days", async () => {
  const calls: [string, unknown[]][] = [];
  await recordCronRun({ query: async (sql: string, params: unknown[] = []) => { calls.push([sql, params]); return { rows: [] }; } } as never,
    { job: "macro", startedAt: "2026-11-23T07:15:00.000Z", durationMs: 1234.6, httpStatus: 200, status: "ok", results: [{ name: "a", state: "ok" }], error: null });
  assert.match(calls[0][0], /insert into cron_runs/);
  assert.deepEqual(calls[0][1], ["macro", "2026-11-23T07:15:00.000Z", 1235, "ok", 200, '[{"name":"a","state":"ok"}]', null]);
  assert.match(calls[1][0], /delete from cron_runs where started_at < now\(\) - make_interval\(days => \$1\)/);
  assert.deepEqual(calls[1][1], [90]);
});

test("ageFreshness tiers: 1.5x fresh, 3x aging, beyond stale, none missing", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  assert.equal(ageFreshness(hoursAgo(30), now), "fresh");
  assert.equal(ageFreshness(hoursAgo(60), now), "aging");
  assert.equal(ageFreshness(hoursAgo(80), now), "stale");
  assert.equal(ageFreshness(null, now), "missing");
});

test("suddenJump flags only moves far outside the usual range", () => {
  const steady = [10, 10.1, 10, 10.2, 10.1, 10.3, 10.2, 10.3, 10.4, 10.3];
  assert.equal(suddenJump(steady), null);
  const jump = suddenJump([...steady, 12]);
  assert.ok(jump && jump.change > 1.6 && jump.typical < 0.2);
  assert.equal(suddenJump([1, 2, 3]), null, "too little history");
  assert.equal(suddenJump([5, 5, 5, 5, 5, 5, 5, 5, 9]), null, "flat series has no typical move to compare against");
});

test("suddenJump judges step series (cash rate) against the step, not the near-zero usual move", () => {
  // RBA F1.1 monthly averages through 2026: a hike effective about 30 Sep shows as Sep +0.01, Oct +0.24.
  const cash = [3.85, 3.85, 3.96, 4.10, 4.31, 4.35, 4.35, 4.35, 4.36, 4.60];
  assert.ok(suddenJump(cash), "without a step the 25 bp hike is flagged (usual move ~0.005)");
  assert.equal(suddenJump(cash, { step: 0.25 }), null, "one decision is normal");
  assert.equal(suddenJump([...cash, 5.1], { step: 0.25 }), null, "two steps (50 bp) in a month is still normal");
  const big = suddenJump([...cash, 5.35], { step: 0.25 });
  assert.ok(big && Math.abs(big.change - 0.75) < 1e-9 && big.step === 0.25, "three steps in a month is flagged");
  assert.ok(suddenJump([...cash, 3.6], { step: 0.25 }), "large cuts are flagged too");
  assert.equal(suddenJump([4.6], { step: 0.25 }), null, "no change to judge yet");
});

test("revisions group per indicator per day, keeping the largest change", () => {
  const at = "2026-11-20T02:15:00.000Z";
  const g = groupRevisions([
    { indicator: "underemployment", period: "2026-09", from: 6.33, to: 6.31, at },
    { indicator: "underemployment", period: "2025-10", from: 5.7, to: 5.76, at },
    { indicator: "underemployment", period: "2026-01", from: 5.92, to: 5.92, at },
    { indicator: "cpi", period: "2026-09", from: 3.1, to: 3.2, at: "2026-11-21T02:15:00.000Z" },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].indicator, "cpi");
  assert.deepEqual([g[1].count, g[1].earliest, g[1].latest, g[1].largest.period], [3, "2025-10", "2026-09", "2025-10"]);
});
