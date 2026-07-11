# Module 4 — Regime Shift Finder (P·04)

Status date: 2026-07-06. Ranks a curated 30-asset macro watchlist by newly
bullish regime, using the Money Line trend engine confirmed on daily **and**
weekly closes. Free data only.

> **Repositioning note (2026-07-11).** P·04 stays the **Regime Shift Finder**
> and stays live — it works today, backed by the `regime_snapshots` pipeline.
> P·05 is the separate **Bull Market Finder**. The two are kept as clearly-named
> distinct modules. The overlap to be aware of: P·05 imports this exact
> `REGIME_UNIVERSE` verbatim as its "Macro 30" tab and runs it through the same
> Money Line engine, so today P·04's content is a subset of P·05. Per the
> 2026-07-11 decision, P·04's **engine will evolve** (keeping its Regime Shift
> Finder identity) from Money-Line-trend into a **Darius-Dale-style macro regime
> model** — a top-down growth × inflation GRID on free FRED data, sharing the
> macro layer with scores-plan's Macro Override — which removes the overlap.
> See docs/roadmap.md → "P·04 evolution". Everything below documents the current
> Money Line engine: it powers P·04 today and also backs P·05's Macro 30 tab.

## Signal engine

TypeScript port of the "BullMania Money Line [Recreation]" Pine v6 indicator
(`backend/src/regime/engine.ts`):

- Donchian channel close-flip, length 20, **ratcheted** (the flip line only
  rises in an uptrend / only falls in a downtrend, resetting at each flip).
- The channel excludes the bar being evaluated (Pine `ta.highest(high, N)[1]`);
  flips confirm **only on candle close** — an intrabar wick through the line
  never flips.
- Run independently on daily bars and on Monday-anchored weekly bars resampled
  from daily. Closed bars only: the forming daily bar and the current week are
  excluded, so states never repaint. (Deliberate deviation from TradingView,
  which shows the forming weekly candle's provisional state mid-week; the
  scanner is strictly more conservative.)
- Flip dates are stamped with the last trading day inside the candle; TV stamps
  weekly flips with `time_close` (the following Monday), so its table reads a
  few days later for the same flip.

Labels (exactly the module spec): **Bullish** = bullish daily + weekly ·
**Conflicted · D** = bullish daily only · **Conflicted · W** = bullish weekly
only · **Bearish** = bearish both · Warm-up = insufficient history.

**Newly bullish** = daily × weekly alignment began within the last 10 closed
daily bars (alignment start = the later of the two flips). Ranking is
recency-first inside verdict groups; strength (daily cushion above the flip
line + move since flip) breaks ties.

## Data

Yahoo Finance v8 chart endpoint — the same unofficial, keyless source the oil
module's `yfinance.ts` already uses in production. One request per symbol per
day (`interval=1d&range=5y`), concurrency 4, ~30 requests/day total.
Replaceable by design: swap `fetchDailyHistory` (regime/yahooHistory.ts) for
any provider returning `RegimeBar[]`. Universe lives in
`backend/src/regime/universe.ts` — editing that list is the only step needed
to change coverage.

## Plumbing

- Daily cron (`/api/cron/ingest`, 06:00 UTC) runs `runRegimeCycle` after price
  and corridor ingestion, in its own try/catch (a regime failure can never
  touch price ingestion). Per-symbol isolation inside the cycle.
- Storage: `regime_snapshots` (migration `004_regime.sql`), one row per
  (run_date, symbol), upserted — idempotent cron, durable transition history
  (diff consecutive run_dates on `verdict`).
- Read model: `GET /api/regime/latest` → newest run, rank-ordered.
- Frontend: P·04 card in the homepage traverse (`projects/RegimeFinder.tsx`)
  + full ranked table at `/Projects/Regime-Finder`. Honest states throughout:
  before the first scan the UI says "scan pending" — no modeled numbers.

## Runbook

1. **Migrate** — paste `backend/migrations/004_regime.sql` into the Supabase
   SQL editor (or `cd backend && npm run migrate:regime`).
2. **Seed** (optional, instead of waiting for the cron):
   `cd backend && DATABASE_URL=... npx tsx scripts/run-regime.ts`
3. **Verify the engine against the original indicator**:
   `cd backend && npm run verify:regime` — checks BTC's weekly bearish flip of
   2025-11-17 (week of 11-10, close ≈ 94.2k) and the absence of the
   late-Jun-2024 false flip, then prints the current state for eyeballing
   against the Pine script on a BTC-USD 1W chart.
4. **Deploy** — no new env vars, no vercel.json change (same daily cron).

## Tests

`backend/tests/regimeEngine.test.ts` (state machine hand-traces incl. a
ratchet-vs-raw distinguishing case, weekly resample, verdict mapping,
end-to-end newly-bullish, ranking) and `regimePipeline.test.ts` (Yahoo parser
fixtures, per-symbol failure isolation, forming-bar exclusion). Sandbox note:
Yahoo isn't reachable from the build sandbox, so golden verification against
live BTC data runs via `verify:regime` on deploy/local.
