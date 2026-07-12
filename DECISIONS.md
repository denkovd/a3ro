# DECISIONS — Thesis Lab (P·07) autonomous session

Major assumptions and tradeoffs from this session, shortest-first. Read REVIEW.md first for what changed; read this for **why**.

## 1. Deterministic rule-based engine, not an LLM

The pressure test (`backend/src/thesis/engine.ts` + `lexicon.ts`) is a lexicon/rule engine, not a model call. Chosen deliberately: no API key exists in this stack, results must be reproducible and offline-testable, and the product's own truth rule ("no modeled number shown as live") extends naturally to "no invented reasoning". Every score is a sum of listed contributions (`reasons[]`, `strengthComponents[]`) — you can recompute any output by hand.

**Tradeoff:** novel phrasings slip through unscored (a sentence with no lexicon hits defaults to a `direction` claim at neutral language scores). The lexicon is the tuning surface — extend `KIND_KEYWORDS` / markers as your own thesis vocabulary reveals gaps.

## 2. One module, three stages — not three modules

Phases 1–3 ship as one route (`/Projects/Thesis-Lab`) with a stage ribbon (Pressure Test → Scenarios → Portfolio Risk) sharing state: scenarios are generated **from** the analyzed thesis; the risk audit pins the saved thesis id so book-level scenario P&L traces to the exact thesis under test. Three separate modules would have broken the "one coherent workflow" requirement and tripled shell code.

## 3. Positions are manually entered — there was no positions store

"Real trading positions" did not exist anywhere in the repo (the only "positioning" is CFTC COT market data). Rather than fabricate a feed, migration `012_thesis.sql` adds `portfolio_positions` and the Risk stage includes entry/edit UI. Marks are resolved **live** at read time in priority order — `latest_quotes` (WTI/BRENT) → `bull_snapshots.last_close` (~650-symbol daily scan) → `manual_mark` → `entry_price` — each labeled, the last one always flagged `STALE_MARK`. Quantity is in raw units (bbl/shares/coins); exposure = qty × mark. **No futures contract multipliers** — if you enter CL contracts, enter barrel-equivalent quantity (noted in the UI copy).

## 4. Scenario math: realized σ legs + empirical frequencies, no drift

Scenario prices sit at fixed σ-multiples (±1.25σ, ±2.5σ) of the instrument's own realized daily log-return σ (120 sessions), √t-scaled to the thesis horizon. Base = flat (no drift assumed — a documented choice, not a forecast). "Probabilities" are **empirical frequencies** of trailing horizon-length windows landing in each bucket, suppressed below 30 windows. Nothing is a prediction; every basis string says so in the UI.

## 5. Risk model: ATR%-weighted contributions + pairwise ρ + β to the thesis driver

Risk share = weight × daily vol (ATR% from bull scan, else realized σ from stored bars, else **unmodeled** — labeled and excluded, never a hidden zero). Correlation = Pearson on ≥20 shared sessions of daily log returns from `market_bars`; clusters = ρ≥0.7 connected components. Scenario P&L per position = exposure × side × β(position→scenario instrument) × scenario move. Simple by design: transparent v1 beats an opaque VaR. HHI thresholds (0.35/0.18), crowding cut (40% cluster weight), flag thresholds (fake confidence 70/35, oversized-weak 15%/45) are all named constants near their use sites.

## 6. Live context per instrument, honest nulls

`assembleMarketContext` pulls price/σ (daily_prices or market_bars), tape, macro, COT and Money Line trend per instrument; WTI/BRENT map to CL=F/BZ=F for the trend read. Oil-specific checks (tape, WTI COT) only apply to oil-adjacent instruments — other symbols read `no_data` on those axes rather than borrowing oil signals. Every missing feed degrades that one check; the analyze route even survives a dead DB (empty context + a visible `contextError` note).

## 7. Existing-code footprint kept deliberately small

Phase 0 changed: `Work.tsx` (traverse math was already broken for the 6th card — see REVIEW), `api/oil/corridors/series` (real type error + input validation), `storage/db.ts` (pool memoization — one pool per connection string on `globalThis` instead of a new Pool per request), `backend/src/index.ts` + `backend/package.json` (additive exports/scripts). Nothing else touched: OilTrackerCore, Bull/Regime views and the landing sections were left alone on purpose (avoid churn where nothing was broken).

## 8. Engine snapshots are versioned

Saved theses store the full analysis + scenarios jsonb stamped `engine_version = 1`. Rescoring after future engine changes = POST the stored body back through `/api/thesis/analyze`; old rows stay interpretable.

## Things I'd flag as future work (not done, on purpose)

Futures multipliers and per-position FX; percentile-based (instead of fixed-scale) fragility calibration once thesis history accumulates; a Money Line trend read for symbols outside the two scan universes; broker import for positions; correlation matrix UI beyond top pairs/clusters.
