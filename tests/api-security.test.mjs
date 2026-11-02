import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

// Run actual route handlers with isolated storage dependencies. No credentials,
// database connection or live ingestion is needed to exercise failure paths.
function loadModule(relativePath, stubs = {}, cache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const localRequire = (id) => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id.startsWith("node:")) return require(id);
    if (id.startsWith(".")) return loadModule(path.resolve(path.dirname(filename), `${id}.ts`), stubs, cache);
    throw new Error(`Unexpected dependency: ${id}`);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}

function setEnv(t, key, value) {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

const SECRET_ERROR = "database postgres://private-user:private-password@internal-db.example secret-api-key";
const failedDb = {
  createDb: async () => { throw new Error(SECRET_ERROR); },
  isBenchmark: (value) => value === "WTI",
  isCorridorId: (value) => value === "hormuz",
};
const publicRoutes = [
  ["australia-watch/latest"], ["australia-watch/series", "indicator=unemployment_rate"],
  ["btc/history"], ["btc/latest"], ["btc/loci"], ["btc/loci/series", "locus=coinbase&metric=price"],
  ["bull/latest"], ["bull/transitions"], ["gold/latest"], ["gold/loci"],
  ["gold/loci/series", "locus=comex&metric=comex_registered_toz"], ["macro/latest"],
  ["oil/alerts"], ["oil/baselines"], ["oil/corridors"],
  ["oil/corridors/series", "corridor=hormuz&metric=tanker_transits_7d"],
  ["oil/latest"], ["oil/macro"], ["oil/scores"],
  ["oil/series", "benchmark=WTI&from=2026-01-01&to=2026-02-01"], ["oil/tape"],
];
for (const [route, query = ""] of publicRoutes) {
  test(`${route} does not expose database exception details`, async () => {
    const { GET } = loadModule(`app/api/${route}/route.ts`, { "@a3ro/oil-backend": failedDb, "next/cache": { unstable_cache: fn => fn } });
    const response = await GET(new Request(`https://a3ro.test/api/${route}?${query}`));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Request could not be completed" });
  });
}

test("leaderboard retains error codes without exposing connection details", async () => {
  for (const error of [new Error(SECRET_ERROR), new Error(`ECONNREFUSED ${SECRET_ERROR}`)]) {
    const { GET } = loadModule("app/api/leaderboard/earnings-beats/route.ts", {
      "./db": { createPool: async () => { throw error; } },
    });
    const response = await GET(new Request("https://a3ro.test/api/leaderboard/earnings-beats"));
    const body = await response.json();
    assert.equal(response.status, error.message.startsWith("ECONNREFUSED") ? 503 : 500);
    assert.ok(["DB_UNAVAILABLE", "INTERNAL"].includes(body.error.code));
    assert.doesNotMatch(body.error.message, /private-|internal-db|secret-api-key/);
  }
});

test("Australia successful snapshots do not expose persisted errors", async () => {
  const { GET } = loadModule("app/api/australia-watch/latest/route.ts", {
    "@a3ro/oil-backend": {
      createDb: async () => ({}), getAustraliaObservations: async () => [],
      getAustraliaFetchStates: async () => ({ unemployment_rate: { health: "degraded", retrievedAt: null, error: SECRET_ERROR } }),
    },
    "../../../../backend/src/sources/absReleases": { fetchAustraliaReleaseSchedules: async () => ({}) },
    "next/cache": { unstable_cache: fn => fn },
  });
  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.fetchStates.unemployment_rate.health, "degraded");
  assert.equal(body.fetchStates.unemployment_rate.error, "Official source could not be verified on this attempt");
});

test("Australia dedicated cron authenticates before opening the database", async (t) => {
  setEnv(t, "CRON_SECRET", "regression-secret");
  let calls = 0;
  const { GET } = loadModule("app/api/cron/australia-watch/route.ts", {
    "@a3ro/oil-backend": {
      createDb: async () => { calls++; return {}; },
      runAustraliaWatchCycle: async () => ({ startedAt: "2026-11-02T02:15:00Z", results: { unemployment_rate: { written: 132 } } }),
    },
  });
  assert.equal((await GET(new Request("https://a3ro.test/api/cron/australia-watch"))).status, 401);
  assert.equal(calls, 0);
  assert.equal((await GET(new Request("https://a3ro.test/api/cron/australia-watch", { headers: { authorization: "Bearer regression-secret" } }))).status, 200);
  assert.equal(calls, 1);
});

