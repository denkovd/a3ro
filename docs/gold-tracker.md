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
- [x] Mines visible on arrival; Overview / Supply / Holdings / Flows presets
- [x] Production / Share controls update marker size, labels, hover cards and details
- [x] Searchable holder / mine directory and ranked mine references
- [x] Location panels with reporting dates, sources, market context and related routes
- [x] Clickable illustrative routes with connected-location navigation
- [x] ETF / COMEX history charts: 1M / 3M / 1Y, metric switching and accessible tables
- [x] Loading, unavailable, outdated and retry states; retained readings after refresh failure
- [x] Collapsible mobile rail; reduced-motion globe redraws on resize and interaction
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

## UI data behaviour

- Reports are labelled **Latest report** only within a cadence allowance: 7 days for daily COMEX stocks and 14 days for weekly ETFs. Older reports or a failed refresh show **Outdated**. Age uses `periodDate`, not ingestion time.
- Refresh / retry rereads stored reports; it does not run source ingestion. A successful report reload also reloads the selected history chart.
- History uses the existing read-only `/api/gold/loci/series` endpoint. Empty windows and a single report receive explicit messages instead of a fabricated trend. Weekly ETF changes use signed bars; holdings and stocks use lines.
- Official reserves and unconnected bullion hubs show market context and published-source links where available. They do not imply numeric holdings are connected.
- Mine figures remain approximate 2024 annual references. Production mode uses tonnes/year; Share mode uses estimated global share.

**Checks:** `npm run test:gold` covers freshness, missing/invalid values, series isolation and deduplication, and UTC calendar-range boundaries. Browser checks cover real report responses, chart success/error/empty/one-point states, view controls, route navigation and mobile collapse.

## Next

Baselines, arc intensity from flow Δ, allocation tape.
