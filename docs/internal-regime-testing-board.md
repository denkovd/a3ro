# Internal regime testing board

> **Rebuilt on main, 28 Nov 2026.** The lab's asset-trend baseline is `TREND_SETTINGS` in
> `backend/src/macro/allocation.ts`, a research-only setting. The live allocation is unchanged:
> `BASELINE_SETTINGS` stays the approved 14 Nov macro rule (regime × trend × cycle drag, gold untimed).
> Daily 21/63-observation trend signals live in `backend/.backtest-cache/lab-trends.json`
> (`npm --prefix backend run backtest:trends`), not in the published `public/data/regime-backtest.json`.
> Run the lab with `npm run dev:research` (127.0.0.1:3100/internal/regime-lab) or
> `npm --prefix backend run backtest:internal`.


Local-only research board at `/internal/regime-lab`. It reuses the existing
market-regime history, economic GRID labels, cycle headwind counts, daily
21/63-observation momentum histories and adjusted portfolio prices. It does not
change live allocation settings or add a link to the public navigation.

## Open locally

From the repository root:

```powershell
npm run dev:research
```

Open `http://127.0.0.1:3100/internal/regime-lab`. Both page and calculation API
return 404 outside development or when addressed through a non-loopback host.
The API also rejects cross-origin browser requests. There are no credentials,
database writes or new external data calls in this flow. Production deployment
does not enable the board.

## Default experiment

- Fresh execution window: 3 January 2022–9 October 2026, using the shared end
  date of the existing dataset; this does not refresh prices to November.
- Earlier/later split: first execution date on or after 1 January 2024.
- Asset trend: 63 daily observations; 21 is also selectable. These are our own
  VAMS-like calculations, not verified copies of 42 Macro's proprietary signal.
- Weekly observation at the first equity-session close, using strictly prior
  dated signals. Three consecutive weekly proposals confirm a new sleeve
  exposure. Confirmation is causal and calculated from pre-window warm-up
  history; the post-2022 simulation still begins with a fresh, costed purchase.
- Full/half/zero entry targets for independent 60/30/10 sleeves. The simulator
  trades only when a confirmed target changes. It does not restore weights
  each week or month. Actual weights can drift beyond their entry targets.
- BIL cash earns adjusted returns including distributions. All-in one-way cost
  scenarios: stocks 10 bp, gold 10 bp, Bitcoin 25 bp, BIL cash 5 bp. These inputs
  are editable estimates, not broker-verified quotes. Each actual purchase or
  sale pays its corresponding cost; fund expenses remain embedded in prices.

The severe headwind threshold defaults to four of six cycles. Editable
favourable-regime hypotheses initially favour stocks and Bitcoin in Goldilocks
and Reflation, and gold in Goldilocks and Deflation. They are explicit test
assumptions, not fitted scores or claims about universal asset behaviour.

## Comparisons

The board always retains all five hypotheses, plus two benchmarks:

| Rule | Exposure decision |
|---|---|
| Asset trend only | Own trend gives full, half or zero |
| Market regime only | Full in a favourable regime; otherwise cash |
| Regime + trend alignment | Own trend sizing while regime is favourable; otherwise cash |
| Trend + severe headwind guard | Own trend, with stocks/Bitcoin in cash at the severe threshold; gold follows its own trend |
| Macro permits half exposure | Own trend, with at least half exposure in a favourable regime; severe headwinds still override stocks/Bitcoin |
| Static 60/30/10 · monthly | Monthly restoration of 60/30/10 |
| 60/30/10 · buy and hold | Initial purchase only, with weights subsequently drifting |

The macro-entry rule tests supportive regime conditions as a permission to hold
half exposure even while momentum is bearish. It does not claim to identify
specific news catalysts or reproduce Dr. Mo's full long/short signal table.

