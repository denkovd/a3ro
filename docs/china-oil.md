# China oil activity

The China marker opens a dedicated national crude buying and refining panel.
Imports, processing and domestic production carry source links, publication
dates, reporting periods, year-on-year changes and calendar-day averages.
The coastal point is a navigation anchor rather than a terminal measurement.

## Official sources

- NBS English energy releases: https://www.stats.gov.cn/english/PressRelease/
- China Customs preliminary import releases:
  http://english.customs.gov.cn/statics/report/preliminary.html

GACC publishes its table links over HTTP. The adapter uses those published
URLs; certificate verification is never disabled. Local Node downloads may
need `node --use-system-ca` to use the host's trusted certificate store.

The existing oil cron's corridor cycle polls independent NBS and Customs
adapters. NBS discovery scans up to four release-index pages, retrieving the
two latest energy reports. Customs retrieves the last three periods and
matching periods from the previous year. A source failure leaves retained
observations intact and does not stop the other physical feeds.

Existing `corridor_metrics` stores all three series; no schema migration is
needed. China API metadata is allowlisted. Monthly freshness uses a 90-day
allowance from month start to account for publication lag and holidays.
Refresh timestamps never renew the reporting period.

## Periods and comparisons

Volumes use million tonnes (Mt), preserving the original Customs quantity in
10,000 tonnes for audit. No density-dependent barrel conversion is assumed.
NBS growth uses its published comparable-enterprise-coverage rates. Customs
monthly growth is calculated against the matching prior-year period volume;
the adjacent cumulative-growth table column is never labelled monthly YoY.
Reported Jan–Feb growth is used for that combined period.

January–February remains a single reporting period for both sources. Customs
February-only quantities are not substituted for its Jan–Feb cumulative total.
Charts divide period totals by actual calendar days, including leap years,
and position points by reporting date. This avoids comparing a two-month
total directly with a one-month total. The narrative requires matching,
non-stale reporting periods and available growth figures.

Imports and processing do not establish domestic fuel consumption or inventory
levels. Product exports, supplier mix, refinery events and a reconciled crude
balance remain follow-on layers.

## Backfill and validation

From `backend`, validate public sources before writing:

```powershell
node --use-system-ca --import ./node_modules/tsx/dist/loader.mjs scripts/backfill-china-oil.ts --latest
node --use-system-ca --import ./node_modules/tsx/dist/loader.mjs scripts/backfill-china-oil.ts --from=2024-08-01
node --use-system-ca --import ./node_modules/tsx/dist/loader.mjs scripts/backfill-china-oil.ts --from=2024-08-01 --write
```

Backfill uses a temporary cache of public articles, rechecks release indexes,
deduplicates overlapping NBS translations by publication date, and reads
written observations back from storage. Errors are reported with source URLs
and produce a nonzero exit. Verified independent records can still be written.
The completed 2026-10-11 backfill wrote 69 observations: 23 periods per metric
from August 2024 through August 2026, including combined Jan–Feb periods.

Tests cover quantity units, monthly versus cumulative growth, changing NBS
wording, Jan–Feb formats, source discovery, future dates, malformed releases,
freshness, period mismatch, public provenance and provider isolation.

```powershell
node --import ./node_modules/tsx/dist/loader.mjs --test tests/chinaOil.test.ts tests/corridorRepo.test.ts tests/corridorPipeline.test.ts
```
