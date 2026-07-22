# Gold Tracker (P·02) — Mines, Holders & Flows

**Route:** `/Projects/Gold-Tracker`  
**Accent:** `#dcc689` gold  
**Goal:** Visual understanding of *where gold is mined*, *who holds known stock*, and *how metal/paper flows* — same globe grammar as Oil and BTC.

## Status (Phase 0 + free stock/flow)

- [x] Gold-themed globe (preview + full core)
- [x] Holder / vault / ETF / COMEX pins (connecting · watchlist · reference)
- [x] Mine production layer (static annual reference)
- [x] Metal/paper flow arcs (illustrative; intensity pending free feeds)
- [x] Homepage card expand → full terminal
- [x] Oil / Gold / BTC surface switcher
- [x] Price rail via `/api/gold/latest` (falls back to mock baseline)
- [x] **COMEX warehouse** free adapter (`Gold_Stocks.xls` → registered / eligible / combined troy oz)
- [x] **ETF holdings** free adapter (WGC GoldHub weekly NA + global tonnes + WoW flow Δ)
- [x] `/api/gold/loci` + series; UI rail + holder panels
- [ ] Allocation stress tape / baselines

## Oil → BTC → Gold mapping

| Oil | BTC | Gold |
|-----|-----|------|
| Producers | Mining hashrate | Mines (tonnes / share) |
| Inventories / gates | Exchange reserves, ETFs | CB holdings, ETFs, COMEX, vault hubs |
| Seaborne corridors | Liquidity corridors | Mine → refine → vault/ETF spines |
| Flow Stress | Exchange Flow Stress | Allocation stress (planned) |

## Honesty rules

- Pins are **economic loci**, not vault GPS.
- Routes without live intensity are **illustrative**.
- Mine shares are **static annual reference**.
- Never invent holdings, warehouse stocks, or CB weekly buys.

## File map

| Path | Role |
|------|------|
| `goldTrackerShared.ts` | Theme, route, geometry re-export |
| `gold/mines.ts` | Mine regions |
| `gold/holders.ts` | Holders / vaults |
| `gold/flowRoutes.ts` | Flow arcs |
| `GoldTracker*.tsx` | Card, preview, core |
| `app/Projects/Gold-Tracker/` | Product page |

## Free feeds (probed)

| Feed | Source | Metrics | Cadence |
|------|--------|---------|---------|
| COMEX stocks | `cmegroup.com/delivery_reports/Gold_Stocks.xls` | `comex_registered_toz`, `comex_eligible_toz`, `comex_combined_toz`, Δ | Daily report |
| Gold ETFs | `fsapi.gold.org` holdings-chart2 | `etf_holdings_t` (etf_us = NA, etf_global = sum), `etf_flow_t` (WoW Δ) | Weekly |

**Apply:** `backend` migration `018_gold_flow.sql`, then `npm run run:gold-flow` (or daily cron).

## Next

Baselines, arc intensity from flow Δ, allocation tape.
