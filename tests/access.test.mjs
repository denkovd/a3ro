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

test("middleware matcher covers every gated page and API prefix, and never the cron routes", () => {
  const source = readFileSync(path.join(root, "middleware.ts"), "utf8");
  const matcher = [...source.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]);
  for (const m of access.MODULE_ACCESS.filter((x) => x.level !== "public"))
    for (const prefix of [...m.pages, ...m.apis]) assert.ok(matcher.includes(`${prefix}/:path*`), `matcher is missing ${prefix}/:path*`);
  assert.ok(!matcher.some((p) => p.startsWith("/api/cron")));
});

function middlewareWith(email, confirmed = true) {
  class Res {
    constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.headers = new Headers(init.headers); this.cookies = { getAll: () => [], set() {} }; }
    static next() { return new Res(null); }
    static json(body, init) { return new Res(body, init); }
    static rewrite(url, init) { const r = new Res(null, init); r.rewrittenTo = String(url); return r; }
  }
  return load("middleware.ts", {
    "next/server": { NextResponse: Res },
    "@supabase/ssr": { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: email ? { email, email_confirmed_at: confirmed ? "2026-11-23T00:00:00Z" : null } : null } }) } }) },
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
