# Regime allocation research dashboard

The US regime page (`/Projects/Regime-Shift`) now includes a research panel
below today's allocation. It renders independently of the live snapshot feed.
The current 60/30/10 caps, regime scores, trend multipliers and cycle reduction
form the fixed baseline. A candidate can adjust each of those rules, the
rebalance cadence, date range, annual cash assumption and one-way trading cost.
Costs/cash assumptions and dates apply equally to both versions and benchmarks.

The panel reports daily equity and drawdown curves, total return, calendar CAGR,
annualised daily volatility, CAGR/volatility (not Sharpe), yearly returns,
conditional regime returns, exposure and turnover. A chronological split shows
earlier and later performance from the same continuous simulation, without
resetting holdings or charging a second initial purchase. Windows on either
side need at least 63 holding periods. Reusing the later period for tuning makes
it a validation comparison, not an untouched out-of-sample test.

## Data refresh

From `backend/` run:

```powershell
npm run backtest:history
```

This reads public FRED series and Yahoo daily price histories, then atomically
publishes `public/data/regime-backtest.json` only after a strict full simulation
succeeds. Commit the generated artifact with a reviewed refresh to make it
available on the deployed site. The browser reads the static dataset and runs
the pure simulator locally; changing settings does not trigger source requests.
"Reload history" reloads that published artifact, not upstream data.

If FRED's CSV endpoint is unavailable, its graph browser export supports up to
12 lines. Export untransformed series at their native frequencies, extract CSVs
from the downloaded ZIPs into a directory, then run:

```powershell
npm run backtest:history -- --fred-dir .backtest-cache/fred
```

Required IDs: INDPRO, CPIAUCSL, DTWEXBGS, T10Y2Y, BAMLH0A0HYM2, DGS10,
T10YIE, VIXCLS, WALCL, WTREGEN, RRPONTSYD, GDP, DFF, MTSDS133FMS and CP.
The importer accepts native multi-column frequency-grouped FRED CSVs. Keep
downloads outside Git; `.backtest-cache/` is ignored. No database migration,
credentials or changes to the live allocation configuration are required.

Yahoo silently converts `range=max` to monthly observations. Full-history
requests now use explicit start/end timestamps and reject reported granularity
other than daily. The default five-year scanner requests are unchanged.

## Method and limits

- Rebuild monthly signals from the current cross-asset universe and live
  regime/cycle functions, using only price bars up to the previous month-end.
- Delay macro observation eligibility by approximate lags: 2 days for daily,
  8 for weekly, 45 for monthly and 120 for quarterly observations. These lags
  do not repair revisions or substitute for verified historical release dates.
- Execute at the next equity session close, and mark holdings on each SPY
  trading day. Each asset uses its own daily close on the execution date;
  cross-market closes are asynchronous. Intra-month signals and Bitcoin
  weekend troughs are not sampled.
- Use S&P index and gold futures signals, but SPY/GLD adjusted ETF returns and
  BTC-USD portfolio returns. Adjusted prices incorporate distributions and
  embedded ETF expenses; taxes are excluded. Cash uses the explicit constant
  annual assumption, not a reconstructed Treasury bill yield.
- Holdings drift between rebalances. Costs apply before the period's return
  to the absolute change in asset weights. The benchmark has the same initial
  purchase cost; mixed static allocations rebalance monthly and pay costs.
- Refuse missing or prices over seven days old for any held or benchmark
  asset. Asset windows stay consistent: stocks/gold from 2005, all three from
  2015. The two-asset static benchmark keeps its unused 10% in cash.
- Missing historical macro legs remain pending; the historical universe is
  narrower before several current constituents began trading. This is a
  reconstruction of today's model, not archived historical model versions.
- Regime attribution uses the observed signal regime each day, including hold
  periods. Returns in each regime compound disconnected periods and are
  diagnostic, not independently executable strategies.

