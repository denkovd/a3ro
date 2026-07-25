# Regime Shift Finder (P·06) — macro refresh

**Branch:** `agent/regime-macro-refresh`
**Sources:** Darius Dale, *42 Macro* — Macro Minute, Fri 24 Jul 2026 (the current
read) · *Darius Dale's Macro Regime Model and Six Key Cycles* (the framework)

The page was built as the top-down half of the **oil** tracker. Its quadrant is
generic, but everything underneath it is oil-scaled: the pressure engine is
literally a "headwind-for-oil" composite, positioning is WTI managed money, the
divergence flag means *oil rising while macro weakens*, and it reads
`/api/oil/macro`.

Reading the framework doc against the code also surfaced three **modelling
errors** that matter more than the oil coupling:

1. **The six cycles are wrong.** The page shows growth, inflation, *monetary*,
   *fiscal*, liquidity, positioning. Dale's six are growth, inflation, **policy**
   (monetary and fiscal as one cycle), **corporate profits**, liquidity,
   positioning. Monetary and fiscal were split into two, and **corporate profits
   — an entire cycle — is missing**.
2. **The whole top-down layer is absent.** Dale's model has two layers: a
   bottom-up economic GRID *and* a top-down **Global Macro Risk Matrix** that
   scores ~42 liquid markets daily with a **volatility-adjusted momentum signal
   (VAMS)** and aggregates them into the regime the *market* is pricing. The page
   only has the bottom-up half. This is why the 24 Jul transcript's phrase — "the
   MOVE index recently broke out to bullish *from the perspective of our
   volatility-adjusted momentum signal*" — has nowhere to live on the page today.
3. **Positioning is an oil read.** WTI managed-money COT is not a macro
   positioning cycle. Dale builds positioning from sentiment and crowding —
   notably **260-day realized volatility at new cyclical lows**, which signals
   vol-targeting funds levering up.

This refresh fixes all three, adds the 24 Jul cost-of-capital read, and demotes
oil to one clearly-labelled overlay.

---

## 0 · The model being implemented

Three layers, in Dale's order:

| Layer | What it answers | Status before / after |
|---|---|---|
| **1 · Bottom-up GRID** | What regime is the *economy* in? Growth × inflation on a rate-of-change basis → 4 quadrants | present / kept, plus horizontal-vs-vertical shift marking |
| **2 · Global Macro Risk Matrix** | What regime is the *market pricing*? VAMS per market → regime confirmation shares → modal market regime | **absent / built** |
| **3 · Six cycles** | Is the current regime *sustainable*? | wrong six / corrected |

Two framework details that drive UI decisions:

- **Horizontal crossings are the consequential ones.** Moving across the
  risk-on/risk-off boundary (Goldilocks/Reflation ↔ Inflation/Deflation) forces
  wholesale allocation pivots; vertical moves within a risk stance are
  incremental. The page should not render all four transitions as equal.
- **The two layers can disagree, and the disagreement is the signal.** Economy in
  Reflation while the market is confirming Deflation is a warning, not an error
  to be averaged away. They are stored and displayed separately.

---

## 1 · The signal

**Headline question:** *Is the global cost of capital too low?* **Answer: yes**,
per leading indicators of global liquidity. Risk of a **summer-1998-style
correction** — a risk-premium repricing that punishes overextended institutional
investors — continues to rise. (S&P 500 peaked 2 Jun.)

The argument, in order:

1. **Global IG government bond yield surged to 3.68%** — highest since the 2008
   GFC; the benchmark is tracking its steepest monthly loss since March. Further
   bond selling deepens debt-sustainability fears, raises corporate borrowing
   costs, and can trigger rotational flows out of equities.
2. **Structurally elevated nominal GDP** is the driver. Global nominal GDP was
   **6.7% YoY in Q1** vs a 2003–07 trend of **6.0%** and a 2015–19 trend of
   **4.9%**. Consensus (Bloomberg) has 6.2% / 6.0% / 6.0% / 5.8% for the next
   four quarters — the above-trend dynamic persists.
