# Australia cost of capital

> Superseded for current monthly updates by [Monthly cost of capital](monthly-cost-of-capital.md). The seven-market process uses a common MSCI calculation and checks Australia one day after the RBA release. This document and its old JSON/script retain the separately labelled historical Australian comparison; do not keep running a duplicate Australia-only refresh.

Australia is a public-source proxy alongside the six dated 42 Macro editorial rows. It is not a new observation from the July 2026 editorial table. All values are percentage points per annum.

## Current observation

Calculate `100 / trailing P/E + nominal 10-year Australian government bond yield`. Use the trailing P/E (not forward P/E or dividend yield) from the [MSCI Australia Index profile](https://www.msci.com/indexes/index/903600/msci-australia-index). Match its profile observation month to series `FCMYGBAG10` in the [RBA F2.1 monthly data](https://www.rba.gov.au/statistics/tables/csv/f2.1-data.csv). The RBA series is a monthly average, not a month-end yield. Never combine different months or replace missing data with zero.

Seed checked on 1 November 2026: September 2026 trailing P/E 19.16; September 2026 bond yield 5.283%; derived proxy 10.5022066806%. The observation date is separate from the date checked.

## Fixed historical reference

The reference is the arithmetic mean of the same expression over 97 quarterly observations from March 1995 through March 2019: 10.9011521927%. Average each quarter's earnings yield, not the inverse of the average P/E.

P/E inputs are `Total_modern` from `R code/graphs/18,19.Price to earnings ratio.csv` in the [RBA RDP 2019-04 supplementary archive](https://www.rba.gov.au/publications/rdp/2019/2019-04/supplementary-information.html). These are the paper's modern ASX equity series. Bond inputs are the same quarter-end months' monthly average 10-year yields, from the [historical RBA F2 table](https://www.rba.gov.au/statistics/tables/xls-hist/f02histhist.xls) through May 2013 and F2.1 thereafter. Starting in 1995 avoids combining earlier last-business-day bond data with monthly averages. The full paired inputs and source URLs are retained in `lib/data/australia-capital-baseline.json`.

The current MSCI and historical ASX benchmarks differ. This is an indicative Australian broad-equity comparison, not a continuous same-index series. Its sample and benchmark are also different from the international editorial rows. The UI identifies those differences. The reference is fixed and is not extended with irregular snapshots or silently changed at refresh time.

## Monthly refresh

The original Australia-only automation on the 10th has been replaced by the seven-market release-aware process in `docs/monthly-cost-of-capital.md`. The commands below document the legacy calculation, not the active update schedule. Verify the MSCI profile's trailing P/E and its own observation date using the official webpage or factsheet. Its public webpage may require browser access, so the script intentionally does not scrape or bypass a browser challenge.

Run from the repository root, using the verified observation date and trailing P/E:

```
npm run refresh:australia-capital -- --as-of 2026-09-30 --pe 19.16
node --test tests/australia-capital.test.mjs tests/us-regime.test.mjs
npx tsc --noEmit --incremental false
```

The command fetches matching RBA data, validates inputs, and atomically updates `public/data/australia-cost-of-capital.json`. It refuses missing months, non-positive P/E inputs, future observations and backward date updates. A failed fetch leaves the last successful file intact. Preserve the old observation if the next month is not yet published; do not relabel its date as the current month. The UI flags observations older than 75 days.

The automation updates this local checkout and reports changes or problems. Publishing to the hosted website requires the normal code deployment; the schedule does not grant permission to commit, push or deploy changes.
