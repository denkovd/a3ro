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

test("roadmap #33 split: open-data modules public, market-data modules Premium", () => {
  for (const p of ["/Projects/Australia-Watch", "/Projects/AI-Dividend", "/Projects/Oil-Tracker", "/api/australia-watch/latest", "/api/dividend/latest", "/api/oil/corridors", "/api/macro/latest", "/", "/api/cron/bull"])
    assert.equal(access.gatedModuleForPath(p), null, p);
  for (const p of ["/Projects/Bull-Market-Finder", "/Projects/Regime-Finder", "/Projects/Earnings-Beat", "/Projects/Regime-Shift", "/Projects/Gold-Tracker", "/Projects/BTC-Tracker", "/Projects/Gold-Tracker/"])
    assert.equal(access.gatedModuleForPath(p)?.kind, "page", p);
  for (const p of ["/api/bull/latest", "/api/bull/asset", "/api/regime/latest", "/api/gold/loci/series", "/api/btc/markets", "/api/leaderboard/earnings-beats", "/api/watchlist/rankings"])
    assert.equal(access.gatedModuleForPath(p)?.kind, "api", p);
  assert.equal(access.gatedModuleForPath("/api/bullish"), null, "prefixes match whole segments only");
  for (const m of access.MODULE_ACCESS) assert.ok(m.level === "public" ? m.data === "open" : true, `${m.id}: market data must not be public`);
});

test("admin check fails closed and ignores case and spacing", () => {
  assert.equal(access.isAdminEmail("me@x.com", undefined), false);
  assert.equal(access.isAdminEmail("me@x.com", ""), false);
  assert.equal(access.isAdminEmail(null, "me@x.com"), false);
  assert.equal(access.isAdminEmail(" Me@X.com ", "other@y.com, me@x.com"), true);
  assert.equal(access.isAdminEmail("me@x.com.evil", "me@x.com"), false);
});

test("admin user needs a confirmed email", () => {
  assert.equal(access.isAdminUser({ email: "me@x.com", email_confirmed_at: "2026-11-23T00:00:00Z" }, "me@x.com"), true);
  assert.equal(access.isAdminUser({ email: "me@x.com", email_confirmed_at: null }, "me@x.com"), false);
  assert.equal(access.isAdminUser(null, "me@x.com"), false);
});

