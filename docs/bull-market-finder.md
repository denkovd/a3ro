# Module 5 — Bull Market Finder (P·05)

Plan date: 2026-07-10. Status: **built 2026-07-10 — awaiting migration + first scan.**
Whole-market bullish-state screener ranking ~650 assets by newly bullish
regime, daily × weekly confirmed. Free data only. Shares the verified Money
Line engine with P·04 (Regime Shift Finder), which stays as the curated
30-asset macro view. P·05 is the scale version.

## What P·05 adds over P·04

- Universe: ~650 symbols in tiers vs 30 curated.
- Verdict display names per module spec: **Double Confirmed** (bull daily +
  weekly) · **Conflicted Early Bullish** (daily only) · **Conflicted Lagging
  Bullish** (weekly only) · Bearish · Warm-up. Display-layer rename only —
  the engine enums (`BULLISH`/`CONFLICT_DAILY`/…) are untouched so P·04 is
  unaffected.
- Strength v2: volatility-normalized ((cushion% + since-flip%) ÷ ATR%), so
  crypto doesn't structurally outrank low-vol indices. Relative strength vs
  benchmark (^GSPC for equities/ETFs/indices, BTC for crypto) as a context
  column, not a ranking gate.
- Transitions feed: verdict changes over recent runs (snapshot diffs),
  not just the current ranked state.
- Stored bar history (incremental daily updates) instead of re-downloading
  5y per symbol per scan.
- Scan runs on GitHub Actions (free), not Vercel cron — Hobby limits can't
  hold 650 symbols. Vercel keeps serving the read API.

## Universe (tiered, tabbed by tier in the UI)

| Tier | ~Count | Symbols from |
|---|---|---|
| Macro core | 30 | reuse `REGIME_UNIVERSE` |
| US large cap | 503 | S&P 500 constituents (datasets/s-and-p-500-companies, fetched 2026-07-10) |
| NDX extras | ~10 | NDX minus S&P overlap, curated |
| Crypto | ~60 | curated Yahoo-servable majors; refresh script upgrades to CoinGecko top-100 |
| ETFs | ~50 | curated liquid list (sector SPDRs, country, factor, commodity) |

Constituent data is **static, checked into the repo**
(`backend/src/bull/universeData.ts`) plus a refresh script
(`npm run refresh:universe`, prints regenerated lists to stdout for a
human diff) — no runtime dependency on Wikipedia or CoinGecko. Quarterly
refresh is enough; membership drift of a few symbols does not change
verdicts. First tier wins on duplicates (BTC-USD stays macro).

## Data

- Primary: Yahoo v8 chart endpoint (proven in P·01/P·04). Backfill
  `range=5y` once per symbol; thereafter `range=1mo` daily. The 'adj'
  series is append-only from the fetch side — overlapped dates are never
  re-upserted, so roll-shifted history can't be overwritten by raw values.
- Storage: `market_bars` (symbol, series raw|adj, date, OHLC) ≈ 1.6M rows
  after backfill (~120 MB with both series) — inside Supabase free tier.

## Continuous back-adjusted futures (CL=F, GC=F)

Yahoo's continuous futures are **spliced, not back-adjusted** — each roll
leaves an artificial gap that can nudge Donchian flip lines. P·05 maintains
a back-adjusted series for futures symbols; the engine consumes it, raw is
kept for audit.

- **Roll detection, no hardcoded schedules:** the daily scan fetches the
  nearest dated contracts (month codes generated programmatically, e.g.
  `CLQ26.NYM` / `CLU26.NYM`; GC uses its Feb/Apr/Jun/Aug/Oct/Dec active
  months) alongside the continuous symbol. A roll is detected the day the
  continuous close stops matching the old front and starts matching the
  next (0.05% tolerance — adjacent months differ ~0.5–2%). Gap = new front
  close − old front close on the roll day, both real contract closes.
- **Adjustment:** additive back-shift of all bars *before* the roll date;
  adjustments accumulate across rolls. The latest bar is never touched —
  the present is always the real traded price.
- **Audit trail:** `futures_rolls` table — one row per roll event
  (symbol, roll_date, old_contract, new_contract, gap, cum_adjustment).
- **Verification probe:** after each roll, assert
  `adj[d] − raw[d] = Σ gaps of rolls after d` at a date ~30 bars back, and
  assert the latest raw and adj bars are identical. Probe failure flags
  the symbol (serves unadjusted), never blocks the run.
- **Isolation:** roll logic wrapped per symbol — a detection failure on
  gold serves that symbol its raw series (flagged) and never blocks
  BTC-USD, ^GSPC, or anything else.
- **Honest limitation:** Yahoo drops expired-contract history, so rolls
  before pipeline launch cannot be reconstructed — adjustment accumulates
  *prospectively* from go-live; pre-launch bars stay raw-spliced. (No free
  source provides properly back-adjusted continuous futures.)
- **Tests:** `tests/bullRolls.test.ts` (full CL=F roll-cycle fixture:
  detection, gap, back-shift, probe, gap-open false-positive immunity) and
  `tests/bullPipeline.test.ts` (the same cycle through the pipeline with
  storage, plus same-day idempotence — no double shift).

