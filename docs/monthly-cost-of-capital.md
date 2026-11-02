# Monthly cost of capital

## Current observations and comparability

The current panel uses one calculation for all seven markets:

`100 / MSCI Standard index trailing P/E + same-month average nominal local-currency 10-year government yield`.

Use the **trailing** P/E from the configured official MSCI profile, its own month-end observation date, and the matching bond month. Never use forward P/E, an ETF P/E, CAPE, dividend yield, a different index variant, today's yield or an older bond month. The check date does not change the observation date. The free MSCI profiles can require browser access; the agent verifies the profile using web/browser tools instead of bypassing a challenge or inventing a scraping API.

The index family, earnings convention, maturity and monthly averaging are aligned. National bond estimation methods still differ: Switzerland's official 10-year measure is a zero-coupon spot yield; the other markets use par/constant-maturity/interpolated government yields. The eurozone uses the ECB's **all-issuer** curve, not a German yield substituted for the whole region. Equity sector composition, market coverage and sovereign credit risk also differ. These are indicative market proxies, not WACC or an arbitrage ranking.

The default **Same month** view selects the newest month available for all seven markets. **Latest releases** shows independently updated rows with their actual dates and warns when months differ. Validated market-month observations accumulate in the database and the local seed; a newer country release does not overwrite another country's observation or erase the preceding shared month.

No verified free historical trailing-P/E dataset covering the same seven benchmarks and common reference period was established in this investigation. The user chose free current data with separate historical references. Consequently the July 2026 editorial means and Australia's ASX research baseline remain in an explicitly historical disclosure. They do not determine ticks, current gaps, colours, or cheap/expensive claims for the new monthly rows. Do not create a long-run mean by inverting an average P/E or averaging a few new snapshots.

## Free sources

MSCI profile URLs and exact index codes live in `lib/costOfCapital.ts` and `lib/data/cost-of-capital-equities.json`.

| Market | Equity index | Nominal 10-year bond input | Normal first-check window, source-country date |
| --- | --- | --- | --- |
| United States | MSCI USA, 984000 | Federal Reserve GS10 monthly business-day average via keyless FRED CSV; same-series H.15 monthly CSV fallback | First business day of the new month + 1 calendar day |
| China | MSCI China, 302400 | MOF–ChinaBond 10-year government curve; average all published daily observations in the month | First business day + 1 calendar day |
| Eurozone | MSCI EMU, 106400 | ECB `YC.B.U2.EUR.4F.G_N_C.SV_C_YM.PY_10Y`, all issuers, monthly average of published daily par yields | First business day + 1 calendar day |
| Switzerland | MSCI Switzerland, 975600 | SNB `rendeiduebd`, `D0=CHF`, `D1=10J`; monthly average of daily spot yields | First business day + 1 calendar day |
| Japan | MSCI Japan, 939200 | MOF English JGB CSV, `10Y`; monthly average of daily observations | First business day + 1 calendar day; current-month CSV handles archival rollover |
| United Kingdom | MSCI United Kingdom, 982600 | BoE `IUMAMNPY`, published monthly average nominal 10-year par yield | Second business day + 1 calendar day |
| Australia | MSCI Australia, 903600 | RBA F2.1 `FCMYGBAG10`, published monthly average | **Day after the qualifying RBA Friday release**, at the next 09:00 Sydney run |

Release evidence:

