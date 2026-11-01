import assert from "node:assert/strict";
import { test } from "node:test";
import { getJsonForSource, getResponseForSource } from "../src/sources/http";
import { SourceError } from "../src/core/types";

test("source reader rejects declared and streamed oversized responses", async (t) => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(9)); },
      cancel() { cancelled = true; },
    });
    const mock = t.mock.method(globalThis, "fetch", async () => new Response(stream, {
      headers: declared ? { "content-length": "9" } : {},
    }));
    await assert.rejects(getResponseForSource("test", "https://example.test/feed", { maxResponseBytes: 8 }),
      (e: unknown) => e instanceof SourceError && e.kind === "bad_payload");
    assert.equal(cancelled, true);
    mock.mock.restore();
  }
});

test("source timeout covers a stalled body after successful headers", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  })));
  await assert.rejects(getResponseForSource("test", "https://example.test/feed", { timeoutMs: 20 }),
    (e: unknown) => e instanceof SourceError && e.kind === "network" && /timeout/.test(e.message));
  assert.equal(cancelled, true);
});

test("bounded JSON responses preserve parsing and HTTP rate-limit classification", async (t) => {
  let attempt = 0;
  t.mock.method(globalThis, "fetch", async () => ++attempt === 1
    ? Response.json({ ok: true })
    : new Response("limited", { status: 429, headers: { "retry-after": "3" } }));
  assert.deepEqual(await getJsonForSource("test", "https://example.test/feed"), { ok: true });
  await assert.rejects(getJsonForSource("test", "https://example.test/feed"),
    (e: unknown) => e instanceof SourceError && e.kind === "rate_limited" && e.retryAfterMs === 3000);
});
