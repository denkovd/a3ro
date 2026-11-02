# Australia Watch refresh and release dates

The module displays quarterly seasonally adjusted annual CPI (headline and
trimmed mean), monthly seasonally adjusted unemployment, and monthly hours worked.
Monthly CPI publication dates are also shown, but are not the dates when the
quarterly observations change.

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
selects the next March/June/September/December reference period. Release times
use Australia/Sydney daylight saving rules.

The browser reloads visible snapshots every minute and on focus/visibility
return. Refresh failures preserve the last loaded data and display a warning.
Source verification older than 48 hours is flagged separately from the age of
the reference period. Observation freshness uses the latest published ABS
period when available, with the existing estimated lags as a labelled fallback.

Checks:

```powershell
node --test tests/australia-watch.test.mjs tests/api-security.test.mjs
node --import ./backend/node_modules/tsx/dist/loader.mjs --test backend/tests/australiaWatch.test.ts backend/tests/absReleases.test.ts
npx tsc --noEmit --incremental false
npm --prefix backend run typecheck
```
