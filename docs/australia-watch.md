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

Financial conditions and external series come from RBA statistical tables
(`https://www.rba.gov.au/statistics/tables/csv/<table>-data.csv`, no key). Each
table is downloaded once per refresh even when several indicators share it
(`backend/src/sources/rba.ts`). Series IDs were confirmed against the live tables
on 18 Nov 2026:

| Indicator | Calculation | Series |
|---|---|---|
| Cash rate target | monthly average | F1.1 `FIRMMCRT` |
| Rate expectations (3y less cash) | difference, same month | F2.1 `FCMYGBAG3` − F1.1 `FIRMMCRT` |
| Yield curve (10y less 3y) | difference, same month | F2.1 `FCMYGBAG10` − `FCMYGBAG3` |
| 10-year bond yield | monthly average | F2.1 `FCMYGBAG10` |
| BBB corporate spread (3y) | difference, same month | F3 `FNFYBBB3M` − F2.1 `FCMYGBAG3` |
| Housing credit growth | 12-month, SA | D1 `DGFACH12` |
| Business credit growth | 12-month, SA | D1 `DGFACBNF12` (non-financial business; `DGFACB12` is blank) |
| AUD trade-weighted index | calendar-month average of daily | F11.1 `FXRTWI` |
| Commodity prices (A$) | level; chart shows annual growth | I2 `GRCPAIAD` |

Rules: blank cells, including RBA's empty future rows in I2, are skipped and
never treated as zero. A difference exists only for months where both series are
published, and it takes the later of the two publication dates. For daily series
the month in progress is never stored. A missing series ID or an unrecognised
date row fails that indicator loudly; other indicators still refresh. The RBA
publishes release rules rather than dated calendars, so RBA freshness uses each
indicator's `releaseLagDays` (5 days for F1.1, 10 for F2.1, 16 for F3, 33 for D1,
3 for F11.1, 4 for I2). F11.1 only goes back to January 2023, so the TWI norm is
withheld until 36 complete months exist.

The page groups primary cards by pillar (inflation, labour, financial, external)
and tags each one leading, coincident or lagging. Typical lead times are shown as
"typical, not measured". The landing card and Macro Horizon show only the
`summaryTile` series.

Phase 2 ABS series (keys confirmed against the Data API on 18 Nov 2026):

| Indicator | Dataflow | Key | Notes |
|---|---|---|---|
| Dwelling approvals | `BA_GCCSA` 1.0.0 | `1.1.9.TOT.100.10.AUS.M` | Original only in the API; charted as annual growth |
| Private house approvals | `BA_GCCSA` 1.0.0 | `1.1.1.TOT.110.10.AUS.M` | Original; annual growth |
| Housing loan commitments | `LEND_HOUSING` 1.1 | `FIN_VAL.NEWCOMMITS.DV8368.TOTDWELL.TOT.TOT.20.AUS.Q` | Quarterly since 2026; annual growth |
| Job vacancies | `JV` 1.0 | `M1.7.TOT.20.AUS.Q` | Thousands; annual growth |
| Underemployment rate | `LF_UNDER` 1.0.1 | `M23.3.1599.20.AUS.M` | Shares the Labour Force release |
| Household spending | `HSI_M` 1.6.0 | `9.TOT.CUR.20.AUS.M` | Through-the-year %, current prices |
| Goods trade balance | `ITGS` 1.2.0 | `M1.170.20.AUS.M` | A$ million |
| PPI final demand | `PPI_FD` 1.1.0 | `3.TOT.TOT.TOTXE.Q` | No TSEST dimension |
| Import prices | `ITPI_IMP` 1.0.0 | `3.6011001.Q` | No TSEST dimension |
| Wage Price Index | `WPI` 1.2.0 | `3.THRPEB.7.TOT.20.AUS.Q` | |

Not built: the Monthly Business Turnover Indicator (`BUSINESS_TURNOVER`) stopped at
September 2025, and Private New Capital Expenditure expectations (`CAPEX`) need
estimate-by-estimate handling that a single series key cannot express.

