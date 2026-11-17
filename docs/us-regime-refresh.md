# US regime refresh

The landing card and `/Projects/Regime-Shift` show the computed US economic
GRID quadrant. Growth is US industrial production (INDPRO); inflation is
US CPI (CPIAUCSL). The cross-asset market regime remains a separate reading.
The headline no longer includes the July 2026 editorial cost-of-capital tag.
Editorial outlooks and tables retain their displayed dates.

`runMacroCycle` fetches the latest FRED releases and saves `macro_snapshots`.
The existing ingestion job runs it at 06:00 UTC. A dedicated authenticated
`/api/cron/macro` job runs at 07:15 UTC, independent of other feeds. The
GitHub Actions bull scan also refreshes macro immediately after storing its
market bars, so its market confirmation uses the completed scan. The dedicated
job reports HTTP 503 when no snapshot was written or the cycle failed.

The browser reads `/api/macro/latest` on mount, every five minutes while
visible, and when focus, connectivity, or visibility returns. Concurrent
consumers share the existing public-snapshot cache. Background failures retain
the last successful reading with a visible warning and retry automatically.

The UI displays the computation time and both monthly observation periods.
A computation over 48 hours old, or a growth/inflation observation over 75
days old, is marked stale. Missing timestamps are marked unverified. These
thresholds allow monthly publication lag without pretending old data is current.
Economic classifications change on new releases; this is not an intraday signal.

Production activation requires deploying the code and `vercel.json`, with
`DATABASE_URL` and `CRON_SECRET` configured in Vercel and `DATABASE_URL` in
GitHub Actions. No new schema migration or FRED API key is required. The
existing `020_macro_allocation.sql` must already be applied because the
macro writer persists allocation fields along with the economic regime.

On 11 October 2026, verification found the latest stored snapshot dated
21 July 2026 (Reflation), and the existing allocation migration missing.
That additive migration was applied and checked. A live refresh was attempted,
but this machine could not reach FRED's CSV endpoint, so the July snapshot
remains the last available reading until a successful scheduled refresh.

Validation: `node --test tests/us-regime.test.mjs` and `npx tsc --noEmit`.
Inspect the stored reading with `npx tsx scripts/inspect-us-regime.ts` from
`backend`; manually refresh with the existing `npm run run:macro` command.

## Newsletter fixes (17 November 2026)

- **Macro weather.** `/api/macro/latest` now returns `weather`, a fixed
  rule over the snapshot (`backend/src/macro/weather.ts`): Sunny when
  economy and market agree and risk-on ≥ 60%; Partly cloudy when they
  agree otherwise; Rain when they disagree; Storm when they disagree
  and liquidity stress ≥ 60. `stormWatch` flags any liquidity leg at or
  above its 95th percentile. Computed on read, never stored.
- **VIX.** The equity-vol leg overlays Yahoo `^VIX` daily closes on FRED
  `VIXCLS`, which lags one to two sessions. A Yahoo failure is logged in
  `seriesErrors` and the FRED series stands alone.
- **VAMS on futures.** Percent returns on back-adjusted series are now
  measured against the raw traded level, and each read carries
  `spotReturn63` (the as-traded change). Brent (`BZ=F`) is roll-adjusted
  like WTI from now on, prospectively.
- **Timing.** The bull scan runs at 21:15 UTC Mon–Fri, after the US close,
  so a run scores that day's bars. BTC has its own cron
  (`/api/cron/btc`, 21:45 UTC) instead of running at the tail of ingest.
