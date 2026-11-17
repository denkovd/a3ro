# Trend-geometry diagnostic

Dataset generated 2026-11-13, prices through 2026-11-12. Costs 25 bps one-way; idle exposure earns BIL. No Sharpe ratio is computed and no portfolio is simulated. Definitions are in the header of `backend/scripts/diagnose-trend-geometry.ts`.

| Asset | Geometry | Transitions / yr | Avg hold (sessions) | Months bull / neutral / bear (%) | Next-month excess after bull / neutral / bear (%) | Major drawdowns | Avoided (pts, avg) | Hit rate | False-negative rate | False-positive rate | Whipsaw cost (pts / yr) | Max drawdown: strategy vs buy-and-hold (%) | Rank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Equities | Current 63-observation (= 63 sessions) | 25.2 | 10 | 53 / 32 / 14 | 0.58 / 1.15 / 1.16 | 5 | 9.7 | 20% | 80% | 72% | 6.99 | -35.9 vs -55.2 | 6 |
| Equities | 21 sessions | 43.1 | 6 | 47 / 32 / 21 | 0.76 / 0.49 / 1.60 | 5 | 12.5 | 40% | 60% | 68% | 10.58 | -42.3 vs -55.2 | 5 |
| Equities | 63 sessions | 25.2 | 10 | 53 / 32 / 14 | 0.58 / 1.15 / 1.16 | 5 | 9.7 | 20% | 80% | 72% | 6.99 | -35.9 vs -55.2 | 6 |
| Equities | 126 sessions | 15.1 | 17 | 61 / 29 / 9 | 0.79 / 0.92 / 0.97 | 5 | 12.0 | 20% | 80% | 67% | 4.64 | -30.8 vs -55.2 | 4 |
| Equities | 252 sessions | 9.7 | 26 | 65 / 27 / 8 | 0.51 / 1.82 / 0.21 | 5 | 10.0 | 20% | 80% | 80% | 3.72 | -24.3 vs -55.2 | 1 |
| Equities | Blend 21/63/126/252 | 19.3 | 13 | 60 / 32 / 8 | 0.62 / 0.99 / 1.99 | 5 | 11.4 | 20% | 80% | 72% | 4.84 | -26.6 vs -55.2 | 3 |
| Equities | Asymmetric 63 (2-session re-entry) | 18.0 | 14 | 50 / 33 / 16 | 0.53 / 1.16 / 1.20 | 5 | 12.5 | 40% | 60% | 76% | 6.46 | -28.1 vs -55.2 | 2 |
| Gold | Current 63-observation (= 63 sessions) | 24.1 | 10 | 44 / 33 / 23 | 0.63 / 0.89 / 0.73 | 4 | 2.7 | 0% | 100% | 70% | 6.03 | -41.0 vs -45.6 | 5 |
| Gold | 21 sessions | 41.8 | 6 | 36 / 36 / 28 | 1.20 / -0.05 / 1.17 | 4 | 1.1 | 0% | 100% | 64% | 9.48 | -53.9 vs -45.6 | 6 |
| Gold | 63 sessions | 24.1 | 10 | 44 / 33 / 23 | 0.63 / 0.89 / 0.73 | 4 | 2.7 | 0% | 100% | 70% | 6.03 | -41.0 vs -45.6 | 5 |
| Gold | 126 sessions | 17.6 | 14 | 50 / 29 / 21 | 1.29 / -0.18 / 0.74 | 4 | 4.6 | 0% | 100% | 69% | 3.61 | -38.3 vs -45.6 | 1 |
| Gold | 252 sessions | 11.6 | 22 | 49 / 36 / 15 | 0.88 / 0.62 / 0.56 | 4 | 1.5 | 0% | 100% | 67% | 3.50 | -46.0 vs -45.6 | 3 |
| Gold | Blend 21/63/126/252 | 21.1 | 12 | 42 / 43 / 15 | 0.98 / 0.44 / 0.94 | 4 | 0.2 | 0% | 100% | 72% | 4.78 | -42.4 vs -45.6 | 4 |
| Gold | Asymmetric 63 (2-session re-entry) | 17.1 | 15 | 40 / 35 / 24 | 0.69 / 0.86 / 0.67 | 4 | 5.2 | 0% | 100% | 74% | 5.72 | -37.3 vs -45.6 | 2 |
| Bitcoin | Current 63-observation | 26.6 | 9 | 49 / 25 / 27 | 9.32 / 1.94 / 5.37 | 4 | 19.6 | 0% | 100% | 62% | 20.33 | -68.2 vs -83.0 | 6 |
| Bitcoin | 21 sessions | 39.2 | 6 | 46 / 26 / 28 | 8.76 / 5.35 / 3.64 | 4 | 22.1 | 0% | 100% | 59% | 24.31 | -62.3 vs -83.0 | 4 |
| Bitcoin | 63 sessions | 18.6 | 13 | 48 / 28 / 24 | 11.35 / -0.23 / 4.86 | 4 | 17.9 | 0% | 100% | 59% | 12.93 | -70.8 vs -83.0 | 2 |
| Bitcoin | 126 sessions | 10.8 | 23 | 55 / 25 / 20 | 7.83 / 9.24 / -0.50 | 4 | 16.5 | 0% | 100% | 66% | 10.64 | -67.4 vs -83.0 | 1 |
| Bitcoin | 252 sessions | 8.4 | 30 | 60 / 19 / 20 | 9.07 / -1.04 / 5.90 | 4 | 12.0 | 0% | 100% | 64% | 14.08 | -83.3 vs -83.0 | 7 |
| Bitcoin | Blend 21/63/126/252 | 19.4 | 13 | 51 / 34 / 15 | 9.53 / 5.08 / -0.97 | 4 | 14.7 | 0% | 100% | 65% | 11.03 | -71.9 vs -83.0 | 3 |
| Bitcoin | Asymmetric 63 (2-session re-entry) | 13.9 | 18 | 46 / 27 / 27 | 11.23 / 0.95 / 3.96 | 4 | 19.5 | 0% | 100% | 68% | 16.79 | -68.7 vs -83.0 | 5 |

