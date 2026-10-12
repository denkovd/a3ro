# Earnings leaderboard repair

The leaderboard API serves cached `earnings_surprises` rows. At diagnosis, the
configured database contained 10 active tickers and 42 quarters. Its last
successful weekly refresh was 23 July 2026. The API returned HTTP 200 with
those cached rankings.

The [manual recovery job](https://github.com/denkovd/a3ro/actions/runs/38102810405)
completed successfully on 11 October 2026 for all ten active tickers. It added
seven missing quarters, bringing the cache to 49 quarters, without ticker
failures. The API reports `data_as_of: 2026-10-11T01:44:22.179Z`; the browser
shows the refreshed date and no overdue notice. The watermark fix still needs
to be published for the scheduled weekly job to resume successfully.

The scheduled job fails before it can record a new pipeline run. The
[10 October failed job](https://github.com/denkovd/a3ro/actions/runs/38070949772)
reports `RangeError: Invalid time value` in `addDaysIso`. The repository typed
`pipeline_runs.window_to` as a string, but node-postgres returns SQL `DATE`
values as JavaScript `Date` objects at local midnight. Appending `T00:00:00Z`
to that object creates an invalid date. Earlier mocks only returned strings,
so they missed the production failure after the first successful run.

The repository now converts that watermark to `YYYY-MM-DD` using its local
calendar components. Using `toISOString().slice(0, 10)` here would lose a day
in timezones east of UTC. The regression test uses pg's real DATE parser.

The UI preserves cached rankings and marks a refresh overdue after ten days
(weekly cadence plus three days of grace). A watchlist containing only null
scores stays pending. The earnings seasons panel gives typical U.S. reporting
windows, with a source link and a note that company fiscal calendars vary.

## Accuracy repairs

The read queries now cast SQL DATE values to text, preserving the announcement
day through JSON serialization. Previously a Sydney-local midnight became the
previous UTC day; Alphabet and Tesla's 22 July dates displayed as 21 July.

The audited Alphabet Q2 2026 calendar pair contains revenue of $103.617bn
(reported revenue of $119.796bn less $16.179bn of traffic acquisition costs).
The estimate's basis is not identified. The shared revenue policy excludes
Finnhub comparisons for both GOOG and GOOGL until comparable bases are established.
It applies to old cache rows on read and new ingestion on write. Original
amounts and payloads are retained; excluded surprises are null, not zero.
The evidence is in [Alphabet's company-filed release](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm).

The page's Data column describes trailing-four-quarter coverage (EPS only,
partial revenue, or EPS plus revenue), replacing the misleading High/Med/Low
confidence display. The API retains its existing confidence field as a history
depth metric, alongside explicit `data_quality` and revenue comparison statuses.
Coverage and a recent refresh do not certify accuracy against filings. EPS
remains the provider's actual/consensus pair, which can use adjusted figures.

The one-time `backend/scripts/repair-earnings-report-dates.ts` repair was applied
to seven missing latest announcement dates from verified company releases.
All ten latest reports now have announcement dates. Each repaired row retains
its original Finnhub payload plus `raw.reportDateVerification` with the official
source URL. The repair only fills null dates and refuses to overwrite a differing
existing date; it defaults to dry-run and commits all changes in one transaction.

Missing historical revenue/consensus comparisons remain unavailable: 46 of 49
cached quarters have no revenue values. Eight of the ten current scores are
EPS-only after the Alphabet exclusion. Publishing code cannot recover absent
historical estimates; these require a suitable historical source with explicit
actual/estimate bases. The policy deliberately does not fabricate them.

Validation: 60 earnings tests pass, including the real pg DATE parser,
the API's date and revenue handling, pipeline exclusion, and coverage labels.
Both app and backend typechecks pass. Live API verification confirms all ten
latest dates and excludes Alphabet revenue from scores and averages.

## Recovering the cache after the code is published

1. Run the `earnings-weekly` GitHub Actions workflow with the repaired code.
2. Run `earnings-backfill` with **all active tickers explicitly**:
   `AAPL,AMD,AMZN,AVGO,GOOGL,META,MSFT,NFLX,NVDA,TSLA`.
   The default backfill only checks tickers with fewer than four cached quarters,
   so it would skip these stale but already populated tickers.
3. Confirm both jobs succeed, then check `/api/leaderboard/earnings-beats` for a
   current `data_as_of` and updated quarter history.

The weekly calendar is capped at a 30-day lookback; the explicit stock-earnings
backfill recovers recent EPS history outside that window. Older missing revenue
may remain unavailable. GitHub already has `DATABASE_URL` and `FINNHUB_API_KEY`
secrets. Local `.env.local` has the database URL but lacks the Finnhub key;
that prevents local ingestion, but does not prevent reading the leaderboard.
