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
  isBullSymbol: (value) => value === "NVDA",
  isChartRange: (value) => ["3m", "6m", "1y", "2y", "5y", "max"].includes(value),
  DEFAULT_CHART_RANGE: "1y",
  isAustraliaIndicator: (value) => value === "unemployment_rate",
  STRATEGIES: [],
};
const publicRoutes = [
  ["australia-watch/latest"], ["australia-watch/series", "indicator=unemployment_rate"],
  ["btc/history"], ["btc/latest"], ["btc/loci"], ["btc/loci/series", "locus=coinbase&metric=price"],
  ["bull/latest"], ["bull/transitions"], ["bull/asset", "symbol=NVDA"], ["bull/chart", "symbol=NVDA&range=1y"], ["gold/latest"], ["gold/loci"],
  ["gold/loci/series", "locus=comex&metric=comex_registered_toz"], ["macro/latest"],
  ["oil/alerts"], ["oil/baselines"], ["oil/corridors"],
  ["oil/corridors/series", "corridor=hormuz&metric=tanker_transits_7d"],
  ["oil/latest"], ["oil/macro"], ["oil/scores"],
  ["oil/series", "benchmark=WTI&from=2026-01-01&to=2026-02-01"], ["oil/tape"],
];
for (const [route, query = ""] of publicRoutes) {
  test(`${route} does not expose database exception details`, async () => {
    const { GET } = loadModule(`app/api/${route}/route.ts`, { "@a3ro/oil-backend": failedDb, "next/cache": { unstable_cache: fn => fn }, "../../../../lib/supabase/server": { currentUserHasPremium: async () => false } });
    const response = await GET(new Request(`https://a3ro.test/api/${route}?${query}`));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Request could not be completed" });
  });
}

test("bull asset + chart routes reject symbols outside the scan universe before opening the database", async () => {
  let opened = false;
  const stub = { ...failedDb, createDb: async () => { opened = true; throw new Error(SECRET_ERROR); } };
  for (const route of ["bull/asset", "bull/chart"]) {
    const { GET } = loadModule(`app/api/${route}/route.ts`, { "@a3ro/oil-backend": stub });
    for (const query of ["", "symbol=", "symbol=DROP%20TABLE", "symbol=nvda", "symbol=NVDA&range=10y"]) {
      if (route === "bull/asset" && query.includes("range")) continue;
      const response = await GET(new Request(`https://a3ro.test/api/${route}?${query}`));
      assert.ok(response.status === 400 || response.status === 404, `${route}?${query}`);
      assert.doesNotMatch(JSON.stringify(await response.json()), /postgres|secret/i);
    }
  }
  assert.equal(opened, false);
});