Some dataflows have no adjustment-type (TSEST) column; the parser then uses the
registry's `adjustment`. Quarterly-only publications (Job Vacancies, PPI, Import
prices, WPI, Lending) name a month or "Month Quarter YYYY" on their release page.
`QUARTERLY_PUBLICATIONS` in `absReleases.ts` maps that to the containing quarter
(Job Vacancies "August 2026" is 2026-Q3). Each ABS release page is requested once
per hour by the latest route.

Composite leading indicators come from the OECD SDMX API
(`https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,/<key>`, no
key; the trailing comma requests the latest dataflow version, v4.1 on 18 Nov 2026).
All three are amplitude-adjusted indices where 100 is the long-term trend or
average:

| Indicator | Key | Latest on 18 Nov 2026 |
|---|---|---|
| OECD composite leading indicator | `AUS.M.LI.IX._Z.AA.IX._Z.H` | October |
| Composite consumer confidence | `AUS.M.CCICP.IX._Z.AA.IX._Z.H` | October |
| Composite business confidence | `AUS.M.BCICP.IX._Z.AA.IX._Z.H` | August (runs ~2 months behind) |

The OECD has no Australian data in its business tendency survey dataflow
(`DF_BTS`), so business confidence comes from the CLI dataflow's harmonised
composite. OECD SDMX-CSV uses the same parser as the ABS (`parseSdmxCsv`). The
OECD API is rate limited; the refresh makes three OECD requests a day, and a 429
degrades only those cards. The OECD revises recent CLI months, which the
revisions table records. There is no machine-readable OECD release calendar, so
freshness uses `releaseLagDays` (20 days; 80 for business confidence). The
landing card and Macro Horizon now show the OECD CLI in place of hours worked.

## Australia Pulse

`backend/src/australia/pulse.ts` (engine version 1) computes a public summary from the
stored observations in the browser. It is deterministic, has no weights and no
forecasts, and every figure can be recomputed by hand:

- **Direction:** each primary series' charted value (after its transform) now,
  compared with 3 months earlier for monthly series or 1 quarter earlier for quarterly
  series. Moves under 0.05 in the charted unit (A$50m for A$ series) count as steady.
- **Growth diffusion:** leading primary series with a growth polarity, counted as
  improving or weakening using that polarity (e.g. falling unemployment and narrowing
  spreads count as improving).
- **Inflation diffusion:** every primary series in the inflation pillar.
- **Quadrant:** x = share improving, y = share rising, both ignoring steady series. An
  axis needs three counted series; exactly 50% is "Mixed readings". Labels describe
  readings ("Leading indicators weakening, price pressure building") and never predict.
- **What moved:** the five largest changes in z-score between each series' last two
  observations. Series without a norm are skipped.
- **Stale series** (by release schedule or lag estimate) are shown but not counted.
- **Measured lead times:** monthly leading series only. The engine finds the lag
  (0–18 months) with the highest correlation between the polarity-signed charted value
  and the later 12-month fall in the unemployment rate. Mar 2020–Dec 2021 is excluded.
  A lead is shown on the card only when r ≥ 0.3 on at least 48 months; otherwise the
  card keeps its "typical, not measured" range. Picking the best of 19 lags inflates r
  somewhat, so treat these as historical description, not a model.

Change any rule by editing the constants at the top of `pulse.ts` and bumping
`PULSE_ENGINE_VERSION`. Tests: `backend/tests/pulse.test.ts`.

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
node --import ./backend/node_modules/tsx/dist/loader.mjs --test backend/tests/australiaWatch.test.ts backend/tests/absReleases.test.ts backend/tests/australiaRegistry.test.ts backend/tests/rbaSource.test.ts backend/tests/phase2Abs.test.ts backend/tests/oecdSource.test.ts backend/tests/pulse.test.ts
npx tsc --noEmit --incremental false
npm --prefix backend run typecheck
```
