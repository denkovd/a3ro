# Module 5 — Bull Market Finder (P·05) — Build Plan

Plan date: 2026-07-10. Status: **approved for build, not yet built.**
Whole-market bullish-state screener ranking ~700 assets by newly bullish
regime, daily × weekly confirmed. Free data only. Shares the verified Money
Line engine with P·04 (Regime Shift Finder), which stays as the curated
30-asset macro view. P·05 is the scale version.

## What P·05 adds over P·04

- Universe: ~700 symbols in tiers vs 30 curated.
- Verdict display names per module spec: **Double Confirmed** (bull daily +
  weekly) · **Conflicted Early Bullish** (daily only) · **Conflicted Lagging
  Bullish** (weekly only) · Bearish · Warm-up. Display-layer rename only —
  the engine enums (`BULLISH`/`CONFLICT_DAILY`/…) are untouched so P·04 is
  unaffected.
- Strength v2: volatility-normalized (move since flip ÷ ATR%) + cushion, so
  crypto doesn't structurally outrank low-vol indices. Relative strength vs
  benchmark (SPY for equities/ETFs, BTC for crypto) as a context column, not
  a ranking gate.
- Transitions feed: newly-bullish events over recent runs (snapshot diffs),
  not just the current ranked state.
- Stored bar history (incremental daily updates) instead of re-downloading
  5y per symbol per scan.
- Scan runs on GitHub Actions (free), not Vercel cron — Hobby limits can't
  hold 700 symbols. Vercel keeps serving the read API.

## Universe (tiered, tabbed by tier in the UI)

| Tier | ~Count | Symbols from |
|---|---|---|
| Macro core | 30 | reuse `REGIME_UNIVERSE` |
| US large cap | 500 | S&P 500 constituents |
| Nasdaq 100 | ~30 extra | NDX minus S&P overlap |
| Crypto | 100 | top-100 by market cap (CoinGecko free ranking → Yahoo `-USD` symbols) |
| ETFs | ~50 | curated liquid list (sector SPDRs, country, factor, commodity) |

Constituent lists are **static JSON checked into the repo** plus a refresh
script (`scripts/refresh-universe.ts`) — no runtime dependency on Wikipedia
or CoinGecko. A quarterly manual refresh is enough; membership drift of a
few symbols does not change verdicts.

## Data

- Primary: Yahoo v8 chart endpoint (proven in P·01/P·04). Backfill
  `range=5y` once per symbol; thereafter `range=1mo` daily, upserted.
  ~700 small requests/day, concurrency 4, rate-gated, per-symbol isolation.
- Fallback adapters (same `RegimeBar[]` contract, swap-in by design):
  Stooq CSV (keyless, US equities EOD) and Binance klines (keyless, crypto).
  Built and fixture-tested in v1 but not wired as automatic failover until
  Yahoo actually degrades — keep the failure story simple first.
- Storage: `market_bars` (symbol, date, OHLC) ≈ 880k rows after backfill
  (~70 MB) — comfortably inside Supabase free tier.

## Plumbing

- Migration `007_bull.sql` (additive): `market_bars`,
  `bull_snapshots` (regime_snapshots shape + tier), indexes on
  (symbol, date) and (run_date, rank).
- `.github/workflows/bull-backfill.yml` — manual dispatch, chunked,
  resumable (skips symbols already backfilled).
- `.github/workflows/bull-scan.yml` — daily 06:20 UTC (after the Vercel
  ingest cron): incremental bar fetch → engine on stored bars → ranked
  snapshot upsert → transitions diff. Secret: `DATABASE_URL`.
- Read model: `GET /api/bull/latest?tier=` (rank-ordered) and
  `GET /api/bull/transitions?days=`.
- Frontend: P·05 homepage card (`projects/BullFinder.tsx`, same card
  pattern as P·02/P·04, distinct accent) + `/Projects/Bull-Market-Finder`:
  tier tabs, ranked table (rank, name, verdict chip, aligned-since, days,
  strength, RS, last close), newly-bullish highlight rows, transitions
  rail, verdict distribution header. Honest states — "scan pending" before
  the first run, no modeled numbers.

## Engine

No fork. `runMoneyLine` / `resampleWeekly` / `computeRegime` are imported
from `backend/src/regime/` as-is (they are pure). New code is limited to:
strength v2, RS computation, transitions diff, tier-aware ranking wrapper.
Ranking stays group → recency → strength; only the strength input changes.

## Build order

1. **Probes** (live, before code): Yahoo behavior on a 20-symbol equity
   batch incl. dotted/dashed tickers (BRK-B), Stooq CSV shape, Binance
   klines shape, CoinGecko top-100 → Yahoo symbol mapping hit-rate.
2. **Universe builder** + static JSON + refresh script + tests.
3. **Migration + bar store** (backfill/incremental upsert) + fixture tests.
4. **Scan pipeline** (engine reuse, strength v2, transitions, ranking) +
   hand-traced fixture tests.
5. **GitHub Actions** workflows; run backfill; verify row counts.
6. **API routes + frontend** (card, page, Work.tsx traverse adds P·05).
7. **Golden verification**: BTC and AAPL vs the Pine Money Line on
   TradingView; typecheck + full test suite + diff review.

## Risks

- Yahoo is unofficial: mitigated by rate gate, per-symbol isolation,
  ready fallback adapters, and stored bars (a one-day outage costs one
  day's increment, not the history).
- Symbol mapping (class shares, unusual crypto tickers): mapping table in
  the universe JSON, probe-verified.
- GitHub Actions minutes: daily scan ≈ 5–10 min — negligible on free tier.
