import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(relativePath, stubs = {}, cache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const req = (id) => Object.hasOwn(stubs, id) ? stubs[id] : id.startsWith(".") ? load(path.resolve(path.dirname(filename), `${id}.ts`), stubs, cache) : (() => { throw new Error(`Unexpected dependency: ${id}`); })();
  new Function("require", "module", "exports", outputText)(req, module, module.exports);
  return module.exports;
}
const access = load("lib/access.ts");

test("roadmap #33 split: open-data modules public, market-data modules owner-only", () => {
  for (const p of ["/Projects/Australia-Watch", "/Projects/AI-Dividend", "/Projects/Oil-Tracker", "/api/australia-watch/latest", "/api/dividend/latest", "/api/oil/corridors", "/api/macro/latest", "/", "/api/cron/bull"])
    assert.equal(access.gatedModuleForPath(p), null, p);
  for (const p of ["/Projects/Bull-Market-Finder", "/Projects/Regime-Finder", "/Projects/Earnings-Beat", "/Projects/Regime-Shift", "/Projects/Gold-Tracker", "/Projects/BTC-Tracker", "/Projects/Gold-Tracker/"])
    assert.equal(access.gatedModuleForPath(p)?.kind, "page", p);
  for (const p of ["/api/bull/latest", "/api/bull/asset", "/api/regime/latest", "/api/gold/loci/series", "/api/btc/markets", "/api/leaderboard/earnings-beats", "/api/watchlist/rankings"])
    assert.equal(access.gatedModuleForPath(p)?.kind, "api", p);
  assert.equal(access.gatedModuleForPath("/api/bullish"), null, "prefixes match whole segments only");
  for (const m of access.MODULE_ACCESS) assert.ok(m.level === "public" ? m.data === "open" : true, `${m.id}: market data must not be public`);
});

test("owner check fails closed and ignores case and spacing", () => {
  assert.equal(access.isOwnerEmail("me@x.com", undefined), false);
  assert.equal(access.isOwnerEmail("me@x.com", ""), false);
  assert.equal(access.isOwnerEmail(null, "me@x.com"), false);
  assert.equal(access.isOwnerEmail(" Me@X.com ", "other@y.com, me@x.com"), true);
  assert.equal(access.isOwnerEmail("me@x.com.evil", "me@x.com"), false);
});

test("owner user needs a confirmed email", () => {
  assert.equal(access.isOwnerUser({ email: "me@x.com", email_confirmed_at: "2026-11-23T00:00:00Z" }, "me@x.com"), true);
  assert.equal(access.isOwnerUser({ email: "me@x.com", email_confirmed_at: null }, "me@x.com"), false);
  assert.equal(access.isOwnerUser(null, "me@x.com"), false);
});

test("post-login redirects stay on this site", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null]) assert.equal(access.safeNextPath(bad), "/", String(bad));
  assert.equal(access.safeNextPath("/Projects/Gold-Tracker"), "/Projects/Gold-Tracker");
});

test("middleware matcher covers every module page and API prefix (any level can be overridden), and never the cron routes", () => {
  const source = readFileSync(path.join(root, "middleware.ts"), "utf8");
  const matcher = [...source.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]);
  for (const m of access.MODULE_ACCESS)
    for (const prefix of [...m.pages, ...m.apis]) assert.ok(matcher.includes(`${prefix}/:path*`), `matcher is missing ${prefix}/:path*`);
  assert.ok(!matcher.some((p) => p.startsWith("/api/cron")));
});

function middlewareWith(email, confirmed = true, overrides = {}) {
  class Res {
    constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.headers = new Headers(init.headers); this.cookies = { getAll: () => [], set() {} }; }
    static next() { return new Res(null); }
    static json(body, init) { return new Res(body, init); }
    static rewrite(url, init) { const r = new Res(null, init); r.rewrittenTo = String(url); return r; }
  }
  return load("middleware.ts", {
    "next/server": { NextResponse: Res },
    "@supabase/ssr": { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: email ? { email, email_confirmed_at: confirmed ? "2026-11-23T00:00:00Z" : null } : null } }) } }) },
    "./lib/accessOverrides": { loadLevelOverrides: async () => overrides },
  }).middleware;
}
const req = (p) => { const nextUrl = new URL(`https://a3ro.test${p}`); return { nextUrl: Object.assign(nextUrl, { clone: () => new URL(nextUrl) }), cookies: { getAll: () => [], set() {} } }; };