3. **Structurally depressed global savings growth.** Trailing 10-year growth in
   global savings is among the lowest on record and well below its long-run mean,
   and is unlikely to improve durably given the multipolar shift and the defence
   and infrastructure spending it entails.
4. **Telltales that savings supply is deteriorating:** 15-year high in the 10y
   Eurozone yield, 20-year high in the 10y UK gilt, 30-year high in the 10y
   nominal JGB.
5. **Cost of capital is below its long-run mean in most major markets**, where
   cost of capital = benchmark equity earnings yield + nominal 10y sovereign
   yield:

   | Market | Current | Long-run mean | Read |
   |---|---|---|---|
   | US | 4.13% | 4.46% | below |
   | China | 4.49% | 5.47% | below |
   | Eurozone | 4.31% | 4.35% | below (marginal) |
   | Switzerland | 2.55% | 3.39% | below |
   | Japan | 3.83% | 2.71% | above |
   | UK | 5.69% | 5.03% | above |

   With balance-sheet capacity shrinking, investors start demanding higher
   *ex-ante* returns — which is what a risk-premium correction is.
6. **Capital competition between the AI capex bubble and structurally wide
   fiscal deficits** is now an acute risk.
7. **The ICE BofA MOVE index hit a 2-month high and broke out to bullish** on
   42 Macro's volatility-adjusted momentum signal. Rates, bond vol and currency
   vol are all **countercyclical leading indicators of global liquidity** — a
   further breakout spells trouble for stocks and supports the 1998 thesis.

**One line:** *global liquidity is deteriorating; the price of capital is too low
for a world of structurally high nominal GDP and structurally scarce savings;
bond vol breaking out is the tell.*

---

## 2 · What the page is missing

**Framework gaps** (from the six-cycles doc)

| Dale's construct | On the page today |
|---|---|
| VAMS + Global Macro Risk Matrix | Absent — no top-down layer at all |
| Modal *market* regime vs economic regime | Absent — one quadrant, presented as the whole answer |
| Six cycles = …, **policy**, **corporate profits**, … | Wrong: policy split in two, profits missing entirely |
| Positioning as sentiment/crowding | WTI managed-money COT — an oil read on a macro page |
| Horizontal vs vertical regime shifts | Not distinguished |

**Current-read gaps** (from the 24 Jul Macro Minute)

| Dale's leg | On the page today |
|---|---|
| Liquidity as the lead cycle | Editorial tile, hard-coded per quadrant — no feed |
| Cost of capital vs long-run mean | Absent |
| Bond vol / FX vol / equity vol | Absent |
| Nominal GDP vs trend | Absent (growth axis is real IP) |
| Global bond stress | Absent (US-only panel) |
| Risk-premium / correction gauge | Absent — headline score is "pressure on oil" |
| AI capex vs fiscal deficits | Present (`AI_CAPEX_STRESS`, editorial) ✔ |

The quadrant itself (IP × CPI rate-of-change) is sound and stays. The problem is
everything around it.

---

## 3 · Data verdicts

Probed 2026-07-25 before wiring, per the `fredMacro.ts` fail-loud convention.

**Adopted — live**

