import { test } from "node:test";
import assert from "node:assert/strict";
import { errorFingerprint, recordAppError, redactErrorMessage } from "../src/storage/errorLogRepo";

test("credentials are redacted before an error is stored", () => {
  const out = redactErrorMessage("connect failed postgres://user:pa55@db.example:5432/postgres https://api.x.com/q?series=1&api_key=abc123&x=2 Bearer eyJhbGciOiJIUzI1NiJ9.payload sk_live_ABCDEFGHIJKLMNOPQRSTUV");
  for (const secret of ["pa55", "abc123", "eyJhbGciOiJIUzI1NiJ9", "sk_live_ABCDEFGHIJKLMNOPQRSTUV"]) assert.ok(!out.includes(secret), `leaked ${secret}: ${out}`);
  assert.match(out, /series=1/);
  assert.ok(redactErrorMessage("x".repeat(2000)).length <= 500);
});

test("repeats of the same error share a fingerprint; different errors don't", () => {
  assert.equal(errorFingerprint("timeout after 30012ms at 2026-11-23T02:59:02.115Z"), errorFingerprint("timeout after 30998ms at 2026-11-24T02:59:01.004Z"));
  assert.equal(errorFingerprint("OECD HTTP 500"), errorFingerprint("OECD HTTP 500"));
  assert.notEqual(errorFingerprint("OECD HTTP 500"), errorFingerprint("OECD HTTP 429"));
});

test("recordAppError upserts on (source, fingerprint) with a redacted message", async () => {
  const calls: unknown[][] = [];
  await recordAppError({ query: async (sql: string, params: unknown[] = []) => { calls.push([sql, params]); return { rows: [] }; } } as never,
    { source: "cron:test", message: "failed postgres://u:secret@h/db", status: 503 });
  const [sql, params] = calls[0] as [string, unknown[]];
  assert.match(sql, /on conflict \(source, fingerprint\) do update set last_seen = now\(\), count = app_errors\.count \+ 1/);
  assert.equal(params[0], "cron:test");
  assert.ok(!String(params[2]).includes("secret"));
  assert.equal(params[3], 503);
});