test("middleware: logged-out visitors get 401 on gated APIs and the private page on gated modules", async (t) => {
  for (const [k, v] of [["OWNER_EMAILS", "owner@a3ro.test"], ["NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"], ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk"]]) {
    const prev = process.env[k]; process.env[k] = v; t.after(() => prev === undefined ? delete process.env[k] : process.env[k] = prev);
  }
  for (const who of [null, "someone@else.test"]) {
    const mw = middlewareWith(who);
    const api = await mw(req("/api/bull/latest"));
    assert.equal(api.status, 401);
    assert.match(api.headers.get("cache-control"), /private, no-store/);
    const page = await mw(req("/Projects/Gold-Tracker"));
    assert.equal(page.status, 401);
    assert.match(page.rewrittenTo, /\/private\?module=gold&next=%2FProjects%2FGold-Tracker$/);
    assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
  }
  const owner = middlewareWith("Owner@A3RO.test");
  const ok = await owner(req("/api/bull/latest"));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control"), /private/);
  assert.equal((await middlewareWith(null)(req("/login"))).status, 200, "non-gated matched paths pass through");
  const ops = await middlewareWith(null)(req("/owner/stats"));
  assert.equal(ops.status, 404, "owner tools answer 404 to everyone else");
  assert.match(ops.rewrittenTo, /\/404$/);
  assert.equal((await middlewareWith(null)(req("/api/owner/anything"))).status, 401);
  assert.equal((await middlewareWith("owner@a3ro.test")(req("/owner/stats"))).status, 200);
  assert.equal((await middlewareWith("owner@a3ro.test", false)(req("/api/bull/latest"))).status, 401, "an unconfirmed account with the owner's email is not the owner");
});

test("middleware fails closed when Supabase isn't configured", async (t) => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const prev = process.env[k]; delete process.env[k]; t.after(() => prev === undefined ? delete process.env[k] : process.env[k] = prev);
  }
  const prev = process.env.OWNER_EMAILS; process.env.OWNER_EMAILS = "owner@a3ro.test"; t.after(() => prev === undefined ? delete process.env.OWNER_EMAILS : process.env.OWNER_EMAILS = prev);
  assert.equal((await middlewareWith("owner@a3ro.test")(req("/api/gold/latest"))).status, 401);
});

test("every owner-only module has a coming-soon preview (#35)", () => {
  for (const m of access.MODULE_ACCESS.filter((x) => x.level !== "public" && !x.hidden)) assert.ok(m.preview && m.preview.length > 40, `${m.id} needs a preview`);
});