## Samples and major drawdowns

- **Equities (SPY):** 2007-05-30 to 2026-11-12, 19.5 years, 234 month-ends. Major drawdowns (at least 15%): 2007-10-09 to 2009-03-09 (-55%); 2018-09-20 to 2018-12-24 (-19%); 2020-02-19 to 2020-03-23 (-34%); 2022-01-03 to 2022-10-12 (-24%); 2025-02-19 to 2025-04-08 (-19%).
- **Gold (GLD):** 2007-05-30 to 2026-11-12, 19.5 years, 234 month-ends. Major drawdowns (at least 15%): 2008-03-17 to 2008-11-12 (-29%); 2011-08-22 to 2015-12-17 (-46%); 2020-08-06 to 2022-09-26 (-22%); 2026-01-29 to 2026-11-12 (-28%).
- **Bitcoin (BTC-USD):** 2015-09-18 to 2026-11-12, 11.2 years, 134 month-ends. Major drawdowns (at least 40%): 2017-12-18 to 2018-12-14 (-83%); 2021-04-13 to 2021-07-20 (-53%); 2021-11-08 to 2022-11-21 (-77%); 2025-10-06 to 2026-06-30 (-53%).

## Recommendation by the pre-specified ranking rule

- **Equities: Blend 21/63/126/252.** 252 sessions has the lowest rank-sum, but a neighbouring lookback is outside the top half, so the result is not robust across horizons. The blend outranks the current rule and is the fallback.
- **Gold: Blend 21/63/126/252.** 126 sessions has the lowest rank-sum, but a neighbouring lookback is outside the top half, so the result is not robust across horizons. The blend outranks the current rule and is the fallback.
- **Bitcoin: Blend 21/63/126/252.** 126 sessions has the lowest rank-sum, but a neighbouring lookback is outside the top half, so the result is not robust across horizons. The blend outranks the current rule and is the fallback.

## Type I / type II trade-off

- **Equities:** fewest missed drawdowns is Asymmetric 63 (2-session re-entry) (misses 60% of 5, whipsaw cost 6.46 pts a year). Cheapest in whipsaw is 252 sessions (3.72 pts a year, misses 80%). The recommended rule misses 80% of major drawdowns, 72% of its de-risking spells are false, and those cost 4.84 pts a year.
- **Gold:** fewest missed drawdowns is 252 sessions (misses 100% of 4, whipsaw cost 3.50 pts a year). Cheapest in whipsaw is 252 sessions (3.50 pts a year, misses 100%). The recommended rule misses 100% of major drawdowns, 72% of its de-risking spells are false, and those cost 4.78 pts a year.
- **Bitcoin:** fewest missed drawdowns is 126 sessions (misses 100% of 4, whipsaw cost 10.64 pts a year). Cheapest in whipsaw is 126 sessions (10.64 pts a year, misses 100%). The recommended rule misses 100% of major drawdowns, 65% of its de-risking spells are false, and those cost 11.03 pts a year.

## Verification against the stored signal rows

- **Equities:** the 63-session state on SPY agrees with the stored state (index or futures bars) at 257 of 271 month-ends (94.8%).
- **Gold:** the 63-session state on GLD agrees with the stored state (index or futures bars) at 244 of 261 month-ends (93.5%).
- **Bitcoin:** the current-rule score equals the stored `trendZ["63"]` at 144 of 144 month-ends (largest difference 0.000); the state agrees at 144 of 144.
