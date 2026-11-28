# 21-day versus 63-day regime research

Completed 3 November 2026. This changes the research candidate to 21 observations;
the live signal remains 63. No deployment or live portfolio trades were made.

## Controlled timing comparison

Common window: 2 January 2015–9 October 2026, 2,959 equity-session holding
intervals. Each asset follows its own signal, with 60% stocks / 30% gold / 10%
Bitcoin caps and bullish/neutral/bearish fractions of 100%/50%/0%. Cash earns
adjusted BIL returns. Base costs are 10 basis points per dollar bought or sold,
including BIL purchases and sales. Both lookbacks now use daily prior-date
signals. The earlier 63-day monthly-snapshot reconstruction is a different test
and should not be compared as if it had daily signal transitions.

| Lookback / transitions | Sharpe vs BIL | CAGR | Max drawdown | Traded notional / year | Earlier Sharpe | Later Sharpe |
|---|---:|---:|---:|---:|---:|---:|
| 21 observations / daily changes + monthly reset | 0.728 | 8.27% | −20.97% | 42.61× | 1.060 | 0.274 |
| 21 observations / weekly | **1.050** | 11.33% | **−15.68%** | 17.85× | 1.364 | 0.609 |
| 63 observations / daily changes + monthly reset | 0.823 | 9.69% | −25.62% | 25.07× | 1.135 | 0.349 |
| 63 observations / weekly | 1.005 | **11.94%** | −21.21% | **11.80×** | 1.255 | **0.620** |

The split is the 3 January 2022 execution mark. Positions carry through it;
there is no restart or second initial purchase. Weekly rebalancing occurs at
the first available equity-session close, using earlier dated asset bars,
including prior Bitcoin weekends. Holdings then drift until the next week.

Weekly improves Sharpe for both windows in both chronological slices at the
base cost. The 21-day weekly version has the highest full-window Sharpe and
shallowest drawdown of these four, but its 0.044 Sharpe lead over 63-day weekly
does not hold in the later period. Faster daily trading materially increases
cost drag. For 21-day signals, weekly reduces turnover by about 58%.

## Cost sensitivity

| One-way cost | 21-day daily Sharpe | 21-day weekly Sharpe | 63-day daily Sharpe | 63-day weekly Sharpe |
|---|---:|---:|---:|---:|
| 0 bp | 1.215 | 1.255 | 1.090 | 1.127 |
| 10 bp | 0.728 | 1.050 | 0.823 | 1.005 |
| 25 bp | 0.000 | 0.741 | 0.422 | 0.822 |

At 25 bp, the weekly ranking reverses. This supports further evaluation of
weekly cadence, but does not establish that 21 observations are a robust optimum.
The four rules and cost scenarios are a limited sensitivity comparison, not a
parameter search or an untouched out-of-sample test.

## Macro phases and positioning

The dashboard now groups contiguous economic GRID or market-pricing phases,
shows each episode's dates and compounded returns, and compares assets with
cash. It also tests fixed inherited regime scores and cycle reductions on the
same candidate trend rule. Macro scores have not been fitted to the results.

For **21-day weekly, economic GRID, 10 bp**:

| Sizing rule | Sharpe | CAGR | Max drawdown | Earlier Sharpe | Later Sharpe |
|---|---:|---:|---:|---:|---:|
| Trend only | 1.050 | 11.33% | −15.68% | 1.364 | 0.609 |
| Regime scores | 0.876 | 7.07% | −10.95% | 1.110 | 0.554 |
| Cycle reduction | 1.063 | 10.24% | −13.63% | 1.336 | 0.700 |
| Regime + cycles | 0.914 | 6.77% | −9.13% | 1.111 | 0.655 |

Regime scores reduce Sharpe in both slices. Cycle reduction improves full-period
Sharpe by only 0.013, with the benefit concentrated in the later period; it also
lowers returns and drawdown. This is a hypothesis worth retaining for further
testing, not an established statistical advantage.

There are 59 complete economic-phase episodes: 16 Goldilocks, 16 Reflation,
12 Inflation and 15 Deflation. First/last partial episodes are excluded.
The table below reports net relative wealth growth of the regime-score overlay
versus trend only, normalized to 21 sessions and equally weighted by episode:

| Economic phase | Mean overlay advantage | Exploratory 95% range | Earlier mean | Later mean |
|---|---:|---:|---:|---:|
| Goldilocks | +0.04% | −0.13% to +0.23% | +0.15% | −0.05% |
| Reflation | −0.06% | −0.23% to +0.13% | −0.09% | −0.03% |
| Inflation | −0.54% | −1.36% to +0.25% | −0.87% | −0.12% |
| Deflation | −0.89% | −1.63% to −0.24% | −1.11% | −0.75% |

The inherited Deflation reduction was particularly costly in this reconstruction.
The economic label means the model's growth/inflation direction quadrant; it is
not a declaration that asset prices must fall. The phase observations do not
justify automatically treating every macro Deflation episode as risk-off.

Uncertainty ranges use 1,000 deterministic circular resamples of consecutive
same-phase episode pairs, only with at least eight complete episodes. They are
exploratory, not adjusted for multiple comparisons, and may not capture all
serial dependence. Earlier/later summaries omit episodes crossing the split.
See the dashboard for individual returns and asset-versus-cash evidence.

## Data and reproducibility

- Source artifact: `public/data/regime-backtest.json`; daily trend prices from
  Yahoo ^GSPC, GC=F and BTC-USD, portfolio returns from adjusted SPY/GLD and BTC-USD,
  cash from adjusted BIL. Refreshing trends preserves the existing portfolio and
  macro history; this analysis does not extend the price window to November.
- Macro history uses revised FRED values and approximate publication lags, not
  point-in-time vintages. [FRED real-time periods](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html)
  explain the distinction. The later sample has also been inspected repeatedly.
- Sharpe uses net arithmetic daily excess returns over cash, sample standard
  deviation and observed annual session count. It has no serial-correlation
  adjustment. Portfolio marks miss intraday and Bitcoin weekend drawdown extremes.
- Reproduce with `runResearch(dataset, { ...defaultResearchConfig(dataset.through),
  rebalance: "weekly", costBps: 10 })`. `cadenceComparisons` contains all four
  timing rules; `phases` contains economic episodes, overlays and split metrics.
  Repeat with `costBps: 0` and `25` for the sensitivity table. The default candidate
  remains 21-day daily so that changing the lookback is isolated; weekly is
  selectable and always present in the fixed comparison table.

Implementation and accounting tests cover prior-date signals, weekly/holiday
execution, cash returns and trading costs, phase boundaries, episode exclusions,
Sharpe arithmetic, legacy settings and common comparison windows.

Verification: 72 focused backend tests and six US-regime frontend tests pass;
frontend/backend TypeScript checks pass. Local Chrome loaded the static research
dataset and reproduced the audited tables when changing lookback, weekly cadence
and phase definition. A render-time calculation warning was resolved by moving
the simulation into a deferred effect with an explicit calculating state; the
verified control changes produced no new application console errors.
