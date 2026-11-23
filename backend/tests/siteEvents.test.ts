import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSiteEvent, insertSiteEvent } from "../src/storage/siteEventsRepo";

test("events are validated and stripped of anything identifying", () => {
  assert.equal(cleanSiteEvent({ type: "hack", path: "/" }), null);
  assert.equal(cleanSiteEvent({ type: "page_view", path: "https://evil.example/" }), null);
  assert.equal(cleanSiteEvent(null), null);
  assert.deepEqual(cleanSiteEvent({ type: "page_view", path: "/markets?email=me@x.com#top" }), { type: "page_view", path: "/markets", target: null, resultCount: null });
  assert.equal(cleanSiteEvent({ type: "outbound", path: "/markets", target: "https://www.marketindex.com.au/asx/bhp?ref=me" })?.target, "marketindex.com.au");
  assert.equal(cleanSiteEvent({ type: "outbound", path: "/", target: "not a url" }), null);
  assert.equal(cleanSiteEvent({ type: "search", path: "/", target: "  Ras Tanura  ", resultCount: 0 })?.target, "ras tanura");
  assert.equal(cleanSiteEvent({ type: "search", path: "/", target: "me@example.com" })?.target, "[redacted]");
  assert.equal(cleanSiteEvent({ type: "search", path: "/", target: "0412345678" })?.target, "[redacted]");
  assert.equal(cleanSiteEvent({ type: "search", path: "/", target: "x", resultCount: -1 })?.resultCount, null);
});

test("insert writes only type, path, target and count", async () => {
  const calls: unknown[][] = [];
  await insertSiteEvent({ query: async (sql: string, params: unknown[] = []) => { calls.push([sql, params]); return { rows: [] }; } } as never,
    { type: "asset_view", path: "/Projects/Bull-Market-Finder", target: "NVDA", resultCount: null });
  assert.match(String(calls[0][0]), /insert into site_events \(type, path, target, result_count\)/);
  assert.deepEqual(calls[0][1], ["asset_view", "/Projects/Bull-Market-Finder", "NVDA", null]);
});