Metrics include net Sharpe versus BIL, CAGR, drawdown, average exposure, turnover,
execution dates, directional campaigns and annual/earlier/later performance.
The primary gate is Sharpe above 1 and an advantage over monthly static 60/30/10.
The screen additionally requires the lower endpoint of the exploratory Sharpe
advantage range to exceed zero, and no more than three campaign starts in any
year. Activity is also displayed separately. This is not deployment approval or
proof of an out-of-sample edge.

Sharpe ranges use 500 deterministic paired circular block bootstrap draws of
21 consecutive holding intervals, retaining common shocks and some serial
dependence. They do not adjust for model selection or repeated experimentation.

## Move counting

Full → half → zero is one defensive campaign; zero → half → full is one
rebuilding campaign. Subsequent same-direction execution dates remain in that
campaign until the next reversal. A simultaneous increase in one sleeve and
reduction in another is classified as a rotation, so netting cannot hide it.
Each rotation is a separate campaign. Initial deployment is excluded from move
counts but pays costs. The final price mark cannot create an unexecuted move.
Campaigns spanning years are assigned to the starting year. The ledger shows
staged dates, target exposure and separate execution/turnover counts; the 0–3
preference is reported, not forced by suppressing valid signals.

## Correlations and phases

The correlation explorer separates:

1. **Signals → subsequent returns:** known market/economic regime indicators,
   cycle counts and each asset's trend versus future relative wealth returns
   over cash, at 5/21/63-session horizons. Windows do not overlap. It displays
   Pearson and Spearman correlations, valid sample sizes, and earlier/later
   values excluding windows crossing the split. Cells open a scatter plot and
   dated observations. Constant signals have no correlation estimate.
2. **Contemporaneous returns:** daily co-movement of assets, benchmarks and the
   selected rule. This describes diversification rather than predictive content.

Rule-return correlations partly reflect the signals used to construct the rules.
Raw asset outcomes are a more direct predictive diagnostic. Neither replaces
the incremental benchmark comparison. Non-overlapping returns can remain
dependent, and repeated monthly macro labels are not independent phase events.
No IID p-values or multiple-testing-adjusted significance claims are produced.

Phase analysis groups contiguous episodes using the label available at entry.
It shows actual period returns and equal-episode mean relative growth per
21 sessions, with exploratory whole-episode resampling ranges. First/last
partial episodes are excluded from summaries. Revised macro labels and
approximate release lags prevent a claim of real-time historical replication.

## Initial findings

Default run, 3 November 2026, through the existing October price window:

| Rule | Sharpe | CAGR | Max drawdown | Directional moves/year |
|---|---:|---:|---:|---:|
| Static monthly | 0.790 | 15.93% | −23.97% | — |
| Buy and hold | 0.710 | 14.46% | −23.39% | — |
| Trend only | 0.648 | 10.17% | −13.67% | 5.7 |
| Market regime only | 0.927 | 12.65% | −7.57% | 4.2 |
| Alignment | 0.960 | 10.90% | −6.56% | 6.1 |
| Headwind guard | 0.633 | 9.91% | −13.67% | 6.7 |
| Macro permits half | 0.771 | 11.61% | −15.02% | 7.1 |

No rule clears the Sharpe target or preferred move frequency. Alignment spends
only about 35% invested on average; its improved drawdown comes with substantial
foregone participation. Its Sharpe advantage range versus static spans about
−0.68 to +1.07. These results concern the stated hypotheses and monthly historical
regime reconstruction; they do not invalidate or replicate Dale's system.

Across 56 disjoint 21-session windows, exploratory rank correlations include:

| Known feature → future asset return over cash | Full | Earlier | Later |
|---|---:|---:|---:|
| Economic Goldilocks → stocks | +0.307 | +0.294 | +0.323 |
| Cycle headwinds → Bitcoin | −0.298 | −0.134 | −0.373 |
| Cycle headwinds → stocks | −0.266 | −0.332 | −0.158 |

These are selected research leads from a larger matrix, without selection or
multiple-testing correction. Similar signs across two inspected slices do not
establish significance or a profitable trading rule.