test("Australia dedicated cron surfaces partial source failure", async (t) => {
  setEnv(t, "CRON_SECRET", "regression-secret");
  const { GET } = loadModule("app/api/cron/australia-watch/route.ts", {
    "@a3ro/oil-backend": {
      createDb: async () => ({}),
      runAustraliaWatchCycle: async () => ({ results: { hours_worked: { written: 0, error: "ABS HTTP 503" } } }),
    },
  });
  const response = await GET(new Request("https://a3ro.test/api/cron/australia-watch", { headers: { authorization: "Bearer regression-secret" } }));
  assert.equal(response.status, 502);
});

test("Horizon successful snapshots do not expose persisted errors", async (t) => {
  setEnv(t, "DATABASE_URL", "test-only");
  const { GET } = loadModule("app/api/horizon/latest/route.ts", {
    "next/cache": { unstable_cache: (fn) => fn },
    "../../../../backend/src/horizon/indicators": { HORIZON_SOURCES: ["test"] },
    "../../../../backend/src/horizon/engine": { buildHorizonSnapshot: (_datasets, states) => ({ sources: states }) },
    "../../../../backend/src/horizon/sources": { fetchHorizonDataset: async () => { throw new Error("must use stored data"); } },
    "../../../../backend/src/storage/db": { createDb: async () => ({}) },
    "../../../../backend/src/storage/horizonRepo": { getStoredHorizon: async () => ({
      datasets: [{ source: "test" }], states: [{ source: "test", health: "healthy", checkedAt: new Date().toISOString(), error: SECRET_ERROR }],
    }) },
  });
  const body = await (await GET()).json();
  assert.equal(body.sources[0].error, "Official source could not be verified on this attempt");
});

test("cron auth fails closed in production and development, including blank secrets", (t) => {
  const { requireCronAuth } = loadModule("app/api/_lib/cronAuth.ts");
  for (const mode of ["production", "development", "test"]) {
    setEnv(t, "NODE_ENV", mode);
    for (const secret of [undefined, "", "   "]) {
      setEnv(t, "CRON_SECRET", secret);
      assert.equal(requireCronAuth(new Request("https://a3ro.test/api/cron/ingest")).status, 503);
    }
  }
});

test("cron auth requires an exact bearer token", (t) => {
  setEnv(t, "CRON_SECRET", "regression-secret");
  const { requireCronAuth } = loadModule("app/api/_lib/cronAuth.ts");
  for (const authorization of ["", "regression-secret", "Bearer regression-secrex", "Bearer wrong", "bearer regression-secret"]) {
    assert.equal(requireCronAuth(new Request("https://a3ro.test", { headers: { authorization } })).status, 401);
  }
  assert.equal(requireCronAuth(new Request("https://a3ro.test", { headers: { authorization: "Bearer regression-secret" } })), null);
});

function leadRequest(body = JSON.stringify({ email: "person@example.com" }), headers = {}) {
  return new Request("https://a3ro.test/api/leads", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body,
  });
}

test("lead body accepts the existing contact form request", async () => {
  const { readLeadRequest } = loadModule("app/api/_lib/leadRequest.ts");
  const payload = { email: "person@example.com", message: "Tell me more", context: "oil", company: "" };
  assert.deepEqual(await readLeadRequest(leadRequest(JSON.stringify(payload), { origin: "https://a3ro.test", "sec-fetch-site": "same-origin" })), payload);
});

test("lead body rejects malformed JSON, cross-origin writes and form media types", async () => {
  const { readLeadRequest } = loadModule("app/api/_lib/leadRequest.ts");
  for (const [request, status] of [
    [leadRequest("{"), 400], [leadRequest("{}", { origin: "https://attacker.test" }), 403],
    [leadRequest("{}", { "sec-fetch-site": "cross-site" }), 403],
    [leadRequest("{}", { "content-type": "text/plain" }), 415],
    [leadRequest("{}", { origin: "null" }), 403],
  ]) await assert.rejects(readLeadRequest(request), (error) => error.status === status);
});