test("owner overrides (#52): restrict a public module, but never open up market data or owner tools", async (t) => {
  for (const [k, v] of [["OWNER_EMAILS", "owner@a3ro.test"], ["NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"], ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk"]]) {
    const prev = process.env[k]; process.env[k] = v; t.after(() => prev === undefined ? delete process.env[k] : process.env[k] = prev);
  }
  const au = access.MODULE_ACCESS.find((m) => m.id === "australia");
  const gold = access.MODULE_ACCESS.find((m) => m.id === "gold");
  const ops = access.MODULE_ACCESS.find((m) => m.id === "ops");
  assert.equal(access.effectiveLevel(au, { australia: "owner" }), "owner");
  assert.equal(access.effectiveLevel(gold, { gold: "public" }), "owner", "market data stays gated");
  assert.equal(access.effectiveLevel(ops, { ops: "public" }), "owner", "owner tools stay gated");
  assert.equal((await middlewareWith(null)(req("/api/australia-watch/latest"))).status, 200, "public by default");
  assert.equal((await middlewareWith(null, true, { australia: "owner" })(req("/api/australia-watch/latest"))).status, 401);
  assert.equal((await middlewareWith(null, true, { australia: "owner" })(req("/Projects/Australia-Watch"))).status, 401);
  assert.equal((await middlewareWith("owner@a3ro.test", true, { australia: "owner" })(req("/api/australia-watch/latest"))).status, 200);
  assert.equal((await middlewareWith(null, true, { gold: "public" })(req("/api/gold/latest"))).status, 401);
});

test("re-runnable cron jobs match vercel.json exactly", () => {
  const crons = load("lib/crons.ts");
  const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.deepEqual([...crons.CRON_JOBS].sort(), vercel.crons.map((c) => c.path.replace("/api/cron/", "")).sort());
  assert.equal(crons.isCronJob("../leads"), false);
});

test("the cron re-run only sends the secret to our own hosts", () => {
  const guard = load("lib/ownerGuard.ts", { "next/navigation": { notFound() {} }, "./supabase/server": { currentUserIsOwner: async () => true } });
  const r = (url, host) => new Request(url, { headers: host ? { host } : {} });
  assert.equal(guard.trustedOrigin(r("https://a3ro.com.au/api/owner/cron")), "https://a3ro.com.au");
  assert.equal(guard.trustedOrigin(r("https://a3ro.com.au/x", "a3ro-abc.vercel.app")), "https://a3ro-abc.vercel.app");
  assert.equal(guard.trustedOrigin(r("http://localhost:3000/x")), "http://localhost:3000");
  assert.equal(guard.trustedOrigin(r("https://a3ro.com.au/x", "evil.example")), null);
  assert.equal(guard.trustedOrigin(r("https://a3ro.com.au/x", "a3ro.com.au.evil.example")), null);
});

test("scorecard: weights, verdicts, missing usage scaled, errors and staleness cost points", () => {
  const sc = load("lib/scorecard.ts");
  const base = { lastRefreshHours: { australia: 2, dividend: 2, commodity: 2, macro: 2, trend: 2, earnings: 24, regime: 2, gold: 2, btc: 2 }, australiaHealthyShare: 1, usageByPath: [], errorsBySource: [], fitRatings: {} };
  const rows = sc.computeScorecard(base);
  const au = rows.find((r) => r.id === "australia");
  assert.equal(au.usage, null);
  assert.equal(au.total, Math.round((30 + 15 + 15 + 6) * 100 / 70));
  const busy = sc.computeScorecard({ ...base, australiaHealthyShare: 0.5, lastRefreshHours: { ...base.lastRefreshHours, gold: 100 },
    usageByPath: [{ path: "/Projects/Australia-Watch", count: 50 }, { path: "/Projects/AI-Dividend", count: 5 }],
    errorsBySource: [{ source: "cron:australia-watch", distinct: 2 }, { source: "api:gold/latest", distinct: 1 }], fitRatings: { gold: 1 } });
  const a = busy.find((r) => r.id === "australia"), g = busy.find((r) => r.id === "gold"), d = busy.find((r) => r.id === "dividend");
  assert.equal(a.health, 15); assert.equal(a.usage, 30); assert.equal(a.upkeep, 9);
  assert.ok(d.usage > 0 && d.usage < 30);
  assert.equal(g.health, 0); assert.equal(g.usage, 0); assert.equal(g.upkeep, 12); assert.equal(g.fit, 2);
  assert.equal(g.verdict, "park");
  for (const r of busy) assert.ok(r.total >= 0 && r.total <= 100);
});

test("IMF COFER parser reads the latest quarter and rejects anything that doesn't add up", () => {
  const gm = load("lib/globalMarkets.ts");
  const head = "DATAFLOW,COUNTRY,INDICATOR,FXR_CURRENCY,TYPE_OF_TRANSFORMATION,FREQUENCY,TIME_PERIOD,OBS_VALUE";
  const row = (c, p, v) => `IMF.STA:COFER(7.0.1),G001,AFXRA,CI_${c},SHRO_PT,Q,${p},${v}`;
  const shares = [["USD", 56.7], ["EUR", 20.6], ["OTHC", 6.06], ["JPY", 4.96], ["GBP", 4.57], ["CAD", 2.47], ["AUD", 2.25], ["CNY", 2.11], ["CHF", 0.27]];
  const csv = [head, ...shares.map(([c, v]) => row(c, "2026-Q2", v)), row("USD", "2026-Q1", 57.18), row("T", "2026-Q2", 100)].join("\n");
  const out = gm.parseCofer(csv);
  assert.equal(out.quarter, "2026 Q2");
  assert.equal(out.shares[0].code, "USD");
  assert.equal(out.shares.find((s) => s.code === "AUD").label, "Australian dollar");
  assert.ok(!out.shares.some((s) => s.code === "T"), "the 100% total row is not a currency");
  assert.equal(gm.parseCofer([head, row("USD", "2026-Q2", 56.7)].join("\n")), null, "too few currencies");
  assert.equal(gm.parseCofer("garbage"), null);
  assert.equal(Math.round(gm.FALLBACK_RESERVES.shares.reduce((s, x) => s + x.share, 0)), 100);
});
