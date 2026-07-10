# A3RO Oil Tracker — Roadmap

Status date: 2026-07-05. Everything below is free-tier data unless marked PRO.

## Shipped
- Live WTI/Brent benchmark feed (EIA/FRED/yfinance/AlphaVantage pipeline, cross-source resolution, honest staleness; newest-market-truth ticker rule).
- Corridor metrics foundation (`corridor_metrics`, per-source isolated ingestion, `/api/oil/corridors`).
- US Gulf corridor live (EIA weekly: crude exports, PADD 3 refinery utilization).
- Hormuz + Singapore corridors live (IMF PortWatch satellite AIS: tanker transits + volume, daily history, 7-day averages).
- Truth pass: all modeled/illustrative numbers removed; corridors are live, connecting, or watchlist; globe sub-labels are data-driven.
- PRO lock framework: locked rows on commercial-data signals; lead capture to `leads` table via `/api/leads`; contact fallback a3ro.helpdesk@gmail.com.
- Module 4 — Regime Shift Finder (P·04): Money Line engine (Donchian 20 close-flip, ratcheted) on daily × weekly closes across a 30-asset macro watchlist; newly-bullish detection + recency-first ranking; `regime_snapshots` via the daily cron, `/api/regime/latest`, homepage card + `/Projects/Regime-Finder`. See docs/regime-finder.md.

## Phases

### P2 — Supply-chain flow paths on the globe
Author canonical seaborne crude routes (Gulf→Asia via Hormuz/Malacca, Gulf→Europe via Bab el-Mandeb/Suez, Cape diversion, US Gulf→Europe/Asia, CIS→China, West Africa→both basins) on the existing ranked/animated corridor-line engine. Line weight/pulse from two honest tiers: live weekly intensity from PortWatch tanker volumes (Hormuz, Malacca, Suez, Bab el-Mandeb, Cape, Panama — chokepoint ids already live-verified) and static labeled context from EIA's published chokepoint estimates ("EIA est. · H1'25"). Selecting a corridor highlights its routes.

### P3 — Real charts
`/api/oil/corridors/series` + wire the existing Spark to real corridor history (already accumulating). No new sources.

### P4 — Signals rail (dedicated rail group)
Brent–WTI spread (derived from existing ingestion), WTI term structure / contango–backwardation (yfinance back-month contracts — verify symbols at build), crack spreads (RBOB/HO vs CL, gasoil vs Brent — also lights ARA's crack row). Locked row: intraday signal alerts (PRO).

### P5 — EIA inventories pack + WPSR event chip
Weekly Cushing stocks, US crude/gasoline/distillate stocks, SPR level; "next WPSR release" countdown (Wed 10:30 ET). Verify exact weekly series ids at build (same discipline that caught the seriesid 404).

### P6 — Singapore MPA rows
data.gov.sg monthly bunker sales + tanker arrivals (keyless; verify schema at build).

### P7 — CFTC COT positioning
Managed-money net length WTI/Brent, weekly, with 1-year percentile. Endpoint shape needs a build-time probe.

### P8 — Surface the alerts engine
Rules + delivery code already exist in the backend. Free tier: daily threshold/percent-move alerts. PRO: intraday alerting (locked — Hobby cron is daily).

## PRO tier (lead-gated, commercial data)
China near-real-time imports (satellite AIS), China stockpile estimates, ARA product inventories (weekly terminal data), vessel-level corridor detail, intraday alerts. Locks open a contact panel → `/api/leads` (Supabase `leads` table) → follow-up via a3ro.helpdesk@gmail.com.

## Build discipline
Probe APIs live before speccing; spec exactly; subagents implement with fixture tests; typecheck + full test suite + diff review gate every phase; migrations are additive and applied via the Supabase SQL editor.
