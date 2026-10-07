import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadUtility(name) {
  const source = await readFile(new URL(`../app/components/projects/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { fetchMarketSnapshot } = await loadUtility("marketFetch");
const { animateWhenVisible } = await loadUtility("visibleAnimation");

function setGlobal(t, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  });
}

test("concurrent snapshots share one request and each has an independent JSON body", async (t) => {
  setGlobal(t, "window", {});
  let resolve;
  const fetch = t.mock.method(globalThis, "fetch", () => new Promise((r) => { resolve = r; }));
  const url = "/api/bull/latest?strategy=concurrent";
  const first = fetchMarketSnapshot(url);
  const second = fetchMarketSnapshot(url);
  assert.equal(fetch.mock.callCount(), 1);
  resolve(Response.json({ count: 42 }));
  const responses = await Promise.all([first, second]);
  assert.deepEqual(await Promise.all(responses.map((r) => r.json())), [{ count: 42 }, { count: 42 }]);
  assert.deepEqual(await (await fetchMarketSnapshot(url)).json(), { count: 42 });
  assert.equal(fetch.mock.callCount(), 1);
});

test("cached snapshots expire after 15 seconds and query values stay separate", async (t) => {
  setGlobal(t, "window", {});
  let now = 100_000;
  t.mock.method(Date, "now", () => now);
  const fetch = t.mock.method(globalThis, "fetch", async (url) => Response.json({ url }));
  const url = "/api/bull/latest?strategy=expiry";
  await fetchMarketSnapshot(url);
  now += 14_999;
  await fetchMarketSnapshot(url);
  assert.equal(fetch.mock.callCount(), 1);
  now += 1;
  await fetchMarketSnapshot(url);
  await fetchMarketSnapshot("/api/bull/latest?strategy=other");
  assert.equal(fetch.mock.callCount(), 3);
});

test("HTTP and network failures are retried instead of cached", async (t) => {
  setGlobal(t, "window", {});
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    if (attempts === 1) return new Response("unavailable", { status: 503 });
    if (attempts === 2) throw new Error("offline");
    return Response.json({ recovered: true });
  });
  const url = "/api/regime/latest?test=failures";
  assert.equal((await fetchMarketSnapshot(url)).status, 503);
  await assert.rejects(fetchMarketSnapshot(url), /offline/);
  assert.deepEqual(await (await fetchMarketSnapshot(url)).json(), { recovered: true });
  assert.equal(attempts, 3);
});

test("account endpoints and external feeds bypass the cache", async (t) => {
  setGlobal(t, "window", {});
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  for (const url of ["/api/portfolio/positions", "https://example.com/api/gold/latest"]) {
    await fetchMarketSnapshot(url);
    await fetchMarketSnapshot(url);
  }
  assert.equal(fetch.mock.callCount(), 4);
});

test("server rendering bypasses browser snapshot sharing", async (t) => {
  setGlobal(t, "window", undefined);
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  await fetchMarketSnapshot("/api/gold/latest");
  await fetchMarketSnapshot("/api/gold/latest");
  assert.equal(fetch.mock.callCount(), 2);
});

test("preview frames stop offscreen or in hidden tabs and resume without duplicate loops", (t) => {
  let onIntersection;
  let onVisibility;
  let disconnected = false;
  let nextId = 1;
  const frames = new Map();
  const doc = {
    hidden: false,
    addEventListener: (type, listener) => { onVisibility = listener; },
    removeEventListener: (type, listener) => { assert.equal(listener, onVisibility); onVisibility = undefined; },
  };
  setGlobal(t, "document", doc);
  setGlobal(t, "IntersectionObserver", class {
    constructor(listener) { onIntersection = listener; }
    observe() {}
    disconnect() { disconnected = true; }
  });
  setGlobal(t, "requestAnimationFrame", (callback) => { const id = nextId++; frames.set(id, callback); return id; });
  setGlobal(t, "cancelAnimationFrame", (id) => frames.delete(id));
  let draws = 0;
  const stop = animateWhenVisible({}, () => draws++);
  assert.equal(frames.size, 0);
  onIntersection([{ isIntersecting: true }]);
  onVisibility();
  assert.equal(frames.size, 1);
  const [id, frame] = frames.entries().next().value;
  frames.delete(id);
  frame(100);
  assert.equal(draws, 1);
  assert.equal(frames.size, 1);
  doc.hidden = true;
  onVisibility();
  assert.equal(frames.size, 0);
  onIntersection([{ isIntersecting: false }]);
  doc.hidden = false;
  onVisibility();
  assert.equal(frames.size, 0);
  onIntersection([{ isIntersecting: true }]);
  assert.equal(frames.size, 1);
  stop();
  assert.equal(frames.size, 0);
  assert.equal(disconnected, true);
  assert.equal(onVisibility, undefined);
});
