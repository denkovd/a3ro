# Australia Watch upgrade — leading indicators plan

Status (17 Nov 2026): **Phase 0 implemented.** Indicator registry, monthly CPI primary, quarterly CPI moved to a comparison section. Phases 1–4 not started.
Read with [australia-watch.md](australia-watch.md) for how the current refresh, freshness and release-date logic works.

## 1. Where the module is today

Australia Watch tracks four ABS series: quarterly trimmed-mean CPI, quarterly headline CPI, monthly unemployment and monthly hours worked (`backend/src/australia/watch.ts`). Each one gets its own chart, a 10-year z-score, direction and a release date.

What's missing:

- **Everything it shows is lagging or coincident.** Inflation and unemployment tell you where the cycle *was*. Nothing points to where it's heading: no rates, credit, housing pipeline, business surveys, commodities or composite leading index.
- **The CPI source is out of date.** On 26 Nov 2025 (October reference month) the ABS made the complete Monthly CPI Australia's primary headline inflation measure. The RBA now targets year-ended headline inflation from the monthly CPI. The ABS will keep publishing the quarterly seasonally adjusted series for *at least* 18 months, roughly to mid-2027, so the `CPI_Q` keys we read could be discontinued. This needs fixing whatever else gets built.
- **The schema is hard-coded to these four series.** `AustraliaIndicator` is a closed union, frequency can only be `monthly | quarterly`, there's one source (ABS SDMX) and the labels/ordering in `view.tsx` are fixed. Adding indicators currently means editing six files.
- **Nothing is synthesised.** Each chart stands on its own, with no answer to "is Australia accelerating or slowing, and is inflation pressure building or fading?"

## 2. Target: a full view in six pillars

Each pillar runs from **leading → coincident → lagging** so you can see which way the chain is moving. The lead times below are the usual textbook ranges, shown in the UI as "typical lead", **not measured**. Phase 4 replaces them with measured cross-correlations.

