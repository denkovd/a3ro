# A3RO security review — 26 November 2026

Follow-up to the 29 October review, covering what has been added since: accounts (Google and email link, passwords from #105), Premium (`user_access`), the admin pages under `/owner`, the account page and its APIs, and the newer tables. Roadmap item #92. Like the October review, this one doesn't claim the app has no vulnerabilities.

| Finding | Evidence and remediation | Status |
| --- | --- | --- |
| Medium: Premium data in a public static file | `https://a3ro.com.au/data/regime-backtest.json` (9 MB) returned 200 to anyone. It holds the US regime signals (a Premium module) and Yahoo Finance price history (market data, which must not be public under #18). Only the Premium Regime-Shift page reads it. The file is now listed under the US regime module in `lib/access.ts` and in the middleware matcher, so it gets the same 401/403 as `/api/regime`. Middleware runs before Vercel's CDN cache, so cached copies are covered too. Moving it behind an API route wasn't possible: Vercel caps function responses at 4.5 MB. A new test in `tests/access.test.mjs` checks that it stays gated. | Fixed; deploy and re-check |
| Medium: Premium data readable through the Supabase API | `watchlist` and `earnings_surprises` had an open SELECT policy and grant for `anon`, so anyone with the publishable key could read Earnings Beat data directly. `pipeline_runs` had a policy (but no grant). Policies and grants were removed (migration 030, 55cd2d4). | Applied live |
| Low: leaked-password check off | The Supabase advisor flags HaveIBeenPwned checking as disabled. It's only available on paid plans. As a stand-in, passwords set from `/account` must be 10+ characters. | Accepted until Supabase Pro |

## Checked, no change needed

- **Database.** Every public table has RLS on. No client role (`anon`, `authenticated`) has SELECT or write access to any of the new tables (`app_errors`, `site_events`, `module_settings`, `manual_job_runs`, `cron_runs`, `user_access`, `user_profiles`, `user_feedback`, `leads`). The app reads them on the server only. The advisor's 61 "RLS enabled, no policy" notices are this intended deny-all setup.
- **Admin routes.** Middleware sends non-admins a plain 404 on `/owner/*` and a 401 on `/api/owner/*`. Every admin page also checks for an admin on the server (`requireOwner` or `currentUserIsAdmin`). Every `/api/owner/*` route is POST-only behind `ownerWriteAllowed`, which requires same-origin and an admin. An admin is an email in `OWNER_EMAILS` that is also confirmed; with the variable unset, nobody is an admin. Live probes while signed out: `/api/owner/users` → 401, `/owner/users` → 404.
- **Premium gating.** Middleware verifies the session with Supabase (`getUser`), not just the cookie. Premium comes from `user_access`, and any lookup failure counts as no Premium. A test checks that every module page and API prefix is in the matcher. Admin overrides can never make a market-data module public. Live probe: `/api/bull/scan` while signed out → 401. Asset pages (`/assets/*`) are public on purpose: they show TradingView widgets, our own notes and a locked Premium teaser, with no stored market data.
- **Account APIs.** `/api/account/*` and `/api/newsletter/me` require a signed-in account. Writes must also be same-origin. The email address always comes from the session, never from the request.
- **Public write endpoints.** `/api/events` and `/api/leads` are same-site JSON only, with size limits and per-client rate limits. Leads also has a honeypot field.
- **Cron.** Every `/api/cron/*` route requires `CRON_SECRET` and fails closed when it's unset. The exception is `cron/earnings`, which is retired and always returns 410 without doing anything.
- **Internal research lab.** `/internal/regime-lab` and its API return 404 unless the server runs in local development (`localResearchRequestAllowed`). This code is untracked and not deployed.
- **Auth settings.** Site URL is `https://a3ro.com.au`. Redirect URLs are `https://a3ro.com.au/**` and `http://localhost:3000/**`; the `vercel.app` entries were removed (#59). Post-login `next` is limited to same-site paths (`safeNextPath`, tested).
- **Headers.** Live: HSTS (2 years), `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies, and a CSP with `base-uri 'self'; object-src 'none'; frame-ancestors 'none'`. Gated responses are `private, no-store` and `noindex`.
- **Secrets.** No keys or tokens in tracked files; only `backend/.env.example`. Browser code uses only `NEXT_PUBLIC_SUPABASE_URL`, the publishable/anon key and two public API URLs.
- **Dependencies.** `npm audit`: 0 vulnerabilities (site and backend).

## Validation

- `tests/access.test.mjs`: 18 passed. `npm run test:security`: 65 + 8 passed. TypeScript clean for the changed files.

## Remaining

1. Deploy, then check that `https://a3ro.com.au/data/regime-backtest.json` returns 401 when signed out and that the Regime-Shift backtest still loads for a Premium account.
2. Sign-up abuse: email sign-ups currently go through Supabase's built-in sender, which sends only a few emails an hour, so mass sign-up is throttled for now. When Resend becomes the SMTP sender (#36/#59), set Auth rate limits in Supabase (Authentication → Rate Limits), and consider turning on CAPTCHA (Turnstile) for sign-up.
3. The CSP has no `script-src`, so it doesn't stop injected scripts. A nonce-based CSP is a later hardening step that should be tested against the TradingView widgets.
4. Carried over from October: the server still connects as the `postgres` role (a least-privilege role would limit the damage from any server compromise), and the event/lead rate limits live in memory per instance.