## Fallback data-source adapters

- **Interface:** `BarSourceAdapter { id; fetchDailyBars(symbol, range) }`
  → `RegimeBar[]`; downstream code sees bars only.
- **Primary — Yahoo** behind an in-process rate gate (1 req/s; the scan is
  one long-lived Actions process, so in-memory spacing suffices — unlike
  the serverless cron, which uses the DB-backed ingest/rateGate).
- **Fallbacks:** Stooq CSV (US equities/ETFs/indices, keyless), Binance
  klines (crypto, keyless), Alpha Vantage (equities + WTI; 25 req/day free
  → fallback-only; **no gold endpoint**, hence per-symbol chains).
- **Per-symbol chains** in the universe entries: equities/ETFs
  `[yahoo, stooq]` · crypto `[yahoo, binance]` · CL=F
  `[yahoo, alphavantage, stooq]` · GC=F `[yahoo, stooq]`.
- **Fallback trigger:** previous adapter threw OR returned stale bars
  (newest bar > 7 calendar days before the run date).
- **Health log:** `bull_source_health` — (run_date, symbol, adapter_used,
  fallback_reason, ok, latency, error) — the Yahoo outage-frequency audit.
  (Named to avoid the oil module's `source_health` table.)
- **Tests:** `tests/bullAdapters.test.ts` — parser fixtures + primary
  success / primary fail → fallback success / stale → fallback / all fail
  → logged skip without throwing / per-symbol chain routing.

## Plumbing

- Migration `007_bull.sql` (additive): `market_bars`, `bull_snapshots`,
  `bull_transitions`, `futures_rolls`, `bull_source_health`.
- `.github/workflows/bull-scan.yml` — daily 06:20 UTC (after the Vercel
  ingest cron). First run doubles as backfill (no-bars symbols fetch 5y).
- `.github/workflows/bull-backfill.yml` — manual chunked backfill
  (`--chunk N/M`), resumable, never concurrent with the scan.
- Read model: `GET /api/bull/latest?tier=` and
  `GET /api/bull/transitions?days=`.
- Frontend: P·05 card (`projects/BullFinder.tsx`, signal-cobalt accent)
  in the homepage traverse + `/Projects/Bull-Market-Finder`: tier tabs
  (All / Macro 30 / US 500 / NDX+ / Crypto / ETFs), transitions rail,
  summary strip, grouped ranked table (state, D/W legs, confirmed/flip
  date, vol-normalized strength, RS 63d, last close), honest pre-scan
  states.

## Engine

No fork. `runMoneyLine` / `resampleWeekly` / `computeRegime` imported from
`backend/src/regime/` as-is. New code (`bull/engine.ts`, all pure): ATR%,
strengthVol, rs63, transitions diff, ranking wrapper (Module 4's group →
recency → strength order with strengthVol as the strength input).

## Runbook

1. **Migrate** — paste `backend/migrations/007_bull.sql` into the Supabase
   SQL editor (or `cd backend && npm run migrate:bull`).
2. **Secrets** — add `DATABASE_URL` (pooled) and optionally
   `ALPHAVANTAGE_API_KEY` as GitHub repo secrets.
3. **Backfill** — dispatch the `bull-backfill` workflow (chunk `1/4` …
   `4/4`, or `1/1`). Resumable: re-dispatch continues where it stopped.
4. **Verify live** — `cd backend && npm run verify:bull` (checks BRK-B,
   CL dated contracts + the close-match premise, BTC Money Line state for
   TradingView eyeballing). Network required — not runnable in the build
   sandbox, same posture as `verify:regime`.
5. **Deploy** — the Vercel app picks up `/api/bull/*` and the P·05
   card/page on the next push. The daily `bull-scan` workflow keeps it
   fed; no Vercel cron changes.

## Status

Shipped in this build: adapter layer + failure-mode tests, tiered universe
(~650 symbols), migration 007, bar store (raw/adj, append-only adj),
futures roll module with CL=F cycle test, scan pipeline with per-symbol
isolation + idempotence test, GitHub Actions workflows, `/api/bull/latest`
+ `/api/bull/transitions`, P·05 homepage card + `/Projects/Bull-Market-Finder`.
Backend suite: 179 passing (zero regressions), backend + frontend
typecheck clean. Golden verification against TradingView runs via
`verify:bull` on deploy/local (Yahoo unreachable from the build sandbox).

## Risks

- Yahoo is unofficial: rate gate, per-symbol isolation, ready fallback
  adapters, stored bars (an outage costs one day's increment, not history).
- Roll-gap false positives: impossible by construction — gaps are measured
  between two real dated-contract closes, never inferred from the
  continuous series (tested).
- Back-adjustment changes futures engine inputs vs a TV unadjusted chart —
  expected; golden checks for futures compare against TV's back-adjusted
  continuous setting.
- GitHub Actions minutes: daily scan ≈ 10–15 min at 1 req/s — free tier.
