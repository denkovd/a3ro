# A3RO Oil Tracker — Roadmap

Status date: 2026-07-05. Everything below is free-tier data unless marked PRO.

## Shipped
- Live WTI/Brent benchmark feed (EIA/FRED/yfinance/AlphaVantage pipeline, cross-source resolution, honest staleness; newest-market-truth ticker rule).
- Corridor metrics foundation (`corridor_metrics`, per-source isolated ingestion, `/api/oil/corridors`).
- US Gulf corridor live (EIA weekly: crude exports, PADD 3 refinery utilization).
- Hormuz + Singapore corridors live (IMF PortWatch satellite AIS: tanker transits + volume, daily history, 7-day averages).
- Truth pass: all modeled/illustrative numbers removed; corridors are live, connecting, or watchlist; globe sub-labels are data-driven.
- PRO lock framework: locked rows on commercial-data signals; lead capture to `leads` table via `/api/leads`; contact fallback a3ro.helpdesk@gmail.com.
- Module 5 — Bull Market Finder (P·05): whole-market screener (~650 assets, 5 tiers) on the same Money Line engine; back-adjusted CL/GC futures with roll audit; fallback adapter chains (Yahoo/Stooq/Binance/AV) with health log; GitHub Actions daily scan; /api/bull/*; P·05 card + /Projects/Bull-Market-Finder. See docs/bull-market-finder.md.
- Module 4 — Regime Shift Finder (P·04): Money Line engine (Donchian 20 close-flip, ratcheted) on daily × weekly closes across a 30-asset macro watchlist; newly-bullish detection + recency-first ranking; `regime_snapshots` via the daily cron, `/api/regime/latest`, homepage card + `/Projects/Regime-Finder`. See docs/regime-finder.md. **Being repositioned (2026-07-11):** this Money Line 30-asset view is duplicated by P·05's Macro 30 tab, which imports `REGIME_UNIVERSE` verbatim through the same engine — so it is effectively a subset of the Bull Market Finder. P·04 keeps its name and its working card (**Regime Shift Finder**, backed by the live `regime_snapshots` pipeline); the plan is to **evolve** its engine from Money-Line-trend into a Darius-Dale-style macro regime model — see "P·04 evolution" under Phases — which also removes the overlap with P·05's Macro 30 tab. P·04 (Regime Shift Finder) and P·05 (Bull Market Finder) stay two clearly-named, separate modules.
- Scores Phase 1 (docs/scores-plan.md): Brent–WTI spread primitive + **Flow Stress composite** — throughput deviation (worst-gate shortfall vs PortWatch 1y bands) + export strength (percentile vs accumulated history) + regional stock draw (new EIA weekly stocks: US crude `WCESTUS1`, Cushing `W_EPC0_SAX_YCUOK_MBBL`, live-verified on `petroleum/stoc/wstk`) + spread leg. Stocks ride `corridor_metrics` under `usgulf` (no new table — the dedicated inventories table waits for the full P5 pack). `score_snapshots` → `/api/oil/scores` → US Gulf panel gauge + raw stock rows, rail shows "Stress NN".
- P5 + Scores Phase 2: full WPSR pack in `eiaInventory.ts` (gasoline `WGTSTUS1`, distillate `WDISTUS1`, SPR `WCSSTUS1`, US-total utilization `WPULEUS3` — all live-verified) + week-of-year 5-yr seasonal bands (`seasonal_baselines` via `008_seasonal.sql`, monthly-guarded `runSeasonalCycle`, one 5y EIA fetch per series) + **Tightness composite** (inventories vs seasonal band + utilization on a documented 85→100% scale + crack leg visibly pending) + US Gulf panel Tightness gauge, SPR row (bar = fill of 727 Mbbl design capacity), next-WPSR countdown chip (Wed 10:30 ET).

## Phases

### P·04 evolution — Regime Shift Finder → Darius-Dale-style macro regime
P·04 stays the **Regime Shift Finder** and stays live (it works today). Its original intent was a **top-down macro regime** model, not a price-trend screener; the current Money Line 30-asset engine is the same one P·05's Macro 30 tab reuses (`REGIME_UNIVERSE` verbatim), which is the overlap this evolution removes. Evolve P·04's engine into a **GRID-style growth × inflation regime**: two axes measured on a rate-of-change basis (accelerating / decelerating) → four quadrants — **Goldilocks** (growth↑ / inflation↓), **Reflation** (growth↑ / inflation↑), **Inflation/Stagflation** (growth↓ / inflation↑), **Deflation** (growth↓ / inflation↓) — with the current quadrant, its trajectory, and what it historically favors. This is fundamentally distinct from P·05 (bottom-up price-trend flips): P·04 answers *where are we in the growth/inflation cycle*, P·05 answers *what is trending right now*. No universe overlap once rebuilt.

Data is free-tier **FRED** (probe every series id live before speccing, per build discipline): growth proxy `INDPRO` (industrial production, + payrolls/ISM if surfaced on FRED), inflation `CPIAUCSL`/PCE or market-based `T10YIE` / 5y5y breakevens for a forward read, context `T10Y2Y` (curve), `BAMLH0A0HYM2` (HY OAS), broad dollar `DTWEXBGS`. Method: YoY + momentum (2nd-derivative) per axis → quadrant classification + transition history, mirroring the Regime/Bull precedent (pure engine → snapshot table → read-only route → hook → card).

**Convergence — build the macro layer once.** This is the same FRED macro layer as scores-plan.md's **Macro Override → Macro pressure** half (sequencing #5). Build a single `fredMacro.ts` sibling adapter + engine and surface it in both P·04 (the regime card) and Macro Override (the score chip) — do NOT build two macro layers. This is the reason to re-plan now rather than duplicate later.

### P2 — Supply-chain flow paths on the globe
Author canonical seaborne crude routes (Gulf→Asia via Hormuz/Malacca, Gulf→Europe via Bab el-Mandeb/Suez, Cape diversion, US Gulf→Europe/Asia, CIS→China, West Africa→both basins) on the existing ranked/animated corridor-line engine. Line weight/pulse from two honest tiers: live weekly intensity from PortWatch tanker volumes (Hormuz, Malacca, Suez, Bab el-Mandeb, Cape, Panama — chokepoint ids already live-verified) and static labeled context from EIA's published chokepoint estimates ("EIA est. · H1'25"). Selecting a corridor highlights its routes.

### P3 — Real charts
`/api/oil/corridors/series` + wire the existing Spark to real corridor history (already accumulating). No new sources.

### P4 — Signals rail (dedicated rail group)
Brent–WTI spread (derived from existing ingestion), WTI term structure / contango–backwardation (yfinance back-month contracts — verify symbols at build), crack spreads (RBOB/HO vs CL, gasoil vs Brent — also lights ARA's crack row). Locked row: intraday signal alerts (PRO).

### P5 — EIA inventories pack + WPSR event chip — SHIPPED 2026-07-11
Weekly Cushing stocks, US crude/gasoline/distillate stocks, SPR level, US-total utilization; "next WPSR release" countdown (Wed 10:30 ET). All series ids live-verified at build. Remaining P5-adjacent idea (WPSR *surprise* chip — actual vs expected) lives in scores-plan's additional-metrics list.

### P6 — Singapore MPA rows — SHIPPED 2026-07-11
data.gov.sg monthly bunker sales + tanker arrivals, keyless (`mpaSingapore.ts`). Both dataset ids live-verified: Bunker Sales Total `d_89d2874dad74a273270369334f1e7d28` (kt → Mt), Tanker Arrivals Total `d_9adb5ace517591edd9a8c88291ac1f1c` (count + k GT → M GT). Latest month is an MPA preliminary estimate (flagged in record meta); Singapore panel carries both monthly rows under the AIS gate rows.

### P7 — CFTC COT positioning
Managed-money net length WTI/Brent, weekly, with 1-year percentile. Endpoint shape needs a build-time probe.

### P8 — Surface the alerts engine
Rules + delivery code already exist in the backend. Free tier: daily threshold/percent-move alerts. PRO: intraday alerting (locked — Hobby cron is daily).

## PRO tier (lead-gated, commercial data)
China near-real-time imports (satellite AIS), China stockpile estimates, ARA product inventories (weekly terminal data), vessel-level corridor detail, intraday alerts. Locks open a contact panel → `/api/leads` (Supabase `leads` table) → follow-up via a3ro.helpdesk@gmail.com.

## Build discipline
Probe APIs live before speccing; spec exactly; subagents implement with fixture tests; typecheck + full test suite + diff review gate every phase; migrations are additive and applied via the Supabase SQL editor.