| Leg | Source | Note |
|---|---|---|
| Fed net liquidity | FRED `WALCL` − `WTREGEN` − `RRPONTSYD` | weekly H.4.1; makes Liquidity a live cycle |
| Nominal GDP vs own trend | FRED `GDP` | 9,200-day lookback so 2003–07 and 2015–19 trend means are computed from the same series, not asserted |
| Bond volatility | realized vol of daily `DGS10` changes (bp, 20d), percentiled vs 1y | MOVE stand-in from a series already ingested — no new failure mode |
| Currency volatility | realized vol of daily `DTWEXBGS` returns, same treatment | ditto |
| Equity volatility | FRED `VIXCLS` | completes the vol triangle |
| Global bond stress | `BWX` / `IGOV` 1m return + drawdown via the existing Yahoo daily-history fetcher | live read on "steepest monthly loss since March" |
| Rates, curve, credit | `DGS10`, `T10Y2Y`, `BAMLH0A0HYM2` | already ingested |
| **Policy — monetary** | FRED `DFF` (daily), real policy rate = `DFF` − CPI YoY | one half of the policy cycle |
| **Policy — fiscal** | FRED `MTSDS133FMS` (monthly Treasury statement) — 12m rolling deficit vs prior 12m | Jun 2026 data, released 13 Jul; next 12 Aug |
| **Corporate profits** | FRED `CP` (quarterly, back to 1947) | Q1 2026, released 28 May; the missing sixth cycle |
| **Positioning** | 260-day realized vol on `^GSPC` and `HYG`, percentiled — new cyclical lows ⇒ vol-targeting leverage building | Dale's own construction; computed from bars already stored |
| **VAMS** | vol-adjusted momentum per market, off `market_bars` | no new fetch — the daily bull scan already stores these bars |

**Rejected**

- `IRLTLT01EZM156N` / `GBM` / `JPM` (OECD 10y yields) — **stale**. Japan's series
  last updated 15 Apr 2026 with March data and shows no next release date. A
  4-month-lagged monthly series cannot back a leading-indicator claim.
- `THREEFYTP10` (Kim–Wright term premium) — ~2-month lag, no scheduled release.
  Usable as slow structural context, not as a daily signal. Not wired.
- `^MOVE` via Yahoo — could not be verified from this environment. The realized-vol
  proxy above is used instead; it is derived from data already fetched.

**Editorial (dated, marked as such in the UI)**

- Cost of capital per market — needs benchmark index earnings yield, which has no
  free feed. Dale's table above is encoded as a dated brief in `macroBrief.ts`,
  rendered next to the *live* sovereign-yield leg so the split is visible.
- Global savings growth — no free series.
- AI capex vs fiscal deficits — already an editorial flag.
- AAII bulls–bears and NAAIM — no free machine-readable feed. The realized-vol
  leg carries the positioning cycle on its own; the survey legs are named in the
  UI as not-wired rather than silently dropped.

### 3.1 · VAMS specification

Dale's VAMS uses price, volume and volatility. Volume is dropped — Yahoo volume
is unreliable-to-absent for FX and continuous futures, and a leg that is missing
for a third of the universe would bias the matrix toward the assets that happen
to report it. Stated here rather than buried.

For each market, on daily closes:

```
z = r_n / (σ_daily × √n)          n = 63 sessions (~3 months)
σ_daily = population σ of daily log returns over n
BULLISH  z ≥ +0.5
BEARISH  z ≤ −0.5
NEUTRAL  otherwise
```

`z` is the drift expressed in units of its own noise — a t-statistic of the
trend, which is what "volatility-adjusted momentum" means. The ±0.5 neutral band
exists so a market drifting sideways contributes to nothing rather than
flickering between confirmations. Horizon is 63 sessions because Dale's own
regime horizon is 3–6 months and markets price a regime 1–3 months ahead.

Each market's state maps to the regimes it confirms via a documented affinity
table (`REGIME_AFFINITY`), one point per market split evenly across the regimes
it confirms. Shares are point mass per regime ÷ total points; the modal regime is
the largest share. Assets with no clean regime read in a given state contribute
nothing rather than being forced into a bucket.

---

## 4 · Implementation

Oil is **generalised, not deleted**: `computeMacroPressure`, the WTI COT read and
`/api/oil/macro` are left byte-identical so the Oil Tracker's Macro Override chip
does not regress. The new work is additive and asset-neutral.

**Backend**

1. `sources/fredMacro.ts` — add `VIXCLS`, `WALCL`, `WTREGEN`, `RRPONTSYD`, `GDP`;
   per-series `lookbackDays` override so `GDP` reaches back to 2002.
