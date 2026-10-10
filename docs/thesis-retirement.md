# Thesis Lab retirement

Removed October 7, 2026 after pushing checkpoint
`96d39da1280a43fa6a9e8eb5b0ff73cc56810940` to GitHub.

## Removed

- Thesis Lab page, homepage teaser, Pressure Test, Grill Me, scenarios,
  portfolio-risk UI, and their client data helpers.
- Thesis and portfolio API routes, backend engines, repositories, exports,
  and feature-specific tests.
- The write-token login and guard, whose only protected consumers were the
  removed feature's APIs. Cron authentication remains in place.
- The `migrate:thesis` package script and commented-out homepage render sites.

## Preserved

The homepage retains five cards: Trend Finder, Regime, Earnings Beat,
Australia Watch, and Commodity Watch. Commodity Watch retains its Oil, Gold,
and Bitcoin tools. The legacy Regime Finder route/redirect configuration,
market engines, allocation panel, signal sources, ingestion jobs, alerts,
lead capture, and recent loading optimizations are preserved.

The historical `backend/migrations/012_thesis.sql` remains as migration
history. No migration, table drop, or record deletion was run. Existing
database records are not removed by this change. The old `DECISIONS.md`,
`REVIEW.md`, and security/audit notes describe historical states, not active
features; this document records their superseding retirement.

## Verification

- Production build passed and no longer lists Thesis Lab, portfolio APIs,
  or login routes. Homepage first-load JavaScript remains 146 kB.
- All 435 remaining backend tests passed; all six optimization tests passed.
- Backend TypeScript checks passed. Two pre-existing readonly-to-mutable
  casts in the oil backfill script were removed to unblock this check;
  iteration behavior is unchanged.
- Homepage and the seven retained tool routes returned HTTP 200 in the
  local production preview.
- The retired Thesis Lab, thesis API, portfolio API, and login URLs returned
  HTTP 404 in the local production preview.
- An import/reference scan found no active dependencies on the removed
  feature in application, backend source, or script code.

This verifies the removal boundary and retained application structure. It
does not establish freshness or investment value of existing market feeds.
The existing Google Fonts build-download warning and local dependency
version mismatch remain separate follow-up work.

Local preview: `http://localhost:3100` while the preview process is running.
The removal has not been pushed or deployed.