test("lead origin checks use the browser destination when Next uses an internal hostname", async () => {
  const { readLeadRequest } = loadModule("app/api/_lib/leadRequest.ts");
  const request = new Request("http://localhost:3107/api/leads", {
    method: "POST", body: JSON.stringify({ email: "person@example.com" }),
    headers: { "content-type": "application/json", host: "127.0.0.1:3107", origin: "http://127.0.0.1:3107" },
  });
  assert.deepEqual(await readLeadRequest(request), { email: "person@example.com" });
});

test("lead body caps bytes even without or with a forged Content-Length", async () => {
  const { readLeadRequest } = loadModule("app/api/_lib/leadRequest.ts");
  for (const headers of [{}, { "content-length": "1" }, { "content-length": "20000" }]) {
    await assert.rejects(readLeadRequest(leadRequest(JSON.stringify({ email: "person@example.com", message: "💰".repeat(5000) }), headers)), (error) => error.status === 413);
  }
});

test("lead body cancels stalled streams on timeout", async (t) => {
  const { readLeadRequest } = loadModule("app/api/_lib/leadRequest.ts");
  let cancelled = false;
  t.mock.method(globalThis, "setTimeout", (fn) => { queueMicrotask(fn); return undefined; });
  const request = new Request("https://a3ro.test/api/leads", {
    method: "POST", headers: { "content-type": "application/json" }, duplex: "half",
    body: new ReadableStream({ cancel() { cancelled = true; } }),
  });
  await assert.rejects(readLeadRequest(request), (error) => error.status === 408);
  assert.equal(cancelled, true);
});

test("lead guard cannot be bypassed with forged forwarded IPs on self-hosted deployments", (t) => {
  setEnv(t, "VERCEL", undefined);
  const guard = loadModule("app/api/_lib/leadRequest.ts").createLeadBurstGuard();
  for (let index = 0; index < 5; index++) assert.equal(guard(leadRequest("{}", { "x-forwarded-for": `192.0.2.${index + 1}` })), null);
  const response = guard(leadRequest("{}", { "x-forwarded-for": "192.0.2.99" }));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
});

test("lead guard uses Vercel ingress IPs but also caps unique clients per instance", (t) => {
  setEnv(t, "VERCEL", "1");
  const guard = loadModule("app/api/_lib/leadRequest.ts").createLeadBurstGuard();
  for (let index = 0; index < 100; index++) assert.equal(guard(leadRequest("{}", { "x-forwarded-for": `192.0.2.${index + 1}` })), null);
  assert.equal(guard(leadRequest("{}", { "x-forwarded-for": "192.0.2.200" })).status, 429);
});

test("lead guard resets expired windows and bounds untrusted malformed header values", (t) => {
  setEnv(t, "VERCEL", "1");
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const guard = loadModule("app/api/_lib/leadRequest.ts").createLeadBurstGuard();
  for (let index = 0; index < 5; index++) assert.equal(guard(leadRequest("{}", { "x-forwarded-for": `fake-${index}` })), null);
  assert.equal(guard(leadRequest()).status, 429);
  now += 10 * 60 * 1000;
  assert.equal(guard(leadRequest()), null);
});

test("lead route validates before storage and preserves the honeypot", async () => {
  let inserts = 0;
  const { POST } = loadModule("app/api/leads/route.ts", {
    "@a3ro/oil-backend": { createDb: async () => ({}), insertLead: async () => { inserts++; } },
  });
  assert.equal((await POST(leadRequest("{"))).status, 400);
  assert.equal((await POST(leadRequest("[]"))).status, 400);
  assert.equal((await POST(leadRequest(JSON.stringify({ email: "person@example.com", company: "spam" })))).status, 200);
  assert.equal(inserts, 0);
  assert.equal((await POST(leadRequest())).status, 200);
  assert.equal(inserts, 1);
});

test("lead route hides database failures", async () => {
  const { POST } = loadModule("app/api/leads/route.ts", { "@a3ro/oil-backend": failedDb });
  const response = await POST(leadRequest());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Request could not be completed" });
});