2. `macro/globalBonds.ts` *(new)* — international govt bond ETF returns via the
   regime scanner's Yahoo fetcher, isolated so a Yahoo outage degrades one leg.
3. `macro/engine.ts` — add `realizedVol`, `percentileRank`, `netLiquiditySeries`,
   `computeLiquidityStress`, `computeNominalGrowth`. De-oil `QUADRANT_COPY`.
4. `migrations/019_macro_liquidity.sql` — additive columns on `macro_snapshots`.
5. `storage/macroRepo.ts`, `ingest/macroCycle.ts` — persist and wire.

**Frontend**

6. `app/api/macro/latest/route.ts` *(new)* — asset-neutral read.
7. `macro/macroData.ts` — extend the snapshot; read the new route.
8. `macro/macroBrief.ts` — Dale's dated read: cost-of-capital table, liquidity now
   live, `1998-style risk` flag, horizon tags rewritten.
9. `macro/LiquidityPanel.tsx`, `macro/CostOfCapitalPanel.tsx` *(new)*.
10. `Projects/Regime-Shift/view.tsx` — GRID + liquidity stress lead; cost of
    capital and the vol triangle follow; oil pressure demoted to a labelled
    overlay at the foot.

**Verification** — fixture tests for every new engine function, backend
typecheck, backend test run, `next build`, and a confirmation that the Oil
Tracker chip's payload is unchanged.

---

## 4.1 · Known limits

Things a reader of the page should not assume it does.

