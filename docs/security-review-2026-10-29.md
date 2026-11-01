# A3RO security review — 29 October 2026

The verified database exposure is fixed in the live database. Application and dependency fixes are implemented and tested in this checkout; they have **not been deployed**. This review does not certify that the application has no possible vulnerabilities.

| Finding | Evidence and remediation | Status |
| --- | --- | --- |
| High: anonymous database access | 17 public tables had RLS disabled and SELECT/INSERT/UPDATE/DELETE grants for both `anon` and `authenticated`. These included portfolio positions, theses, BTC data, gold flow data, tape snapshots, and ten `bh_*` tables. Enabled RLS and removed unintended client-role privileges on application-owned public tables and sequences. | Applied live; independently re-audited |
| Excessive database grants | Removed write privileges, including TRUNCATE, which RLS alone does not cover. Kept the intentionally public SELECT access to `watchlist` and `earnings_surprises`; removed direct access to internal `pipeline_runs` errors. Removed automatic client table/sequence grants for future objects created by `postgres`. | Applied live |
| Vulnerable npm dependencies | Initial frontend audit reported seven affected packages, including a critical Next.js finding. Updated Next to 15.5.28, React/React DOM to 19.3.1, matching types, and PostCSS to 8.5.32, including Next's transitive copy. Restored missing lockfile integrity metadata. Both final npm audits report zero vulnerabilities. | Fixed locally |
| Database transport | Existing connection configuration did not request TLS. Both application pools and standalone database scripts now enforce certificate/hostname-verified TLS for remote hosts, using the official Supabase public CA where applicable. URL SSL options cannot silently disable verification. | Fixed locally; live TLS connection verified |
| Internal error disclosure | Public routes returned database/upstream exception messages; successful Australia/Horizon snapshots could also include persisted raw errors. Replaced these with public-safe messages while retaining appropriate response status codes. | Fixed locally |
| Contact-form resource abuse | Added a 16 KiB streamed-body limit, five-second body deadline, JSON-only input, cross-origin browser rejection, and bounded per-client/per-instance burst limits. Verified valid same-origin requests still work with Next's internal hostname handling. | Fixed locally; distributed protection remains a deployment consideration |
| Local cron authorization | Production already failed closed; development previously allowed requests without a configured secret while potentially using the production database. Cron handlers now require a secret in every environment and compare bearer tokens safely. | Fixed locally |
| Workflow command injection | Two manual workflow inputs were interpolated directly into shell programs. Moved inputs into environment variables and quoted shell expansion; restricted workflow permissions and checkout credentials where writes are unnecessary. Pinned Actions to verified commit IDs. | Fixed locally |
| Ingestion resource limits | The shared HTTP helper and COMEX workbook download released their timeout after response headers and read unbounded bodies. Timeout now covers consumption, and response size is capped at 10 MiB. | Fixed locally |
| Browser and runtime hardening | Added anti-framing, MIME-sniffing, referrer, permissions, and limited CSP headers; removed the framework identification header. Selected supported Node 24 for package engines, jobs and the container; container runs as the non-root node user. | Fixed locally |

The database migration was rehearsed inside a transaction and rolled back before application. The committed run verified server SELECT access to all 48 tables and explicitly verified permission denial for both client roles on a sensitive table. A new connection then confirmed zero exposed tables, zero client write grants, and zero unexpected read grants. No application records were read during the catalog audit or modified by the migration. Normal API smoke tests subsequently read public dashboard data successfully.

Migration: `supabase/migrations/20261029072536_restrict_public_data_api_access.sql`. Runner: `backend/scripts/harden-db-security.ts` (defaults to rollback-only rehearsal; `--apply` commits after checks). Exact previous ACL/RLS state is saved in `docs/security-db-rollback-2026-10-29.sql`. **That rollback restores the insecure permissions and is for emergency recovery only.** The migration was executed transactionally through PostgreSQL; it was not recorded by `supabase db push`, and replaying its idempotent statements is safe.

Validation completed:

- Frontend tests: **70 passed**.
- Backend tests: **577 passed**.
- Focused security tests are included in those totals (36 API and 8 backend cases).
- Backend TypeScript check and Next.js production build: passed.
- Local production HTTP checks: home, oil, BTC and earnings APIs returned 200; security headers were present. Unconfigured cron returned 503 without running ingestion; malformed JSON returned 400; cross-origin submission returned 403; same-origin honeypot returned 200 without inserting a lead.
- Root and backend `npm audit`: **0 known vulnerabilities**. SheetJS was already on the official 0.20.3 CDN package; the obsolete npm release was not installed.
- Python audit of 24 currently resolved packages reported no known advisories. The unpinned requirements cannot establish which packages a historical runner installed.
- Secret checks found no matches for known local secret values and selected private-key/token patterns in 594 tracked files and 1,433 historical Git blobs. The rebuilt browser assets were checked separately. This was a targeted scan, not a guarantee against every secret format.

Added `.github/workflows/security.yml` to run npm audits and `npm run test:security` on pushes and pull requests. It needs to be pushed to GitHub before it runs there.

Remaining operational work and limits:

1. Deploy the application changes through the normal release process. Until then, the production application still uses its previously deployed dependencies and code. Existing unrelated landing-page edits were preserved; no release or Git push was performed.
2. The contact guard is in memory and resets with serverless instances. Use shared rate limiting or a Vercel firewall rule for sustained distributed abuse. A public form cannot be protected from all automated submissions with an origin check and honeypot alone.
3. The server currently connects as the privileged `postgres` role. A dedicated least-privilege runtime role would further reduce impact from a future server compromise; provisioning and rotating production credentials was outside this repair.
4. Default function EXECUTE privileges and Supabase-managed `supabase_admin` defaults remain unchanged. No public SECURITY DEFINER functions were found. Review permissions whenever adding functions or tables through another owner.
5. Supabase CLI advisors could not run because this checkout has no linked project reference. Direct catalog and role-denial checks succeeded instead. This review did not inspect all hosting/account settings or perform destructive penetration testing.
6. The local environment has no configured cron secret; cron correctly stays disabled. Confirm the production `CRON_SECRET` is configured when deploying. No secret was generated, printed, or rotated.

Reference guidance: [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api) explains grants and RLS; [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) documents the TRUNCATE exception. Workflow handling follows [GitHub's script-injection guidance](https://docs.github.com/en/actions/reference/security/secure-use). Runtime selection follows [Node.js's supported release list](https://nodejs.org/en/about/previous-releases). The existing spreadsheet package matches [SheetJS's official installation source](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
