# Australia Watch refresh and release dates

Indicators are defined once in `backend/src/australia/registry.ts` (source key,
frequency, transform, baseline rules, release family and page section). Adding an
indicator means adding one registry entry plus a parser fixture and test. See
[australia-watch-upgrade-plan.md](australia-watch-upgrade-plan.md) for the roadmap.

Primary series: complete Monthly CPI annual change. Headline uses ABS `CPI` 2.0.0
key `3.10001.10.50.M` (original, the RBA target measure). Trimmed mean uses
`3.999902.20.50.M` (seasonally adjusted). Also monthly seasonally adjusted
unemployment and monthly hours worked. Monthly CPI starts in April 2024, so the
historical norm (mean, sd, z) is withheld until 36 prior months exist.

Comparison series: quarterly seasonally adjusted annual CPI (headline and trimmed
mean, `CPI_Q`). It sits lower on the page and is kept while the ABS publishes it (at
least 18 months from November 2025). If the ABS retires `CPI_Q`, delete those two
registry entries. Stored rows stay in the database but are no longer served.

`/api/cron/australia-watch` runs independently of the market ingestion job at
02:15 UTC daily (12:15 AEST / 13:15 AEDT), after the ABS 11:30 release. It requires
the existing `CRON_SECRET` bearer token. Each ABS request has a 30-second timeout;
failures retain stored observations and record degraded fetch health. Partial
failures return HTTP 502 so monitoring can detect them. Deploy `vercel.json`
together with the dedicated route to activate this schedule.

`/api/australia-watch/latest` reads observations and source health from storage.
It also reads the official CPI and Labour Force latest-release pages. Release
metadata is cached for one hour using Next's persistent data cache; failure of
either calendar does not hide observations or the other calendar. Dates come
from ABS rather than a guessed weekday, including holiday delays. Quarterly CPI
selects the next March/June/September/December reference period. Monthly and
quarterly CPI share one CPI page request. When the calendar is unavailable,
freshness falls back to each indicator's `releaseLagDays` (29 days for CPI, 21 for
Labour Force, 45 for quarterly). Release times
use Australia/Sydney daylight saving rules.

The browser reloads visible snapshots every minute and on focus/visibility
return. Refresh failures preserve the last loaded data and display a warning.
Source verification older than 48 hours is flagged separately from the age of
the reference period. Observation freshness uses the latest published ABS
period when available, with the existing estimated lags as a labelled fallback.

Checks:

```powershell
node --test tests/australia-watch.test.mjs tests/api-security.test.mjs
node --import ./backend/node_modules/tsx/dist/loader.mjs --test backend/tests/australiaWatch.test.ts backend/tests/absReleases.test.ts backend/tests/australiaRegistry.test.ts
npx tsc --noEmit --incremental false
npm --prefix backend run typecheck
```
