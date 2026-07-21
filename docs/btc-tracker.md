# BTC Tracker (P·03) — Location & Flow

**Route:** `/Projects/BTC-Tracker`  
**Accent:** `#e0873a` orange  
**Goal:** Visual understanding of *where known BTC is* and *how liquidity flows* — same globe grammar as Oil Tracker, different domain skin.

## Status (Phase 0)

- [x] Orange-themed globe (preview + full core)
- [x] Venue / ETF hotspots (connecting · watchlist — no invented balances)
- [x] Mining region layer (static hashrate-share reference)
- [x] Liquidity corridor arcs (illustrative; intensity pending free feeds)
- [x] Homepage module card + Oil ↔ BTC surface switcher
- [ ] Live BTC-USD price backbone
- [ ] Exchange reserve / netflow adapters
- [ ] ETF holdings / flows
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
