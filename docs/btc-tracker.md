# BTC Tracker (P·03) — Location & Flow

**Route:** `/Projects/BTC-Tracker`  
**Accent:** `#e0873a` orange  
**Goal:** Visual understanding of *where known BTC is* and *how liquidity flows* — same globe grammar as Oil Tracker, different domain skin.

## Status

- [x] Orange-themed globe (preview + full core)
- [x] Venue / ETF hotspots (connecting · watchlist — no invented balances)
- [x] Mining region layer (static hashrate-share reference)
- [x] Liquidity corridor arcs (illustrative; intensity pending free feeds)
- [x] Homepage module card + Oil ↔ BTC surface switcher
- [x] BTC-USD price backbone, with minute refresh and observation timestamps
- [x] Public Coinbase spot price, volume and spread
- [x] Public Bybit BTCUSDT perpetual price, funding, open interest and turnover
- [ ] Exchange reserve / netflow adapters
- [x] US aggregate ETF assets (USD), daily flows, 5/20 reported-session totals and flow history
- [x] What changed overview, searchable venue directory and mobile detail drawer
- [x] Overview / spot / derivatives / ETF / mining modes, zoom and reset
- [x] Clickable illustrative routes with endpoint drilldown
- [ ] Flow stress composite + tape

## Oil → BTC mapping

| Oil | BTC |
|-----|-----|
| Chokepoint gates | Exchange / ETF / derivatives loci |
| Inventories | Exchange reserves, ETF holdings |
| Seaborne corridors | Liquidity corridors between hubs |
| Producers / reserves | Mining hashrate by region |
| Flow Stress | Exchange Flow Stress (planned) |
| SUPPLY-TIGHT tape | ACCUMULATION / EXCHANGE-DRAIN / … (planned) |

## Honesty rules

- Exchange pins are **liquidity loci**, not cold-storage addresses.
- Routes without live netflow are labeled **illustrative**.
- Mining shares are **static annual reference** until a live feed is verified.
- Public price/funding/volume readings are **market activity**, not exchange reserves or transfers. Bybit quote figures are **USDT**, not USD.
- ETF assets are **USD fund assets**, not a Bitcoin count. Totals require enough reported sessions; gaps are not filled with zero.
- Old source observations remain **delayed** even after a successful refresh. Static price baselines are not displayed as observed prices in the intelligence rail.
- Never invent reserve or netflow numbers; use connecting / watchlist / PRO lock.

## File map

| Path | Role |
|------|------|
| `app/components/projects/btcTrackerShared.ts` | Theme, route, re-exports globe geometry |
| `app/components/projects/btc/nodes.ts` | Venues + mining regions |
| `app/components/projects/btc/flowRoutes.ts` | Liquidity corridors |
| `app/components/projects/BtcTracker*.tsx` | Card, preview, core |
| `app/Projects/BTC-Tracker/` | Product page shell |

## Next build order

See session plan Phase 1–4: price/leverage → stock layer → flow + stress → PRO on-chain.

## Public market feeds

`/api/btc/markets` fetches the two venues independently, uses an 8-second upstream timeout and a 30-second Next fetch cache. The client refreshes every minute, preserves last observations on failure, and labels failed or old readings as delayed. No credentials or database migration are required for these feeds.

- Coinbase: [ticker](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker) and [24h stats](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-stats).
- Bybit: [public linear market ticker](https://bybit-exchange.github.io/docs/v5/market/tickers).
- ETF history reads the existing `/api/btc/loci/series` endpoint with a bounded 120-day window. ETF ingestion continues through the existing BTC flow cycle; the UI does not refresh source reports itself.

On local networks with an OS-trusted certificate chain, Node 24 can use `NODE_USE_SYSTEM_CA=1` when starting the dev server. Certificate validation stays enabled. This is a local runtime setting, not a production configuration change.

Validation: `node --test tests/btc-intelligence.test.mjs` and `npx tsc --noEmit --incremental false`.