test("who can open what: an account alone opens nothing beyond public; Premium opens Premium; only admins open admin tools", () => {
  const free = { signedIn: true, premium: false, admin: false }, paid = { signedIn: true, premium: true, admin: false }, admin = { signedIn: true, premium: true, admin: true };
  for (const v of [access.ANONYMOUS, free, paid, admin]) assert.equal(access.viewerCanOpen("public", v), true);
  assert.equal(access.viewerCanOpen("premium", access.ANONYMOUS), false);
  assert.equal(access.viewerCanOpen("premium", free), false);
  assert.equal(access.viewerCanOpen("premium", paid), true);
  assert.equal(access.viewerCanOpen("admin", paid), false);
  assert.equal(access.viewerCanOpen("admin", admin), true);
  assert.equal(access.canSeeRoute("/Projects/Gold-Tracker", free), false);
  assert.equal(access.canSeeRoute("/Projects/Gold-Tracker", paid), true);
  assert.equal(access.canSeeRoute("/Projects/Australia-Watch", access.ANONYMOUS), true);
  assert.equal(access.canSeeRoute("/owner", paid), false);
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

test("static data files with market data or Premium signals are gated, not public (#92)", () => {
  const hit = access.moduleForPath("/data/regime-backtest.json");
  assert.equal(hit?.module.id, "regime");
  assert.equal(hit?.kind, "api");
  assert.ok(access.gatedModuleForPath("/data/regime-backtest.json"));
  // Open-data snapshots for the public macro view stay public.
  assert.equal(access.gatedModuleForPath("/data/cost-of-capital.json"), null);
});

/** `premiumIds`: account ids the stubbed user_access says have Premium. */
function middlewareWith(email, confirmed = true, overrides = {}, premiumIds = []) {
  class Res {
    constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.headers = new Headers(init.headers); this.cookies = { getAll: () => [], set() {} }; }
    static next() { return new Res(null); }
    static json(body, init) { return new Res(body, init); }
    static rewrite(url, init) { const r = new Res(null, init); r.rewrittenTo = String(url); return r; }
  }
  const user = email ? { id: `id:${email.toLowerCase()}`, email, email_confirmed_at: confirmed ? "2026-11-23T00:00:00Z" : null } : null;
  return load("middleware.ts", {
    "next/server": { NextResponse: Res },
    "@supabase/ssr": { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    "./lib/accessOverrides": { loadLevelOverrides: async () => overrides },
    "./lib/premium": { accountHasPremium: async (id) => premiumIds.includes(id) },
  }).middleware;
}
const req = (p) => { const nextUrl = new URL(`https://a3ro.test${p}`); return { nextUrl: Object.assign(nextUrl, { clone: () => new URL(nextUrl) }), cookies: { getAll: () => [], set() {} } }; };
function withEnv(t, pairs) {
  for (const [k, v] of pairs) { const prev = process.env[k]; process.env[k] = v; t.after(() => prev === undefined ? delete process.env[k] : process.env[k] = prev); }
}
const ENV = [["OWNER_EMAILS", "admin@a3ro.test"], ["NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"], ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk"]];

test("middleware: signed out → 401 and the Premium page; free account → 403 and the Premium page", async (t) => {
  withEnv(t, ENV);
  for (const [who, status] of [[null, 401], ["someone@else.test", 403]]) {
    const mw = middlewareWith(who);
    const api = await mw(req("/api/bull/latest"));
    assert.equal(api.status, status);
    assert.match(api.headers.get("cache-control"), /private, no-store/);
    const page = await mw(req("/Projects/Gold-Tracker"));
    assert.equal(page.status, status);
    assert.match(page.rewrittenTo, /\/private\?module=gold&next=%2FProjects%2FGold-Tracker$/);
    assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
  }
  assert.equal((await middlewareWith(null)(req("/login"))).status, 200, "non-gated matched paths pass through");
});

test("middleware: Premium accounts and admins open Premium modules; only admins open admin tools", async (t) => {
  withEnv(t, ENV);
  const paid = middlewareWith("paid@x.test", true, {}, ["id:paid@x.test"]);
  const ok = await paid(req("/api/bull/latest"));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control"), /private/);
  assert.equal((await paid(req("/Projects/Gold-Tracker"))).status, 200);
  const ops = await paid(req("/owner/stats"));
  assert.equal(ops.status, 404, "admin tools answer 404 to Premium accounts too");
  assert.match(ops.rewrittenTo, /\/404$/);
  assert.equal((await paid(req("/api/owner/anything"))).status, 401, "admin APIs don't reveal themselves with a 403");
  assert.equal((await middlewareWith(null)(req("/owner/stats"))).status, 404);
  const admin = middlewareWith("Admin@A3RO.test");
  assert.equal((await admin(req("/owner/stats"))).status, 200);
  assert.equal((await admin(req("/api/bull/latest"))).status, 200, "admins always have Premium");
  assert.equal((await middlewareWith("admin@a3ro.test", false)(req("/api/bull/latest"))).status, 403, "an unconfirmed account with the admin email is not the admin");
});

test("middleware fails closed when Supabase isn't configured", async (t) => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const prev = process.env[k]; delete process.env[k]; t.after(() => prev === undefined ? delete process.env[k] : process.env[k] = prev);
  }
  withEnv(t, [["OWNER_EMAILS", "admin@a3ro.test"]]);
  assert.equal((await middlewareWith("admin@a3ro.test")(req("/api/gold/latest"))).status, 401);
});

test("every Premium module has a preview for the Premium page (#35)", () => {
  for (const m of access.MODULE_ACCESS.filter((x) => x.level !== "public" && !x.hidden)) assert.ok(m.preview && m.preview.length > 40, `${m.id} needs a preview`);
});

test("admin overrides (#52): make a public module Premium, but never open up market data or admin tools", async (t) => {
  withEnv(t, ENV);
  const au = access.MODULE_ACCESS.find((m) => m.id === "australia");
  const gold = access.MODULE_ACCESS.find((m) => m.id === "gold");
  const ops = access.MODULE_ACCESS.find((m) => m.id === "ops");
  assert.equal(access.effectiveLevel(au, { australia: "premium" }), "premium");
  assert.equal(access.effectiveLevel(au, { australia: "admin" }), "public", "an override can't make a module admin-only");
  assert.equal(access.effectiveLevel(gold, { gold: "public" }), "premium", "market data stays gated");
  assert.equal(access.effectiveLevel(ops, { ops: "public" }), "admin", "admin tools stay gated");
  assert.equal(access.effectiveLevel(ops, { ops: "premium" }), "admin");
  assert.equal((await middlewareWith(null)(req("/api/australia-watch/latest"))).status, 200, "public by default");
  assert.equal((await middlewareWith(null, true, { australia: "premium" })(req("/api/australia-watch/latest"))).status, 401);
  assert.equal((await middlewareWith("free@x.test", true, { australia: "premium" })(req("/Projects/Australia-Watch"))).status, 403);
  assert.equal((await middlewareWith("paid@x.test", true, { australia: "premium" }, ["id:paid@x.test"])(req("/api/australia-watch/latest"))).status, 200);
  assert.equal((await middlewareWith(null, true, { gold: "public" })(req("/api/gold/latest"))).status, 401);
});

test("re-runnable cron jobs match vercel.json exactly", () => {
  const crons = load("lib/crons.ts");
  const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.deepEqual([...crons.CRON_JOBS].sort(), vercel.crons.map((c) => c.path.replace("/api/cron/", "")).sort());
  assert.equal(crons.isCronJob("../leads"), false);
});

test("the cron re-run only sends the secret to our own hosts", () => {
  const guard = load("lib/ownerGuard.ts", { "next/navigation": { notFound() {} }, "./supabase/server": { currentUserIsAdmin: async () => true } });
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

test("manual jobs: due dates, month-end clamping and status", () => {
  const mj = load("lib/manualJobs.ts");
  assert.equal(mj.addMonths("2026-11-23", 3), "2027-02-23");
  assert.equal(mj.addMonths("2026-11-30", 3), "2027-02-28", "clamps to the month's last day");
  assert.equal(mj.addMonths("2027-11-30", 3), "2028-02-29", "leap year");
  const job = { ...mj.MANUAL_JOBS.find((j) => j.id === "world-assets") };
  assert.equal(job.everyMonths, 3);
  const at = (d) => new Date(`${d}T03:00:00Z`);
  assert.equal(mj.jobSchedule(job, null, at("2026-12-01")).status, "ok");
  assert.equal(mj.jobSchedule(job, null, at("2027-02-15")).status, "due soon");
  const late = mj.jobSchedule(job, null, at("2027-03-01"));
  assert.equal(late.status, "overdue"); assert.equal(late.daysLeft, -6);
  assert.equal(mj.jobSchedule(job, "2027-03-01T05:00:00Z", at("2027-03-02")).nextDue, "2027-06-01", "a recorded run restarts the clock");
  for (const j of mj.MANUAL_JOBS) assert.ok(j.steps.length && j.where && (j.everyMonths > 0 || j.everyDays > 0), j.id);
  const weekly = mj.MANUAL_JOBS.find((j) => j.id === "newsletter-signups");
  assert.equal(mj.jobSchedule(weekly, "2026-11-23T01:00:00Z", at("2026-11-26")).nextDue, "2026-11-30");
  assert.equal(mj.cadenceLabel(weekly), "Every week");
  assert.equal(mj.jobSchedule(weekly, "2026-11-23T01:00:00Z", at("2026-11-25")).status, "ok");
  assert.equal(mj.jobSchedule(weekly, "2026-11-23T01:00:00Z", at("2026-11-28")).status, "due soon");
});

test("sitemap lists public pages only", () => {
  const sm = load("app/sitemap.ts", { "next": {} }).default();
  const urls = sm.map((x) => x.url);
  assert.ok(urls.includes("https://a3ro.com.au/Projects/Australia-Watch"));
  assert.ok(urls.includes("https://a3ro.com.au/markets"));
  for (const gated of ["Bull-Market-Finder", "Gold-Tracker", "BTC-Tracker", "Earnings-Beat", "Regime-Shift", "/owner"]) assert.ok(!urls.some((u) => u.includes(gated)), gated);
});

test("passwords can only be saved from a recent emailed link (#105)", () => {
  const { signedInByRecentEmailLink: ok } = load("lib/emailLinkSession.ts");
  const now = 1_800_000_000;
  for (const method of ["otp", "magiclink", "recovery", "email/signup"]) assert.ok(ok([{ method, timestamp: now - 60 }], now), method);
  assert.ok(!ok([{ method: "recovery", timestamp: now - 16 * 60 }], now), "link older than 15 minutes");
  assert.ok(!ok([{ method: "password", timestamp: now - 10 }], now), "password sign-in");
  assert.ok(!ok([{ method: "oauth", timestamp: now - 10 }], now), "Google sign-in");
  assert.ok(!ok([{ method: "recovery", timestamp: now + 3600 }], now), "timestamp in the future");
  for (const bad of [undefined, null, "otp", {}, [{}], [{ method: "otp" }]]) assert.ok(!ok(bad, now), JSON.stringify(bad));
  // A later password sign-in doesn't matter as long as the link entry is recent.
  assert.ok(ok([{ method: "password", timestamp: now - 5 }, { method: "otp", timestamp: now - 120 }], now));
});