- **`REGIME_AFFINITY` ships hand-written, but is now derivable.**
  `npm run backtest:affinity` labels ~25 years of months with the live GRID
  engine, cross-tabulates each asset's VAMS state against those labels, and
  writes `regimeAffinity.generated.ts`, which `affinityFor()` prefers over the
  reasoned table. The statistic is **lift** — P(regime | state) ÷ P(regime) —
  because the matrix asks a conditional question ("what is this state evidence
  for"), not a returns question ("where does this asset make money"). Assets
  below the sample floor keep their hand-written entry, so crypto majors stay
  reasoned until they have lived through more regimes. Until the backtest is
  run, the generated table is empty and everything falls through to the
  hand-written baseline. See §4.2.
- **VAMS thresholds are chosen, not fitted.** 63 sessions and ±0.5σ are defensible
  (his regime horizon is 3–6 months; markets price a regime 1–3 months ahead) but
  they are not optimised, deliberately — fitting them to recent data is how a
  signal stops generalising.
- **VAMS reads one session behind.** The ingest cron runs 06:00 UTC; the bull scan
  that writes `market_bars` runs 06:20. Correct for a close-based signal, but the
  matrix is not intraday-fresh, and it reads PENDING on a new database until the
  first bull scan lands.
- **No conditional regime probabilities.** Dale runs stochastic rolling 12-month
  forecasts for growth and inflation and reports probabilities over a 3–6 month
  horizon. This implements the *nowcast* half — where the economy is and what the
  market is pricing — not the forecast half. The horizon ribbon remains editorial.

## 4.2 · The affinity backtest

`npm run backtest:affinity` (add `--dry` to print without writing, `--db` to use
stored bars instead of fetching).

1. **Label history.** Walk INDPRO and CPI forward, running the *same*
   `computeMacroRegime` the live page uses against history truncated to each
   date. Using the live function means a label can never drift from what the
   page would have shown.
2. **Score each asset at each label.** VAMS from bars up to that date only — no
   look-ahead in the signal.
3. **Cross-tabulate and compute lift.** Confirm the regimes clearing
   `MIN_LIFT` (1.15) with `MIN_CELL` (6) months, capped at `MAX_CONFIRMS` (2).

Design decisions worth knowing:

- **Base rate is per-asset, over the months that asset was actually scored in**,
  not over the whole timeline. Otherwise an asset that only exists post-2020 gets
  measured against a base rate including 2008, and every crypto major shows a
  spurious affinity for whatever regime dominated its short life.
- **Yahoo `range=max` by default, not `market_bars`.** The stored bars are 5
  years — roughly one and a half regime cycles, enough to fit a table and not
  enough to trust one.
- **The generated file carries its own evidence.** Every entry is preceded by the
  lift and month count behind it, so a regeneration is reviewable in the diff
  rather than being an opaque blob.

**Known bias:** history is labelled with *revised* INDPRO/CPI, not the vintages
known at the time. That is the standard convention for regime backtests — the
regime is treated as ground truth rather than as a forecast — and it does not
advantage one asset over another, which is what matters for a relative measure
like lift. It would matter if these were tradeable backtest returns; they are not.

## 4.3 · The three-sleeve allocation (KISS)

`npm run backtest:allocation` (`--db` for stored bars, `--from 2014` for a single
window, `--json out.json` to dump the curves).

Dale's KISS portfolio is stocks + gold + Bitcoin, top-down exposure from the risk
matrix, bottom-up from VAMS. Implemented with hard caps — **stocks 60%, gold 30%,
Bitcoin 10%**, cash the remainder:

```
weight = cap × regimeScore × vamsMultiplier × cycleDrag
```

**Why this matters more than it looks:** it gives the regime read a scoreboard.
"Is Reflation the right label" is not falsifiable; "did this allocation beat
buy-and-hold on a drawdown-adjusted basis" is. Nothing else on the page is
scoreable.

**The matrix stays 30 assets.** Narrowing the *signal* to three would gut it —
the regime information lives in copper, the curve, credit and FX, while
stocks/gold/BTC are largely the regime's output. Three assets is the right size
for the expression, not for the signal.

Decisions worth knowing:

- **The regime used is the MARKET's modal regime**, falling back to the economic
  quadrant. The framework's position is that you invest on what the market is
  telling you, not on your own read.
- **Cycle drag applies to stocks and Bitcoin only — gold is exempt.** The six
  cycles are scored as tailwind/headwind *for risk assets*, so applying that drag
  to the hedge would cut the hedge precisely when the cycles say you need it.
  That is the single most obvious way to get this rule wrong; there's a test
  named for it.
- **No regime ⇒ 100% cash**, not a default 60/30/10. Otherwise a data outage
  silently becomes a full risk position.
- **Two windows, reported separately.** 2000+ for stocks+gold (many regime
  cycles, tests whether the logic works at all); 2014+ for all three (tests what
  Bitcoin adds). Bitcoin's history is the binding constraint at ~12 years. A
  single spliced curve that quietly changes its investable universe partway
  through is the kind of backtest that looks great and means nothing.
- **Costs are charged on turnover** (10bp default). Ignoring them would flatter a
  rule that rebalances on every regime change — which is the rule under test.
- **`returnToVol`, not Sharpe.** Risk-free is taken as zero and not subtracted;
  over a window containing 5% cash rates that flatters every series equally, so
  it compares fairly across strategy and benchmarks but is not a Sharpe ratio.
  Named for what it is.

`SLEEVE_REGIME_SCORE` is reasoned, not backtested — the same status
`REGIME_AFFINITY` had before §4.2, and the same candidate for the same treatment.

## 5 · Deliberate omissions

- **No global aggregate is invented.** Dale quotes *global* nominal GDP and a
  *global* IG yield; we have neither for free. The page computes US nominal GDP
  against its own trends and uses an international bond ETF for the global leg,
  and says so.
- **Fixed, documented scales — not fitted percentiles** for the level legs, in
  line with the existing pressure engine. Vol legs are percentiled because a
  fixed bp scale for rate vol ages badly across rate regimes.
- **The quadrant stays IP × CPI.** Swapping the growth axis to nominal GDP would
  make the quadrant quarterly and 2 months stale. Nominal GDP is added as its own
  read instead.