Saved comparisons include immutable settings, date windows, headline metrics
and the dataset generation timestamp in versioned browser storage (last 20
runs). Restoring recalculates using currently loaded data. Export downloads
the complete settings, source assumptions, diagnostics and daily result ledger.
Applying a candidate to live rules remains a separate reviewed code/config
update; the research controls cannot modify today's portfolio.

## Validation

```powershell
npm run typecheck
.\node_modules\.bin\tsx.cmd --test tests/allocation.test.ts tests/backtestResearch.test.ts
```

Tests cover drift and turnover, execution costs, calendar annualisation,
cash compounding, unavailable/future pricing, adjusted ETF distributions,
fixed baseline isolation and non-overlapping validation periods.

## Expanded benchmarks

The display labels are now **Current regime strategy** (unchanged rules) and
**Your test strategy** (editable rules). Both continue to vary exposure and cash;
fixed rules do not mean fixed portfolio weights.

Every available benchmark uses the complete shared strategy window:

| Comparison | Implementation |
|---|---|
| S&P 500 total return | Buy and hold adjusted SPY |
| Traditional 60/40 | 60% SPY / 40% adjusted AGG; monthly rebalance |
| Static 60/30/10 | 60% SPY / 30% GLD / 10% Bitcoin; monthly rebalance |
| Treasury bills | Buy and hold adjusted BIL (1–3 month Treasury bills) |
| Buffett 90/10 model | 90% SPY / 10% adjusted SHY (1–3 year Treasuries); monthly rebalance |
| Berkshire Hathaway | Buy and hold adjusted BRK-B shares |
| All Weather-style model | Our illustrative unleveraged mix: 30% SPY / 40% TLT / 15% IEF / 7.5% GLD / 7.5% DBC; monthly rebalance |
| Actual All Weather ETF | Buy and hold adjusted ALLW, restricted to its available live history |