test("bull asset route still answers when the profiles table is missing, without leaking the error", async () => {
  const row = { runDate: "2026-11-16", symbol: "NVDA", strategy: "ml-dw", lastClose: 100, lastCloseDate: "2026-11-14" };
  const { GET } = loadModule("app/api/bull/asset/route.ts", {
    "@a3ro/oil-backend": {
      ...failedDb,
      createDb: async () => ({}),
      getLatestBullSnapshotsForSymbol: async () => [row],
      getTransitionsForSymbol: async () => [],
      getAssetProfile: async () => { throw new Error(`relation "asset_profiles" does not exist ${SECRET_ERROR}`); },
      getCachedQuarters: async () => [],
    },
  });
  const response = await GET(new Request("https://a3ro.test/api/bull/asset?symbol=NVDA"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.details, null);
  assert.equal(body.earnings, null);
  assert.equal(body.lenses.length, 1);
  assert.doesNotMatch(JSON.stringify(body), /postgres|secret|asset_profiles/i);
});

test("bull asset route computes equity market cap from shares × last close", async () => {
  const row = { runDate: "2026-11-16", symbol: "NVDA", strategy: "ml-dw", lastClose: 100, lastCloseDate: "2026-11-14" };
  const { GET } = loadModule("app/api/bull/asset/route.ts", {
    "@a3ro/oil-backend": {
      ...failedDb,
      createDb: async () => ({}),
      getLatestBullSnapshotsForSymbol: async () => [row],
      getTransitionsForSymbol: async () => [],
      getAssetProfile: async () => ({
        symbol: "NVDA", provider: "finnhub", providerId: "NVDA", sharesOutstanding: 2e9, marketCap: 1,
        earnings: [{ period: "2025-10-26", year: 2025, quarter: 3, actual: 1.3, estimate: 1.2, surprisePct: 8.3 }],
        nextEarningsDate: "2026-11-20", nextEarningsHour: "amc", fetchedAt: "2026-11-15T08:00:00Z", earningsFetchedAt: null,
      }),
      getCachedQuarters: async () => [],
    },
  });
  const body = await (await GET(new Request("https://a3ro.test/api/bull/asset?symbol=NVDA"))).json();
  assert.equal(body.details.marketCap, 2e11);
  assert.equal(body.details.marketCapAsOf, "2026-11-14");
  assert.equal(body.earnings.source, "finnhub");
  assert.equal(body.earnings.quarters[0].epsSurprisePct, 8.3);
  assert.equal(body.earnings.nextDate, "2026-11-20");
});

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

test("Australia series rejects indicators outside the registry before opening the database", async () => {
  let opened = false;
  const { GET } = loadModule("app/api/australia-watch/series/route.ts", { "@a3ro/oil-backend": { ...failedDb, createDb: async () => { opened = true; return {}; } } });
  const response = await GET(new Request("https://a3ro.test/api/australia-watch/series?indicator=toString"));
  assert.equal(response.status, 400);
  assert.equal(opened, false);
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

test("Australia dedicated cron reports partial source failure without failing the run", async (t) => {
  setEnv(t, "CRON_SECRET", "regression-secret");
  const { GET } = loadModule("app/api/cron/australia-watch/route.ts", {
    "@a3ro/oil-backend": {
      createDb: async () => ({}),
      runAustraliaWatchCycle: async () => ({ results: { unemployment_rate: { written: 132 }, oecd_cli: { written: 0, error: "OECD HTTP 429" } } }),
    },
  });
  const response = await GET(new Request("https://a3ro.test/api/cron/australia-watch", { headers: { authorization: "Bearer regression-secret" } }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).degraded, ["oecd_cli"]);
});

test("Australia dedicated cron fails when every source fails", async (t) => {
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

test("Dividend successful snapshots do not expose persisted errors", async (t) => {
  setEnv(t, "DATABASE_URL", "test-only");
  const { GET } = loadModule("app/api/dividend/latest/route.ts", {
    "next/cache": { unstable_cache: (fn) => fn },
    "../../../../backend/src/dividend/indicators": { DIVIDEND_SOURCES: ["test"] },
    "../../../../backend/src/dividend/engine": { buildDividendSnapshot: (_datasets, states) => ({ sources: states }) },
    "../../../../backend/src/dividend/sources": { fetchDividendDataset: async () => { throw new Error("must use stored data"); } },
    "../../../../backend/src/storage/db": { createDb: async () => ({}) },
    "../../../../backend/src/storage/dividendRepo": { getStoredDividend: async () => ({
      datasets: [{ source: "test" }], states: [{ source: "test", health: "healthy", checkedAt: new Date().toISOString(), error: SECRET_ERROR }],
    }) },
  });
  const body = await (await GET()).json();
  assert.equal(body.sources[0].error, "Official source could not be verified on this attempt");
});

test("Value-chain snapshots do not expose stored SEC errors", async (t) => {
  setEnv(t, "DATABASE_URL", "test-only");
  const { GET } = loadModule("app/api/dividend/value-chain/route.ts", {
    "../../../../backend/src/storage/db": { createDb: async () => ({}) },
    "../../../../backend/src/storage/valueChainRepo": { getStoredValueChain: async () => ({
      version: 1, retrievedAt: new Date().toISOString(), companies: [], failures: [{ ticker: "MSFT", error: SECRET_ERROR }],
    }) },
  });
  const body = await (await GET()).json();
  assert.deepEqual(body.failures, [{ ticker: "MSFT", error: "Latest filings could not be read" }]);
  assert.ok(!JSON.stringify(body).includes(SECRET_ERROR));
});

test("Value-chain cron authenticates before opening the database", async (t) => {
  setEnv(t, "CRON_SECRET", "regression-secret");
  let opened = false;
  const { GET } = loadModule("app/api/cron/value-chain/route.ts", {
    "../../../../backend/src/storage/db": { createDb: async () => { opened = true; return {}; } },
    "../../../../backend/src/ingest/valueChainCycle": { runValueChainCycle: async () => ({ startedAt: "", loaded: 1, failures: [], archived: true }) },
  });
  assert.equal((await GET(new Request("https://a3ro.test/api/cron/value-chain"))).status, 401);
  assert.equal(opened, false);
  assert.equal((await GET(new Request("https://a3ro.test/api/cron/value-chain", { headers: { authorization: "Bearer regression-secret" } }))).status, 200);
  assert.equal(opened, true);
});

test("Signal snapshots do not expose stored source errors", async (t) => {
  setEnv(t, "DATABASE_URL", "test-only");
  const { GET } = loadModule("app/api/dividend/signals/route.ts", {
    "../../../../backend/src/storage/db": { createDb: async () => ({}) },
    "../../../../backend/src/storage/signalRepo": { getStoredSignals: async () => ({ datasets: {}, states: [{ source: "epoch", health: "unavailable", checkedAt: new Date().toISOString(), error: SECRET_ERROR }] }) },
  });
  const body = await (await GET()).json();
  assert.equal(body.sources[0].error, "Latest source check failed");
  assert.ok(!JSON.stringify(body).includes(SECRET_ERROR));
});

test("Signal cron authenticates before opening the database", async (t) => {
  setEnv(t, "CRON_SECRET", "regression-secret");
  let opened = false;
  const { GET } = loadModule("app/api/cron/dividend-signals/route.ts", {
    "../../../../backend/src/storage/db": { createDb: async () => { opened = true; return {}; } },
    "../../../../backend/src/ingest/signalCycle": { runSignalCycle: async () => ({ startedAt: "", results: [{ source: "epoch", archived: true, error: null }] }) },
  });
  assert.equal((await GET(new Request("https://a3ro.test/api/cron/dividend-signals"))).status, 401);
  assert.equal(opened, false);
  assert.equal((await GET(new Request("https://a3ro.test/api/cron/dividend-signals", { headers: { authorization: "Bearer regression-secret" } }))).status, 200);
});

test("Constraint gauges survive an unreadable archive without leaking errors", async (t) => {
  setEnv(t, "DATABASE_URL", "test-only");
  const { GET } = loadModule("app/api/dividend/constraints/route.ts", {
    "../../../../backend/src/storage/db": { createDb: async () => { throw new Error(SECRET_ERROR); } },
    "../../../../backend/src/storage/signalRepo": { getStoredSignals: async () => ({ datasets: {}, states: [] }), getEarlierSignal: async () => undefined },
    "../../../../backend/src/storage/valueChainRepo": { getStoredValueChain: async () => null },
    "../../../../backend/src/sources/fredMacro": { parseFredCsv: () => [] },
  });
  const response = await GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.gauges.length, 8);
  assert.ok(!JSON.stringify(body).includes(SECRET_ERROR));
});

test("Constraint cron authenticates before opening the database", async (t) => {
  setEnv(t, "CRON_SECRET", "regression-secret");
  let opened = false;
  const { GET } = loadModule("app/api/cron/dividend-constraints/route.ts", {
    "../../../../backend/src/storage/db": { createDb: async () => { opened = true; return {}; } },
    "../../../../backend/src/ingest/signalCycle": { runSignalCycle: async () => ({ startedAt: "", results: [{ source: "eia", archived: true, error: null }] }) },
  });
  assert.equal((await GET(new Request("https://a3ro.test/api/cron/dividend-constraints"))).status, 401);
  assert.equal(opened, false);
  assert.equal((await GET(new Request("https://a3ro.test/api/cron/dividend-constraints", { headers: { authorization: "Bearer regression-secret" } }))).status, 200);
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

test("error log records thrown errors and 5xx responses, never 2xx, and never breaks the route", async () => {
  const logged = [];
  const backend = { createDb: async () => ({}), recordAppError: async (_db, input) => { logged.push(input); } };
  const { withErrorLog } = loadModule("app/api/_lib/errorLog.ts", { "@a3ro/oil-backend": backend });
  assert.equal((await withErrorLog("api:ok", async () => Response.json({ ok: true }))()).status, 200);
  assert.equal(logged.length, 0);
  const failed = await withErrorLog("cron:test", async () => Response.json({ error: "FRED unavailable" }, { status: 503 }))();
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "FRED unavailable" }, "the body is still readable after logging");
  assert.deepEqual(logged.at(-1), { source: "cron:test", message: "HTTP 503: FRED unavailable", status: 503 });
  await assert.rejects(withErrorLog("api:boom", async () => { throw new Error("boom"); })(), /boom/);
  assert.deepEqual(logged.at(-1), { source: "api:boom", message: "boom", status: 500 });

  const broken = loadModule("app/api/_lib/errorLog.ts", { "@a3ro/oil-backend": { createDb: async () => { throw new Error(SECRET_ERROR); }, recordAppError: async () => {} } });
  assert.equal((await broken.withErrorLog("api:x", async () => new Response("down", { status: 500 }))()).status, 500);
  const missing = loadModule("app/api/_lib/errorLog.ts", {});
  assert.equal((await missing.withErrorLog("api:x", async () => new Response("down", { status: 500 }))()).status, 500);
});

test("cron routes record each run; auth failures and API routes don't", async () => {
  const runs = [];
  const backend = {
    createDb: async () => ({}), recordAppError: async () => {}, redactErrorMessage: (m) => m.replace(SECRET_ERROR, "[redacted]"),
    summarizeCronReport: (body, status) => ({ status: status >= 500 ? "failed" : "ok", results: [], error: body?.error ?? null }),
    recordCronRun: async (_db, run) => { runs.push(run); },
  };
  const { withErrorLog } = loadModule("app/api/_lib/errorLog.ts", { "@a3ro/oil-backend": backend });
  const ok = await withErrorLog("cron:macro", async () => Response.json({ written: 1 }))();
  assert.deepEqual(await ok.json(), { written: 1 }, "the body is still readable after recording");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].job, "macro");
  assert.equal(runs[0].httpStatus, 200);
  assert.equal(runs[0].status, "ok");
  assert.ok(Number.isFinite(runs[0].durationMs) && runs[0].durationMs >= 0);
  assert.ok(!Number.isNaN(Date.parse(runs[0].startedAt)));

  await withErrorLog("cron:macro", async () => Response.json({ error: "unauthorized" }, { status: 401 }))();
  await withErrorLog("cron:earnings", async () => Response.json({ error: "gone" }, { status: 410 }))();
  await withErrorLog("api:quotes", async () => Response.json({ ok: true }))();
  assert.equal(runs.length, 1, "401, 410 and non-cron routes are not runs");

  await assert.rejects(withErrorLog("cron:btc", async () => { throw new Error(SECRET_ERROR); })());
  assert.equal(runs.at(-1).status, "failed");
  assert.ok(!runs.at(-1).error.includes(SECRET_ERROR), "a thrown message is redacted before it is stored");

  const broken = loadModule("app/api/_lib/errorLog.ts", { "@a3ro/oil-backend": { ...backend, recordCronRun: async () => { throw new Error("relation cron_runs does not exist"); } } });
  assert.equal((await broken.withErrorLog("cron:macro", async () => Response.json({ written: 1 }))()).status, 200, "a missing table never changes the response");
});

test("public oil quotes never expose market-data prices; Premium accounts still get the live quote", async () => {
  const quotes = [
    { benchmark: "WTI", price: 83.39, kind: "live", source: "yfinance", observedAt: "2026-11-23T06:12:51.000Z", staleness: "fresh", suspect: false, updatedAt: "2026-11-23T06:23:11.000Z" },
    { benchmark: "BRENT", price: 89.1, kind: "settlement", source: "eia", observedAt: "2026-11-17T00:00:00.000Z", staleness: "fresh", suspect: false, updatedAt: "2026-11-18T00:00:00.000Z" },
  ];
  const backend = {
    createDb: async () => ({}),
    getLatestQuotes: async () => quotes,
    getLatestDailyCloses: async (_db, sources) => { assert.deepEqual(sources, ["eia", "fred"]); return [{ benchmark: "WTI", periodDate: "2026-11-17", price: 81.02, source: "eia" }]; },
    buildSources: () => [],
    getDailySeries: async () => [{ periodDate: "2026-11-14", price: 80 }],
    computeQuoteChanges: () => ({ prevClose: 80, prevCloseDate: "2026-11-14", d1: 1.3, w1: null }),
    classifyStaleness: () => "fresh",
  };
  const load = (owner) => loadModule("app/api/oil/latest/route.ts", {
    "@a3ro/oil-backend": backend,
    "../../../../lib/supabase/server": { currentUserHasPremium: async () => owner },
  });
  const pub = await load(false).GET();
  const body = await pub.json();
  assert.match(pub.headers.get("cache-control"), /private, no-store/);
  assert.ok(body.every((q) => ["eia", "fred"].includes(q.source)), JSON.stringify(body));
  assert.equal(body.find((q) => q.benchmark === "WTI").price, 81.02);
  assert.equal(body.find((q) => q.benchmark === "WTI").kind, "settlement");
  assert.ok(!JSON.stringify(body).includes("83.39"));
  const own = await (await load(true).GET()).json();
  assert.equal(own.find((q) => q.benchmark === "WTI").price, 83.39);
});

function newsletterMe(viewer, backend) {
  return loadModule("app/api/newsletter/me/route.ts", {
    "@a3ro/oil-backend": { createDb: async () => ({}), recordAppError: async () => {}, ...backend },
    "../../../../lib/supabase/server": { currentViewer: async () => viewer },
  });
}
const member = { signedIn: true, admin: false, premium: false, email: "member@example.com", userId: "u1" };
const signedOut = { signedIn: false, admin: false, premium: false, email: null, userId: null };
const sameOrigin = (body = JSON.stringify({ context: "australia-watch" }), origin = "https://a3ro.test") =>
  new Request("https://a3ro.test/api/newsletter/me", { method: "POST", headers: { "Content-Type": "application/json", origin, host: "a3ro.test" }, body });

test("newsletter/me reports signed-out visitors without touching the database", async () => {
  let opened = false;
  const { GET } = newsletterMe(signedOut, { createDb: async () => { opened = true; return {}; } });
  const response = await GET();
  assert.deepEqual(await response.json(), { signedIn: false });
  assert.equal(opened, false);
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("newsletter/me says whether the member's own account gets the newsletter", async () => {
  const asked = [];
  const { GET } = newsletterMe(member, { newsletterSubscribed: async (_db, userId, email) => { asked.push([userId, email]); return true; } });
  assert.deepEqual(await (await GET()).json(), { signedIn: true, email: "member@example.com", subscribed: true });
  assert.deepEqual(asked, [["u1", "member@example.com"]]);
});

test("newsletter/me subscribes the session email, same-origin only", async () => {
  const subscribed = [];
  const backend = { setNewsletter: async (_db, userId, email, on, context) => { subscribed.push({ userId, email, on, context }); } };
  const { POST } = newsletterMe(member, backend);
  assert.equal((await POST(sameOrigin(undefined, "https://evil.test"))).status, 403);
  assert.equal(subscribed.length, 0);
  assert.equal((await POST(sameOrigin(JSON.stringify({ context: "x", email: "someone@else.test" })))).status, 200);
  assert.deepEqual(subscribed, [{ userId: "u1", email: "member@example.com", on: true, context: "x" }]);
  const { POST: outPost } = newsletterMe(signedOut, backend);
  assert.equal((await outPost(sameOrigin())).status, 401);
});

/* ── Account settings (#105) ─────────────────────────────────── */

function accountRoute(route, viewer, backend = {}, auth = {}) {
  const server = {
    currentViewer: async () => viewer,
    createSupabaseServerClient: async () => ({ auth: { updateUser: async () => ({ error: null }), signOut: async () => ({ error: null }), ...auth } }),
  };
  return loadModule(`app/api/${route}/route.ts`, {
    "@a3ro/oil-backend": { createDb: async () => ({}), recordAppError: async () => {}, ...backend },
    "../../../lib/supabase/server": server,
    "../../../../lib/supabase/server": server,
  });
}
const accountReq = (route, method, body, origin = "https://a3ro.test") =>
  new Request(`https://a3ro.test/api/${route}`, { method, headers: { "Content-Type": "application/json", origin, host: "a3ro.test" }, body: body === undefined ? undefined : JSON.stringify(body) });

test("account settings need a signed-in account; writes need our own origin", async () => {
  const { GET, PATCH } = accountRoute("account", signedOut);
  assert.equal((await GET(accountReq("account", "GET"))).status, 401);
  assert.equal((await PATCH(accountReq("account", "PATCH", { displayName: "x" }))).status, 401);
  const { PATCH: memberPatch } = accountRoute("account", member, { saveProfile: async () => { throw new Error("must not save"); } });
  assert.equal((await memberPatch(accountReq("account", "PATCH", { displayName: "x" }, "https://evil.test"))).status, 403);
});

test("account PATCH cleans the name and keeps only known interests", async () => {
  const saved = [];
  const newsletter = [];
  const { PATCH } = accountRoute("account", member, {
    saveProfile: async (_db, userId, patch) => saved.push({ userId, patch }),
    setNewsletter: async (_db, userId, email, on) => newsletter.push({ userId, email, on }),
  });
  const ok = await PATCH(accountReq("account", "PATCH", { displayName: "  Ada   Lovelace ", interests: ["crypto", "nope", "australia", "crypto"], newsletter: false }));
  assert.equal(ok.status, 200);
  assert.deepEqual(saved, [{ userId: "u1", patch: { displayName: "Ada Lovelace", interests: ["australia", "crypto"] } }]);
  assert.deepEqual(newsletter, [{ userId: "u1", email: "member@example.com", on: false }]);
  assert.equal((await PATCH(accountReq("account", "PATCH", { displayName: "x".repeat(81) }))).status, 400);
  assert.equal((await PATCH(accountReq("account", "PATCH", { interests: "crypto" }))).status, 400);
  assert.equal((await PATCH(accountReq("account", "PATCH", { newsletter: "yes" }))).status, 400);
});

test("account GET returns the member's own settings, with Premium for admins", async () => {
  const asked = [];
  const settings = { userId: "u1", email: "member@example.com", premium: false, interests: [] };
  const { GET } = accountRoute("account", { ...member, admin: true }, { getAccountSettings: async (_db, id) => { asked.push(id); return settings; } });
  const body = await (await GET(accountReq("account", "GET"))).json();
  assert.deepEqual(asked, ["u1"]);
  assert.equal(body.premium, true);
  assert.equal(body.admin, true);
});

test("password: length rules, same-origin, and Supabase errors come back readable", async () => {
  const set = [];
  const { POST } = accountRoute("account/password", member, {}, { updateUser: async (u) => { set.push(u.password); return { error: null }; } });
  assert.equal((await POST(accountReq("account/password", "POST", { password: "short" }))).status, 400);
  assert.equal((await POST(accountReq("account/password", "POST", { password: "long enough pw" }, "https://evil.test"))).status, 403);
  assert.equal((await POST(accountReq("account/password", "POST", { password: "long enough pw" }))).status, 200);
  assert.deepEqual(set, ["long enough pw"]);
  const { POST: weak } = accountRoute("account/password", member, {}, { updateUser: async () => ({ error: { status: 422, code: "weak_password", message: "weak" } }) });
  const res = await weak(accountReq("account/password", "POST", { password: "password123" }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /too weak/);
});

test("feedback: validated kinds, rating only on reviews, stored against the session", async () => {
  const stored = [];
  const { POST } = accountRoute("account/feedback", member, { insertFeedback: async (_db, fb) => stored.push(fb) });
  assert.equal((await POST(accountReq("account/feedback", "POST", { kind: "spam", message: "hi" }))).status, 400);
  assert.equal((await POST(accountReq("account/feedback", "POST", { kind: "request", message: "   " }))).status, 400);
  assert.equal((await POST(accountReq("account/feedback", "POST", { kind: "request", message: "Add copper", rating: 5, page: "/account" }))).status, 200);
  assert.equal((await POST(accountReq("account/feedback", "POST", { kind: "review", message: "Great", rating: 4, page: "javascript:x" }))).status, 200);
  assert.deepEqual(stored, [
    { userId: "u1", email: "member@example.com", kind: "request", rating: null, message: "Add copper", page: "/account" },
    { userId: "u1", email: "member@example.com", kind: "review", rating: 4, message: "Great", page: null },
  ]);
});

test("delete account needs the typed email, refuses admins, and signs out after deleting", async () => {
  const calls = [];
  const backend = { deleteAccount: async (_db, id, email) => { calls.push(`delete:${id}:${email}`); return true; } };
  const auth = { signOut: async (o) => { calls.push(`signout:${o?.scope}`); return { error: null }; } };
  const { POST } = accountRoute("account/delete", member, backend, auth);
  assert.equal((await POST(accountReq("account/delete", "POST", { confirm: "someone@else.test" }))).status, 400);
  assert.equal((await POST(accountReq("account/delete", "POST", { confirm: "member@example.com" }, "https://evil.test"))).status, 403);
  assert.deepEqual(calls, []);
  assert.equal((await POST(accountReq("account/delete", "POST", { confirm: " Member@Example.com " }))).status, 200);
  assert.deepEqual(calls, ["delete:u1:member@example.com", "signout:local"]);
  const { POST: adminPost } = accountRoute("account/delete", { ...member, admin: true }, backend, auth);
  assert.equal((await adminPost(accountReq("account/delete", "POST", { confirm: "member@example.com" }))).status, 400);
});

test("sign out everywhere ends every session for the account", async () => {
  const scopes = [];
  const { DELETE } = accountRoute("account/sessions", member, {}, { signOut: async (o) => { scopes.push(o.scope); return { error: null }; } });
  assert.equal((await DELETE(accountReq("account/sessions", "DELETE", undefined, "https://evil.test"))).status, 403);
  assert.equal((await DELETE(accountReq("account/sessions", "DELETE"))).status, 200);
  assert.deepEqual(scopes, ["global"]);
});

test("Admin → Messages: only admins mark messages done, with a valid id", async () => {
  const marked = [];
  const load = (allowed) => loadModule("app/api/owner/messages/route.ts", {
    "@a3ro/oil-backend": { createDb: async () => ({}), setFeedbackHandled: async (_db, id, handled) => { marked.push([id, handled]); return id === 7; } },
    "../../../../lib/ownerGuard": { ownerWriteAllowed: async () => allowed },
  });
  const req = (body) => new Request("https://a3ro.test/api/owner/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await load(false).POST(req({ id: 7, handled: true }))).status, 403);
  const { POST } = load(true);
  assert.equal((await POST(req({ id: "7", handled: true }))).status, 400);
  assert.equal((await POST(req({ id: 7, handled: "yes" }))).status, 400);
  assert.equal((await POST(req({ id: 99, handled: true }))).status, 404);
  assert.equal((await POST(req({ id: 7, handled: true }))).status, 200);
  assert.deepEqual(marked, [[99, true], [7, true]]);
});