- [RBA statistical release schedule](https://www.rba.gov.au/schedules-events/frequency-statistical-releases.html): F2.1 is published on the first Friday at least two business days after month-end, at 14:00. The calendar handles weekends, New Year's Day/its observed holiday, Good Friday and Easter Monday. Example: October 2026 bond data expected Friday **6 November**, first check Saturday **7 November**; September's first check would have been **3 October**, rather than a blanket 10th.
- [Federal Reserve H.15](https://www.federalreserve.gov/releases/h15/) and [GS10](https://fred.stlouisfed.org/series/GS10): H.15 runs on business days; September's monthly average was published 1 October 2026. The H.15 DDP fallback is being retired; prefer FRED and report failure if neither official endpoint works.
- [China MOF curve definition and release time](https://yield.chinabond.com.cn/cbweb-czb-web/czb/bzcxsmDown?locale=en_US): approximately 17:30 each trading day. Its public chart's date-range JSON provides the daily inputs; timestamps are midnight **Asia/Shanghai**, not UTC.
- [ECB yield-curve methodology and release time](https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_area_yield_curves/html/index.en.html): TARGET business days at noon; the all-issuer par curve is used consistently.
- [SNB current daily cube](https://data.snb.ch/en/topics/ziredev/cube/rendeiduebd): use the current methodology, **not** discontinued `rendoblid`/`rendoblim` (ended July 2025). The September daily export checked in this investigation was published 1 October 2026.
- [Japan MOF interest-rate files](https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm): historical plus current files; the September archive was available 2 October 2026.
- [BoE yield-curve release guidance](https://www.bankofengland.co.uk/statistics/yield-curves): daily curves normally by noon the following business day; monthly archive updates by close of the second working day. `IUMAMNPY` September data was published 1 October. The second-day window is a conservative planning allowance.

These are **planning windows**, not invented guarantees about MSCI's publication hour. Non-Australian business-day estimates count weekdays and observed New Year; actual local holidays and publisher delays can shift availability. A due date permits a check; it does not authorize publishing missing data. If MSCI has not released the same month, retain the previous row and retry. In the initial 2 November 2026 check, all seven official profiles still showed **30 September 2026**. Do not claim October data exists.

## Refresh procedure

The existing Australia Codex heartbeat is replaced by a seven-market heartbeat at **09:00 and 21:00 Australia/Sydney**. The small local plan runs first; only due/incomplete markets need source verification. The second daily window catches North American/European release dates without waiting an extra Sydney day. Once a market's expected month has been published, ordinary checks for that market stop until the next month. Keep quiet when nothing actionable changes.

1. Run `npm run refresh:capital -- --plan`.
2. For due markets, open the configured official MSCI profile using web/browser tools. Verify the **P/E** field and the profile's own **Data as of** date (not a search snippet, forward P/E, page footer or source-check timestamp). Update that market in `lib/data/cost-of-capital-equities.json` only with verified values/dates/source URL. Preserve other markets. Record `checkedAt` as the actual verification time.
3. Run `npm run refresh:capital -- --markets US,CN,EA,CH,JP,GB,AU`, narrowing the selection to markets just verified. The script only fetches due markets with the target month's verified P/E, matches bond months, calculates averages, validates, and atomically saves successful observations. One failed market keeps its prior observation without discarding healthy updates.
4. Run `npm run test:capital` and `npx tsc --noEmit --incremental false` after material data/code changes.
5. Run `npm run publish:capital`. It reads the existing server-side `DATABASE_URL`, validates the complete dataset, upserts by methodology/market/month in a transaction, and reads back the latest dates. Republishing unchanged data is a no-op. Older verification timestamps cannot overwrite newer stored inputs. Never print credentials.

For initial seeding or a verified correction to an already-published month, `npm run refresh:capital -- --force --markets AU` is available. Normal scheduled runs **must not** use `--force` to dress old inputs up as current.

Daily-series parsers require at least 12 distinct observations, early-month coverage, and coverage through the last weekday. If the final weekday was a national market holiday, the automatic parser fails conservatively. Verify the official holiday/release calendar and supply a documented `--holiday-overrides` file as described below; never forward-fill or drop a day just to pass validation. Network errors, empty values, wrong instruments, duplicate dates, future dates, mismatched months and backward updates must preserve the last success. A source failure should be reported with the market and source; never print internal credentials or raw connection errors.

A holiday override file is a JSON array with `marketId`, `asOf` (month-end), `lastTradingDay`, `sourceUrl` (the verified official calendar) and `checkedAt` (verification timestamp). Pass its path with `--holiday-overrides path/to/verified-calendar.json`. Only official MOF/BoJ, SNB, ECB or Chinese monetary/government curve domains for the respective market are accepted. The override must match the exact market-month and a final trading day within seven days of month-end. Its evidence is retained in the saved observation. This handles closures such as Japanese year-end holidays without treating an arbitrary missing last day as a holiday. The agent must verify the calendar; a syntactically valid override is not evidence by itself.

## Runtime publication

The migration is `supabase/migrations/20261102041020_monthly_cost_of_capital.sql`. Apply it with the existing repository migration runner:

```
node --use-system-ca --import ./backend/node_modules/tsx/dist/loader.mjs backend/scripts/migrate.ts supabase/migrations/20261102041020_monthly_cost_of_capital.sql
npm run publish:capital
```

`GET /api/capital/latest` reads validated database observations; the panel reloads them every five minutes and on visibility/online changes. The read query returns up to 24 months across seven markets. The table has RLS enabled and no anon/authenticated Data API access; publication uses the existing privileged server connection. The API never exposes credentials. On storage failure it serves the dated bundled seed with an explicit fallback flag; a failed browser request keeps the last successful display.

The new app code needs its normal initial deployment. **After that deployment, monthly database publication needs no commit, push or code deployment.** The Codex heartbeat runs locally; source checks and publication require the machine and Codex automation execution to be available. Do not commit, push, deploy, apply migrations, or change unrelated database data during routine automated refreshes.