## Save, export and reproduce

Save named applied experiments in browser-local storage, restore settings, and
explicitly rerun against current history. Dirty settings are labelled; old
results stay visible until a successful rerun. Export includes all rules,
configuration, data timestamps, equity curves, campaign ledgers, phase results,
correlations and dated forward observations.

For a terminal report, from `backend/`:

```powershell
npm run backtest:internal
npm run backtest:internal -- --config path/to/exported-experiment.json
```

The generated JSON is written to ignored
`backend/.backtest-cache/internal-regime-report.json`. Live allocation rules and
the public research defaults remain unchanged by these experiments.

Method references: [multiple-signal backtesting](https://www.nber.org/papers/w21329),
[Pearson correlation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html).

## Verification

82 focused backend tests and nine frontend/access tests pass; frontend and
backend TypeScript checks pass. Tests cover per-asset and cash-leg costs,
causal weekly confirmation, drift without scheduled trading, staged campaign
counting, missing/same-date data, disjoint future-return windows, correlation
edge cases, and production/cross-origin access rejection.

Local Chrome reproduced the audited default results, recalculated after changing
the lookback/horizon, switched between forward and contemporaneous correlations,
opened a correlation drill-down, displayed phase periods and campaign ledgers,
and persisted a named experiment across tabs. No application console errors were
observed in these checks. Full result serialization is also available through
the terminal report; browser download retrieval was not confirmed by automation.

## Weekly observation experiment · 3 November 2026

The reference already observes once a week, but requires three consecutive
weekly proposals before changing a sleeve's target. This experiment accepts
one weekly observation. It retains the 63-observation asset trends, regime
mapping, headwind threshold, cash return, cost estimates and 2022-onward window.
There are still no calendar-based weekly rebalances when targets are unchanged.

Common execution window: 3 January 2022–9 October 2026. Costs remain stocks/gold
10 bp, Bitcoin 25 bp and BIL cash 5 bp per dollar bought or sold.

| Rule | Three-review Sharpe | One-review Sharpe | One-review CAGR | One-review max drawdown | One-review moves/year |
|---|---:|---:|---:|---:|---:|
| Static monthly 60/30/10 | 0.790 | 0.790 | 15.93% | −23.97% | — |
| Buy and hold 60/30/10 | 0.710 | 0.710 | 14.46% | −23.39% | — |
| Asset trend only | 0.648 | 0.641 | 9.90% | −19.22% | 21.2 |
| Market regime only | 0.927 | 0.755 | 10.73% | −11.33% | 4.2 |
| Regime + trend alignment | 0.960 | 0.783 | 9.63% | −7.22% | 14.3 |
| Trend + headwind guard | 0.633 | 0.592 | 9.29% | −19.22% | 20.8 |
| Macro permits half exposure | 0.771 | 0.630 | 9.85% | −20.09% | 19.7 |

Alignment remains the strongest active rule at one-review confirmation, but
falls just below the static benchmark and below Sharpe 1. It has 68 directional
campaigns over the period, versus 29 for three-review confirmation, and 80
execution dates versus 34. Its earlier/later Sharpe values are 0.207 / 1.071;
the exploratory 95% Sharpe-advantage range versus static is approximately
−0.815 to +0.888. No active rule clears the performance or activity screen.

This comparison shows that removing persistence confirmation increased activity
without improving Sharpe in this sample. It does not test a new weekly market-
regime history: regime labels remain the existing monthly reconstruction, while
asset trend inputs and equity marks are daily. The live strategy and board's
three-review default are unchanged.

To reproduce from `backend/`:

```powershell
npm run backtest:internal -- --config research/weekly-observation.json
```

In the board, set **Consecutive weekly confirmations** to **1 weekly review**
and select **Run comparison**. The complete paired reports are retained locally
in ignored `.backtest-cache/weekly-observation-comparison.json`. Ten focused
research tests passed for this experiment, including causal weekly observation,
drift without forced rebalancing and staged campaign counting.
