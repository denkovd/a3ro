import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeRefresh } from "../../lib/oil/refreshReport";

const startedAt = "2026-10-11T06:05:00Z";
test("provider failures remain visible even when a cycle resolves successfully", () => {
  const summary = summarizeRefresh({ startedAt, polled: [
    { sourceId: "eia", ok: true, records: 40 },
    { sourceId: "market", ok: false, records: 0 },
  ] });
  assert.equal(summary.status, "degraded");
  assert.equal(summary.records, 40);
  assert.equal(summary.failed, 1);
  assert.equal(summarizeRefresh({ startedAt, polled: [{ sourceId: "eia", ok: false, records: 0 }] }).status, "failed");
  assert.equal(summarizeRefresh(null).status, "failed");
});
test("rate-gated polls and idempotent writes are distinct from provider failure", () => {
  assert.equal(summarizeRefresh({ startedAt, polled: [{ sourceId: "eia", ok: false, records: 0, skipped: "spacing" }] }).status, "no-op");
  assert.equal(summarizeRefresh({ startedAt, polled: [{ sourceId: "eia", ok: true, records: 0 }] }).status, "healthy");
});
test("operational logs omit raw provider error and skip messages", () => {
  const provider = { sourceId: "eia", ok: false, records: 0, error: "credential in an upstream URL", skipped: "private diagnostic" };
  const summary = summarizeRefresh({ startedAt, polled: [provider] });
  assert.deepEqual(summary.providers, [{ sourceId: "eia", ok: false, records: 0, skipped: true }]);
  assert.ok(!JSON.stringify(summary).includes("credential"));
});