The Buffett model reconstructs the allocation proposed for his wife's trust in
[his 2013 letter](https://www.berkshirehathaway.com/letters/2013ltr.pdf); it is
not his personal track record. BRK-B is a separate share-price benchmark, not
the company's reported growth in book value. The fixed All Weather-style mix
is an illustrative model and cannot represent Bridgewater's historical fund
returns. The actual ALLW ETF appears separately and has history only since
March 2025. Full definitions and background links are shown in the dashboard.

Benchmark ETF adjusted prices incorporate distributions and embedded fund
fees. The annual constant cash setting does not override BIL or any bond ETF.
Costs use the same one-way assumption across all portfolio models and single
assets, including initial entry. Exported ledgers include actual benchmark
turnover and exposure as well as daily returns and equity.

An ETF that began after the chosen start date appears as unavailable, with its
coverage dates. It contributes no curve or diagnostic numbers for that window.
There is no partial-period splice or invented pre-inception return. If a selected
strategy asset's last close is earlier than the requested end, the entire set
uses the last common equity-session mark and explicitly reports that adjustment.

Use the chart checkboxes or **Show all available** to compare curves. The
**Benchmark for detailed comparisons** selector changes the yearly, regime and
earlier/later diagnostic comparisons. All available benchmarks are included in
saved metrics and full exports, regardless of visible chart selections.

To add or refresh benchmark prices without rebuilding regime signals:

```powershell
npm run backtest:benchmarks
```

This preserves the original macro data timestamp, records a separate benchmark
refresh timestamp and publishes the dataset atomically after validation. The
full `backtest:history` refresh also includes these benchmark prices.

Additional tests:

```powershell
.\node_modules\.bin\tsx.cmd --test tests/researchBenchmarks.test.ts
```

They verify stock/bond return weighting, mixed-portfolio turnover and costs,
independent bill returns, full-window availability and diagnostic consistency.

## 21-day VAMS comparison and ranking

The performance table sorts available portfolios by descending total return,
with unavailable histories last. Tied returns keep their original stable order.

The explicit **60/30/10 · 21-day VAMS** portfolio is separate from both the
static 60/30/10 benchmark and the current macro strategy, which retains its
63-observation VAMS and regime/cycle reductions. This fixes the previously
missing 21-day signal comparison; changing its research row does not change
the live strategy's rules.

For each asset, compute log momentum over 21 daily observations divided by
the population standard deviation of those 21 daily log returns times √21.
Use the existing ±0.5 state thresholds. Equity/futures observations are trading
sessions; Bitcoin observations include weekends. The user-specified exposure
rule is **bullish 100%, neutral 50%, bearish 0%** of the 60/30/10 caps, with cash
absorbing the remainder. Unwarmed signals are unavailable, not fabricated.
No macro regime or cycle multipliers reduce this standalone portfolio.

Every equity execution date uses asset bars strictly before that date. Trade
at each asset's close on that execution date when a selected asset's VAMS state
changes, and rebalance monthly to restore target weights after drift. Signal
changes in excluded Bitcoin do not trigger the two-asset version. All dates,
prices, cash assumptions and costs match the comparison window. The full
daily return/exposure/turnover series joins the shared benchmark ledger for
charts, regime attribution, yearly results, validation and exports.

To build daily 21-day signals on the existing published price window:

```powershell
npm run backtest:vams21
```

The full history refresh also generates these signals. Their independent
generation timestamp is included in exports. Tests exercise 100/50/0 targets,
prior-date-only inputs, state-triggered exits and costs, missing warm-up,
excluded assets, and ledger/diagnostic consistency.

## Buy-and-hold asset comparisons

The Money Line research option was removed at the user's request. It is absent
from active metrics, chart selections, diagnostics, refresh scripts and new
exports. Its former weekly signals are removed when refreshing the published
benchmark dataset. Older browser-saved runs remain historical snapshots; restoring
their configurations recalculates the active comparison set.

**Bitcoin buy-and-hold** remains: purchase 100% BTC-USD at the first comparison
close, then hold, paying the same initial purchase cost as every other asset.

Added single-asset comparisons:

- Stocks: NVDA, AMD, AVGO, ANET, AXON, FICO, NFLX, TSLA, AAPL, MSFT, AMZN,
  GOOGL, META, COST and TPL.
- Funds: QQQ (Nasdaq-100), SMH (semiconductors) and GLD (gold).

These are a curated set of historical performers and major assets, not an
exhaustive market-wide selection or an ex-ante portfolio. The ranking uses
actual returns on the selected common window. Selection uses hindsight and
has survivorship bias; changing dates can change the ordering substantially.
Background research included Nasdaq's
[long-horizon historical stock-return tables](https://www.nasdaq.com/articles/the-10-best-performing-stocks-in-the-last-25-years)
and its [semiconductor index research](https://www.nasdaq.com/docs/semiconductors-focus-trends-shaping-next-wave-innovation).
The app's results come from downloaded adjusted price histories, not returns
quoted in those articles.

Every stock/fund is held at 100% allocation, with splits and reinvested dividends
captured by Yahoo adjusted daily closes. There is one initial purchase and no
monthly rebalancing, leverage or stock selection during the backtest. Existing
mixed allocation models still rebalance monthly. Bitcoin uses its daily USD
close without added yield. Common equity-session marks can miss Bitcoin weekend
drawdown extremes.

New assets use the same dates, costs, diagnostics, charts, saved metrics and
exports as the strategy. A stock that listed after the window starts is
unavailable for that whole window; do not splice partial-period results into a
longer comparison. AVGO uses the AVGO/Avago price history rather than inventing
a pre-listing series for the former Broadcom ticker.

Refresh with `cd backend; npm run backtest:benchmarks`. This preserves the macro
signal vintage, validates all new asset histories on the default 2015+ window,
and publishes atomically. The full history builder includes the same assets.
Tests verify 100% single-stock holding, adjusted returns, initial cost, no monthly
turnover, full-window IPO coverage, absence of Money Line and shared diagnostics.