| Pillar | Leading (what's coming) | Coincident / lagging (confirmation) | Typical lead |
|---|---|---|---|
| **1. Monetary & financial conditions** | Cash rate vs 3y yield (policy expectations), 10y–3y curve, corporate spreads, AUD TWI, housing and business credit growth | Cash rate target, mortgage rates | 6–18 m |
| **2. Housing & construction** | Dwelling approvals (total, houses, units), new housing loan commitments, housing credit growth | Dwelling commencements/completions, construction work done | 6–12 m |
| **3. Labour** | Job vacancies, job ads, hours worked (already tracked), NAB employment index | Unemployment rate (already tracked), underemployment, participation | 3–6 m |
| **4. Business & household demand** | NAB forward orders, capacity utilisation, capex intentions, ABS capex *expectations*, consumer sentiment | Monthly Household Spending Indicator, Business Turnover Indicator | 1–6 m |
| **5. External / terms of trade** | RBA Index of Commodity Prices (SDR & A$), iron ore/LNG components, China activity (reuse the China/oil layer) | Monthly trade balance, terms of trade (national accounts) | 3–12 m |
| **6. Inflation pipeline** | PPI final demand, import price index, NAB purchase-cost and output-price growth, AUD | Monthly CPI headline + trimmed mean (new primary), Wage Price Index, unit labour costs | 3–9 m |
| **Composite** | OECD Composite Leading Indicator, Australia (amplitude adjusted); Westpac-MI Leading Index if licensed | — | 3–9 m |

### Source map

| Source | Access | Covers | Notes |
|---|---|---|---|
| **ABS Data API** (`data.api.abs.gov.au`, SDMX, the client we already use) | Free, no key | Monthly CPI, Labour Force, Job Vacancies, Building Approvals, Lending Indicators, Household Spending Indicator, Business Turnover, Private New Capex, International Trade, PPI, ITPI, WPI | Data appears after the 11:30 release. The separate *Indicator API* needs a key, so stay on the Data API. Lending Indicators now appear on the ABS calendar as **quarterly**; confirm the cadence before building around them. |
| **RBA statistical tables** (CSV at `rba.gov.au/statistics/tables/csv/<table>-data.csv`) | Free, no key | F1.1 money market, F2/F2.1 bond yields, F3 corporate spreads, F11.1 FX/TWI, I2 commodity prices, D1/D2 credit | We already parse F2.1 in `lib/australiaCapital.ts`, so turn that into a general parser. The RBA warns D-series may be delayed while D2A is decommissioned. |
| **OECD SDMX** (`sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI`) | Free | CLI for Australia, plus business/consumer confidence (DF_BTS / DF_CS) | FRED mirror `AUSLOLITOAASTSAM` as a fallback through the existing FRED job. The FRED copy has lagged the OECD, so prefer the OECD directly. |
| **NAB Monthly Business Survey**, **Westpac-MI Consumer Sentiment / Leading Index**, **ANZ-Indeed job ads**, **Cotality home values**, **ASX 30-day IB futures / Rate Tracker** | Public PDFs/pages, but no open API and terms of use apply | Forward orders, capacity utilisation, sentiment, job ads, home prices, market-implied RBA path | **Decision needed (§7).** Default: manually entered through a validated refresh script, like `refresh-australia-capital`, never scraped. |

## 3. Architecture changes

### 3.1 Registry-driven indicators (replaces the closed union)

```ts
// backend/src/australia/registry.ts
export type Pillar = "financial" | "housing" | "labour" | "demand" | "external" | "inflation" | "composite";
export type Role = "leading" | "coincident" | "lagging";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly";
export type SourceKind = "abs_sdmx" | "rba_csv" | "oecd_sdmx" | "manual";
export type Transform = "level" | "yoy" | "mom_ann" | "diff_12" | "spread";

export interface IndicatorDef {
  id: string;                    // stable storage key, e.g. "dwelling_approvals_total"
  title: string; shortLabel: string;
  pillar: Pillar; role: Role;
  typicalLeadMonths?: [number, number];   // shown as "typical, not measured" until Phase 4
  source: SourceKind;
  sourceRef: { dataflow?: string; key?: string; table?: string; seriesId?: string; url: string };
  frequency: Frequency; adjustment: string; unit: string; unitMultiplier: number | null;
  transform: Transform;          // what the z-score / direction is computed on
  growthPolarity: 1 | -1 | 0;    // +1: rising = stronger growth; -1: rising = weaker (unemployment, spreads); 0: n/a
  inflationPolarity: 1 | -1 | 0; // +1: rising = more price pressure
  baselineYears: number;         // 10 by default; shorter for short histories (monthly CPI starts Apr 2024)
  licence: "open" | "manual_entry";
  rollingPeriods: number;
}
```

- `AUSTRALIA_SERIES` becomes the first four entries of the registry, so nothing that already works changes.
- `historicalContext` and `estimateFreshness` read `transform`, `frequency` and `baselineYears` from the def instead of special-casing `hours_worked`.
- `view.tsx` `LABEL` / `ORDER` come from the registry, grouped by pillar.

### 3.2 Sources as adapters

```
backend/src/australia/sources/
  abs.ts     // existing SDMX fetch, moved here unchanged
  rba.ts     // generic RBA CSV parser (generalise parseRbaBondCsv: header row "Series ID", dd-MMM-yyyy dates)
  oecd.ts    // SDMX-JSON for DF_CLI / DF_BTS / DF_CS
  manual.ts  // reads validated JSON written by scripts/refresh-australia-manual.mjs
```

Each adapter has the same signature, `fetch(def, since): Promise<AustraliaObservation[]>`, keeps the 30 s timeout, and records success or failure in `australia_watch_fetch_runs` as it does today. The rule that a failed fetch keeps stored observations and marks the source degraded applies to every adapter.

### 3.3 Storage

New migration (`0xx_australia_watch_registry.sql`):

- `alter table australia_watch_observations add column source text not null default 'abs_sdmx';`
- `reference_period` stays text. Daily and weekly periods use `YYYY-MM-DD`, so the lexicographic sort still works.
- Get history from **monthly** RBA tables (F1.1, F2.1, I2, D1), which keeps row counts small. Only the "latest" tile reads daily F2/F11.
- Pillar and role live in code (the registry) rather than the DB, so they can change without a migration.
- Optional `australia_watch_pulse_snapshots (as_of date, payload jsonb, engine_version int)` so pulse readings are versioned the same way Thesis Lab snapshots were.

### 3.4 Refresh schedule

The current single cron (02:15 UTC, 300 s budget) can't fetch 40+ series one after another. Split it up:

| Route | Schedule (UTC) | Series |
|---|---|---|
| `/api/cron/australia-watch` (existing) | 02:15 daily | ABS series. Only fetch those whose ABS release date is today or whose last verification is >48 h old |
| `/api/cron/australia-watch-rba` | 07:00 daily | RBA F1/F11 daily; F2 on Fridays after the 14:00 AEST release; I2, D1, F1.1 and F2.1 on their release days |
| `/api/cron/australia-watch-global` | 09:00 Mon | OECD CLI/BTS/CS (monthly, revision-heavy) |

Keep a concurrency limit of about 4 per run and per-source health. Return 502 on any partial failure, as today.

### 3.5 Release calendar

Generalise the CPI/Labour Force latest-release page reader into `releaseCalendar.ts`:

- ABS: read the future-releases calendar for each registered catalogue (the code already reads ABS dates rather than guessing weekdays, so keep that).
- RBA: fixed rules from the RBA "Frequency of Statistical Releases" page (e.g. I2 on the first business day at 4:30 pm, D1/D2 on the last business day at 11:30 am).
- Manual sources: next-release date entered with each manual observation (NAB PDFs print it).

## 4. Synthesis layer: "Australia Pulse"

Keep to the repo's rules: it's deterministic, every number can be recomputed by hand, there are no forecasts, and anything modelled is labelled.

1. **Per-indicator signal.** Use `transform` to get the analysis series. Then compute the z-score against its own `baselineYears` history (existing method), the 3-month change in the z-score (momentum), and direction. Multiply by `growthPolarity` / `inflationPolarity` so that "positive" means stronger growth or more price pressure.
2. **Pillar diffusion.** Share of the pillar's indicators whose signed momentum is positive, using leading indicators only for the headline figure. Show it as "4 of 6 leading indicators improving". Avoid a weighted score unless the weights are explicit constants next to where they're used.
3. **Growth × inflation quadrant.** x is the growth diffusion of leading indicators (pillars 1–5), y is the inflation-pipeline diffusion (pillar 6). The quadrants are *Reflation / Overheating / Disinflationary slowdown / Stagflation risk*. This is the same idea as Regime Finder, so reuse its quadrant component.
4. **"What moved" feed.** The five largest absolute z-score changes since the last release, each linked to its chart.
5. **Release-day delta.** For each new print, show the change from the previous print and the revision to the prior period (the revisions table already exists). *Consensus is not available*, so the UI should never call this a "surprise".

## 5. UI changes (`app/Projects/Australia-Watch`)

From top to bottom:

1. **Pulse band:** quadrant, overall leading diffusion, data-coverage note ("38 of 42 series current; 2 manual series older than 45 days").
2. **Next 14 days:** release strip across all sources, showing which pillar each release feeds.
3. **Pillar grid:** six cards. Each has a small-multiple sparkline row ordered leading → lagging, a diffusion count and a lead-time chip ("typical 6–12 m", becoming "measured 7 m" in Phase 4).
4. **Deep dive:** the existing `IndicatorChart` for any series, opened from the grid. It keeps the z-score band, freshness and source health.
5. **Methods drawer:** registry table with source, licence, transform, polarity and baseline for each series.

Keep `AU_ACCENT`, `ModuleSwitcher` and the one-minute visible-refresh hook as they are.

## 6. Phased delivery

| Phase | Scope | Series added | Effort |
|---|---|---|---|
| **0. Foundations + CPI fix** | Registry and adapters refactor (no behaviour change, existing tests pass). Switch primary inflation to the **complete Monthly CPI** headline + trimmed mean. Keep quarterly as "legacy comparison" until the ABS stops it. Use a short-history baseline because monthly CPI only starts in April 2024. | 2 | 2–3 days |
| **1. Financial conditions** | RBA CSV adapter. Cash rate, 3y and 10y, 10y–3y and 3y–cash spreads, corporate spreads (F3), TWI, ICP (I2), housing and business credit growth (D1). Link the existing cost-of-capital tile. | ~10 | 3–4 days |
| **2. ABS activity leaders** | Building approvals (total, houses, units), job vacancies, capex expectations, household spending, business turnover, trade balance, PPI, import prices, WPI, underemployment | ~12 | 4–5 days |
| **3. Composites** | OECD CLI, BTS and CS adapter. (The manual NAB/Westpac/ANZ-Indeed/Cotality/ASX pipeline is deferred to a later upgrade; see §7.) | 3 | 1–2 days |
| **4. Synthesis** | Pulse calculation, quadrant, diffusion, "what moved", release strip, pillar UI. **Measured lead times:** cross-correlation of each leading series against unemployment changes and GDP growth over the baseline, showing the peak lag and r, and hiding it when r < 0.3 or the sample is too short. | — | 4–5 days |
| **5. Optional** | State breakdowns (approvals, unemployment, NAB by state). Market-implied RBA path if ASX data can be licensed. Alerts when a pillar's diffusion crosses 50%. | — | later |

Each phase ships on its own, with fixtures under `tests/fixtures/australia/<source>/` and the existing check commands, plus `backend/tests/australiaSources.test.ts` and `australiaPulse.test.ts`.

**Monthly CPI keys confirmed (17 Nov 2026):** dataflow `ABS,CPI,2.0.0`, dimensions `MEASURE.INDEX.TSEST.REGION.FREQ`. Headline `3.10001.10.50.M` (Sep 2026: 4.3%) and trimmed mean `3.999902.20.50.M` (Sep 2026: 3.6%). The ABS metadata currently flags the dataflow `NonProductionDataflow`, so watch for a version bump. Keys for the Phase 1–3 series still need confirming the same way before each phase.

## 7. Decisions (agreed 17 Nov 2026)

1. **Licensed and survey sources are out of v1.** NAB Monthly Business Survey (forward orders, capacity utilisation, capex intentions, cost/price growth), Westpac-MI Consumer Sentiment and Leading Index, ANZ-Indeed job ads, Cotality home values and the ASX 30-day IB futures / Rate Tracker are **deferred to a future upgrade**. They will probably be entered by hand from public releases through a validated `scripts/refresh-australia-manual.mjs`, labelled "manually entered" with a source link. v1 uses open data only: ABS, RBA and OECD. Phase 3 shrinks to the OECD adapter. Keep the `manual` source kind and `licence: "manual_entry"` in the registry so these can be added later without a refactor.
2. **Quarterly CPI stays, demoted.** The complete Monthly CPI (headline + trimmed mean) becomes the primary inflation reading at the top of the inflation pillar. The quarterly series moves lower on the page as a secondary "quarterly comparison" section, and it stays until the ABS stops publishing it. It counts as lagging and is **excluded from Pulse diffusion** so inflation isn't counted twice.
3. **Pulse is public.** The quadrant, diffusion counts and "what moved" ship on the public page in Phase 4. Every figure links to its inputs in the methods drawer. Lead-time chips read "typical, not measured" until the measured cross-correlations replace them.
4. **Latest values only for daily data.** History for RBA series comes from the monthly tables (F1.1, F2.1, I2, D1, F11.1 monthly averages). Daily F2/F11 fetches overwrite one "latest" row per series (`reference_period = 'latest'`, with the observation date in metadata) and aren't added to history or z-scores.

## 8. Risks

- **Short histories.** Monthly CPI only starts in April 2024, so 10-year z-scores aren't possible. Use `baselineYears` per series and label it "short baseline".
- **Revisions.** OECD CLI and ABS series revise heavily. The revisions table already captures this; the UI should show "revised" markers.
- **RBA D-table delays** during D2A decommissioning. Those indicators show "delayed at source" rather than stale.
- **Cron budget.** Stay within 300 s by splitting crons and fetching only when a release is due.
- **Overstating the pulse.** Diffusion is descriptive. The copy has to say "X of Y leading indicators improving", never "recession probability".
