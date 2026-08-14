---
High

H1 — Every mutating API endpoint is unauthenticated

  Public dashboard endpoints — any module (Treeat, Commodity Watch) exposed without auththat shouldn't be, or leaking internal signal weights/config?

  Client-side exposure — check bundled JS for embedded secrets, internal API base URLs, or unthrottled endpoints
  callable directly by end users.

  Dependency risk — flag outdated/vulnerable packages, especially in any charting, WebSocket, or real-time data libraries.

  Access control — confirm module-level access (e.g., "OPEN MODULE" links) can't be used to reach admin/config routes.

  Return findings as: severity, file/line evidence, why it matters, and a minimal fix. Do not speculate — if you can't find evidence in the code, say so explicitly rather than guessing.

I'll do a security review of the A3RO codebase against your seven focus areas. Let me start by mapping the repo structure.

  Searched for 1 pattern, listed 1 directory,

Repo mapped. Now scanning for credential handling, hardcoded secrets, and how API keys are passed.

  Read 8 files, ran 17 shell commands

One final check on the page routes to answer the access-control question about module links.

  Ran 1 shell command

Review complete. I examined credential handlry and built client bundles), all 30+ API
routes, the ingestion pipeline, GitHub Actioit. Findings below, ordered by severity.

---
High

H1 — Every mutating API endpoint is unauthenticated

Evidence: app/api/portfolio/positions/route.ts:42 (POST), app/api/portfolio/positions/[id]/route.ts:22,55 (PATCH/DELETE), app/api/thesis/[id]/route.ts:32 (DELETE), app/api/thesis/analyze/route.ts:39 (POST, can persist), app/api/leads/route.ts:13 (POST). There is no auth check in any of them, no middleware.ts, and no session system anywhere in app/.
Why it matters: Anyone who finds the deployment URL can create, edit, or delete your portfolio positions and theses, and pollute the leads table. Since the dashboards render this data, a stranger can rewrite your decision surface.
Minimal fix: Require a shared bearer token on all non-GET routes (same pattern you already use for cron): reject unless Authorization === "Bearer " + process.env.APP_WRITE_TOKEN, and have the frontend attach it server-side. Longer term, Supabase Auth or Vercel deployment protection.

H2 — Cron endpoints fail open when CRON_SECR

Evidence: app/api/cron/ingest/route.ts:47-57 and app/api/cron/scores/route.ts:17-20 — if (secret) { …check… }; when the env var is missing, the guard is skipped entirely (the header comment confirms this is deliberate for local dev).
Why it matters: One missing env var in prod silently exposes a 60-second, DB-writing, external-API-calling GET to the
whole internet. Repeated calls burn Vercel ce DB-backed rate gate does protect theexternal keys, which limits the blast radius, but not the DB/compute cost). The cron response also returns the full cycle report including upstream error bodies.
Minimal fix: Fail closed outside dev: if (!secret) { if (process.env.NODE_ENV === "production") return 401; }. Optionally use crypto.timingSafeEqual for the comparison.

H3 — xlsx@0.18.5 (prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363) parses an externally fetched binary

Evidence: package.json and backend/package.json both pin xlsx ^0.18.5; npm audit reports it high with no fix available via npm (SheetJS stopped publishing there at 0.18.5). It is used in backend/src/sources/comexGoldStocks.ts to parse Gold_Stocks.xls fetched live from cmegroup.com — exactly the "malformed feed response" injection path you asked about.
Why it matters: A malicious or corrupted workbook can pollute Object.prototype in the ingestion process or hang it via
ReDoS. Requires CME compromise or response tparser is the vulnerable boundary.
Minimal fix: Switch the dependency to SheetJS's patched CDN build ("xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz", ≥0.19.3 fixes the pollution, ≥0.20.2 the ReDoS) or migrate to exceljs.

Medium

M1 — Next.js 14.2.5 carries critical advisories
                                                                                                                    Evidence: npm audit flags next critical (cacimage-optimization DoS CVE-2024-47831, plusthe later middleware-bypass CVE-2025-29927 fixed in 14.2.25).
Why it matters: Honest caveat — exploitability in this app today is limited: it's App Router only (no pages/), has nmiddleware.ts, and I found no next/image usaway from any of those preconditions.
Minimal fix: npm i next@^14.2.35 (stay on 14, take all backported security fixes). The postcss high finding is build-time only — fixed by the same dependency refresh, low practical risk.

M2 — Raw internal error messages returned to any caller
                                                                                                                    Evidence: app/api/portfolio/positions/route..ts:46-50,

Evidence: No throttling code anywhere in app/api/; app/api/thesis/analyze/route.ts allows up to 30s of DB + engine compute per anonymous POST (maxDuration = 30), and app/api/leads accepts unauthenticated inserts guarded only by a honeypot field.
Why it matters: Directly callable from the client bundle by design; a trivial loop drives Vercel compute cost and Supabase connection pressure, and fills the leads table.
Minimal fix: A Vercel WAF rate-limit rule on /api/* (no code change), or a small per-IP token bucket in the hot routes.

Low

- API keys in URL query strings — Alpha Vantage (backend/src/bull/adapters.ts:225, backend/src/sources/alphavantage.ts:124), EIA, FRED, Finnhub (token= at backend/src/earnings/finnhub.ts:69). This isprovider-mandated (those APIs accept keys ons correctly uses a header where one exists).
used high-privilege secrets in .env.local — SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET etc. exist but I found zero code references, and the bundle scan confirms they're not shipped. Least-privilege cleanup: remove them from the Vercel env if nothing uses them.
- Cron secret comparison isn't constant-time (auth !== expected) — theoretical timing side channel; use crypto.timingSafeEqual when you touch H2.

Checked and clean (evidence, not speculation)

- Secrets in git history: only backend/.env.example ever committed (git log --all --diff-filter=A -- "*.env*"); .gitignore covers .env*.
- Client-side exposure: I scanned every value in .env.local against all 48 built JS chunks in .next/static and .next/server/app — zero secret values present. The only NEXT_PUBLIC_* vars referenced in code are optional API-URL overrides (btcData.ts:73, goldData.ts:143).                                                                         - SQL injection: all queries parameterized; ertRepo.ts:120, portfolioRepo.ts:84)interpolate only $n placeholder indexes and hardcoded column names.
- XSS: no dangerouslySetInnerHTML/innerHTML anywhere in app/; feed strings render through React's default escaping. Feed parsing does shape validation, numeric coercion, and bad_payload classification before storage (e.g. alphavantage.ts:129-158, comexGoldStocks.ts:90-97).
- Retry/backoff & key-ban risk: genuinely well-engineered — DB-backed circuit breaker with exponential cooldown capped at 6h (rateGate.ts), Retry-After honored, single jittered in-process retry, per-provider spacing budgets (Alpha Vantage held to 15s spacing for its 25/day tier), earnings pipeline retries twice with exponential backoff then stops. No unbounded retry loops found.
- Admin/access control: there are no admin or config routes to reach — all pages under app/Projects/* are read-only dashboards, and signal weights live in backedpoint I could find. The "OPEN MODULE" linksresolve to those public pages only. (The flip side is finding H1: nothing has auth, including writes.)
- GitHub Actions: secrets injected per-step from repo secrets, triggers are schedule/workflow_dispatch only — no
pull_request_target exposure.

Priority order if you fix nothing else: H1 (auth on writes), H2 (fail-closed cron), M1 (next upgrade — one line), H3 (xlsx swap).