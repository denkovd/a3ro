# Bull Market Finder — Unified Module (merge P·04 + P·05, strategy-switchable)

**Product goal:** one bull-market screener instead of two, with a **strategy switcher** — the Money Line daily×weekly double-confirmation that both modules run today, plus weekly-only and daily-only lenses (and room for more timeframe-focused signals later). Keep everything that proved insightful in both modules; retire everything duplicated. Every number stays traceable to real bars and a deterministic formula — no synthetic data, no modeled numbers shown as live.

---

## 0. What exists today (inventory)

| | **P·04 Bull Market Finder 1** | **P·05 Bull Market Finder 2** |
|---|---|---|
| Route | `/Projects/Regime-Finder` | `/Projects/Bull-Market-Finder` |
| Backend | `backend/src/regime/` | `backend/src/bull/` |
| Universe | 30 curated macro symbols | ~650 tiered (macro = P·04's 30 **verbatim** + S&P 500 + NDX-extra + crypto + ETFs) |
| Engine | Money Line (Donchian-20 close-flip, ratcheted, verified Pine port) on daily × weekly | **Imports P·04's engine unchanged** + ATR%, vol-normalized strength, RS63, transitions |
| Bars | Fetched fresh each run (Yahoo only), never stored | Incrementally stored in `market_bars` (5y backfill then 1mo windows), adapter fallback chains, futures roll adjustment with probes |
| Scan | Vercel cron `/api/cron/ingest` 06:00 UTC (`runRegimeCycle`) | GitHub Actions `bull-scan.yml` 06:20 UTC |
| Table | `regime_snapshots` | `bull_snapshots`, `bull_transitions`, `futures_rolls`, `bull_source_health` |
| Other consumers | Thesis Lab `marketContext` reads `regime_snapshots` **first** for the trend chip (falls back to `bull_snapshots`) | Thesis Lab fallback; risk model reads ATR% from the scan |

**The key structural fact:** P·05 is already a strict superset of P·04 — same engine (imported, not forked), same 30 macro symbols as its first tier, better data plumbing (stored bars, fallback adapters, roll-adjusted futures), plus strength×vol, RS63 and the transitions feed. The merge is therefore *not* an engine reconciliation. It is: (1) retire the duplicate scan/table/page, (2) add a **strategy dimension** so the one module can also answer "what does weekly-only say?" and "what does daily-only say?".

### Keep (the insightful things)

- **The Money Line engine as-is** — the verified Pine port with closed-bar hygiene (forming daily bar dropped, forming week never counts) and the ratchet. It stays the single source of trend truth; strategies compose it, never fork it.
- **The verdict grammar** — Double Confirmed / Conflicted Early (D-only) / Conflicted Lagging (W-only) / Bearish, and **Newly Bullish ≤ 10 sessions**. This ranking (state group → recency → strength) is the module's core insight: *what turned, and how recently*.
- **Vol-normalized strength** (strength ÷ ATR%) — crypto doesn't structurally outrank low-vol indices.
- **RS 63d vs tier benchmark** — context column, never a ranking gate.
- **The transitions rail** — "what changed verdict recently" is half the reason to open the page.
- **The tiered universe with Macro 30 as the first tab** — P·04's curated cross-asset list survives as the default lens, not a separate module.
- **Stored bars + adapter chains + roll adjustment** — and this is the enabler: since `market_bars` already holds every closed series, **additional strategies cost zero extra API calls** — they are pure recomputation over bars we already have.
- **Honest states** everywhere (loading / live / pending / error; "—" is a real null).

### Retire (the duplicates)

- `runRegimeCycle` inside the Vercel ingest cron (the 30 symbols are re-scanned 20 minutes later by the GH Actions run anyway).
- `regime_snapshots` as a written table (kept read-only for history; see §6).
- The `/Projects/Regime-Finder` page and the P·04 homepage card.

---

## 1. The strategy layer (new core abstraction)

```ts
// backend/src/bull/strategies.ts
export interface StrategyResult {
  signal: "BULL" | "BEAR" | "NEUTRAL";     // strategy's own top-line read
  verdict: RegimeVerdict;                   // mapped into the shared enum for ranking/UI
  legs: { daily: Trend | null; weekly: Trend | null }; // glyphs; null = not part of this strategy
  flipDate: string | null;                  // when the current state began
  recencyDays: number | null;               // state age in CLOSED DAILY BARS (weekly ×5) — the ranking scale
  strengthRaw: number | null;               // cushion+sinceFlip equivalent, pre vol-normalization
}

export interface Strategy {
  id: string;              // wire id, e.g. "ml-dw"
  label: string;           // UI label, e.g. "Money Line D×W"
  timeframe: "multi" | "daily" | "weekly";
  compute(closedDaily: RegimeBar[], runDate: string): StrategyResult;
}

export const STRATEGIES: Record<string, Strategy>; // registry — adding a strategy = one entry
```

### v1 strategies (all pure functions over the same stored bars)

1. **`ml-dw` — Money Line D×W** *(default; exactly today's behavior)*
   Daily × weekly double confirmation, conflict verdicts, newly-bullish ≤ 10 sessions. `compute` delegates to the existing `computeRegime`.

2. **`ml-weekly` — Money Line Weekly** *(position-trading lens)*
   Weekly Money Line only (`resampleWeekly` → `runMoneyLine`). Verdict = weekly trend (BULLISH / BEARISH / WARMUP — conflicts don't exist with one leg). Flip dates are weekly closes; recency = weekly bars-since-flip × 5 so ranking stays on the shared daily scale. Newly bullish = flipped within the last 2 closed weeks. Slower and quieter: this is the "ignore the chop" view.

3. **`ml-daily` — Money Line Daily** *(fast lens)*
   Daily Money Line only. Same mapping. Noisier by design; the transitions rail becomes the main read here ("what flipped daily this week").

4. **`trend-200` — 200-day structure** *(optional; ship in v1.1 if v1 lands clean)*
   Classic structural regime: close vs 200-day SMA, with 50/200 cross as the flip event. BULL = close > SMA200 and SMA50 > SMA200; BEAR = both inverted; NEUTRAL otherwise. The "slowest honest lens" — pairs naturally with `ml-daily` at the other extreme. Needs ≥ 200 closed bars (5y backfill covers it).

**Future candidates** (registry makes each a one-file addition, deliberately *not* in v1): weekly Donchian-8 breakout, weekly MACD state, 12-1 momentum (skip-month), 52-week-high proximity. Rule for admission: deterministic on closed bars, has a defensible flip event (for recency ranking), and answers a *timeframe* question the existing lenses don't.

### Ranking + strength (shared across strategies)

Same grammar for every strategy: **newly bullish → bullish → (conflicts, multi-TF only) → bearish → warm-up**, most-recent transition first inside a group, ties broken by `strengthRaw ÷ ATR%` (falls back to raw strength). One ranking function parameterized by StrategyResult — not one per strategy.

### Consensus (the merge dividend)

Because every strategy is computed in the same run over the same bars, the API can attach per symbol:

```json
"consensus": { "bull": 2, "bear": 1, "neutral": 0, "of": 3 }
```

The UI renders it as a small chip (`2/3`) and offers a **"disagreement" filter** — symbols where the fast and slow lenses disagree are exactly where regime change is happening. This is the insight neither module could show alone, and the strongest argument for the merge.

---

## 2. Data model (additive migration `015_bull_strategies.sql`)

- `bull_snapshots`: add `strategy text not null default 'ml-dw'`; replace the `(run_date, symbol)` unique with `(run_date, symbol, strategy)` (create new unique index first, then drop the old constraint — existing rows become `ml-dw` history untouched).
- `bull_transitions`: same — `strategy` column, key extended, existing rows default `'ml-dw'`.
- `legs`: `daily_trend` / `weekly_trend` columns already exist on snapshots; single-timeframe strategies write the unused leg as NULL (honest null, not 0).
- `market_bars`, `futures_rolls`, `bull_source_health`: **unchanged** — the bars pass is strategy-agnostic.
- `regime_snapshots`: no writes after cutover; table kept read-only (history + Thesis Lab fallback during transition).

Row growth: 650 symbols × 3–4 strategies daily ≈ 2.0–2.6k rows/day (vs 650 today). Fine for Supabase free tier for a long time; if it ever matters, prune non-default strategies to a trailing window and keep `ml-dw` forever (one `delete where strategy != 'ml-dw' and run_date < …` in the scan).

---

## 3. Scan pipeline (one scan, N strategy outputs)

`runBullScan` splits into the two passes it already implicitly has:

1. **Bars pass — unchanged.** Fetch/store/roll-adjust once per symbol. This is the expensive, failure-prone part and it does not grow with strategies.
2. **Compute pass — now a loop.** For each symbol's closed adj series: for each registered strategy, `compute` → rank per strategy → upsert snapshots + diff transitions per strategy. Pure CPU over in-memory bars; 650 × 4 strategy evaluations is negligible next to the network pass.

`computeTransitions`'s "first scan ever = skip the noise" guard must key on `(strategy)` — the first run of a *new* strategy produces no transition spam even though `ml-dw` has history.

Cron changes: remove `runRegimeCycle` from `/api/cron/ingest` (ingestion/corridors/baselines untouched — regime was already isolated in its own try/catch there). Retire `scripts/run-regime.ts`. `bull-scan.yml` needs no workflow changes — same entry point, same secrets, slightly more rows written.

---

## 4. API

- `GET /api/bull/latest?strategy=ml-dw` — `strategy` optional, defaults `ml-dw` (**existing consumers keep working unchanged**, including the homepage card). Invalid id → 400 `INVALID_PARAM` listing valid ids. Response gains `strategy` and `strategies: [{id, label, timeframe}]` (switcher is data-driven — adding a backend strategy lights up the UI with no frontend release) and per-row `consensus`.
- `GET /api/bull/transitions?strategy=ml-dw&days=14` — same pattern.
- `GET /api/regime/latest` — becomes a thin **deprecated alias**: serves macro-tier `ml-dw` rows from `bull_snapshots` reshaped to the old contract (same pattern as `/api/watchlist/rankings` → leaderboard). Removed (410) once nothing calls it.

---

## 5. UI — one module page

**Route:** `/Projects/Bull-Market-Finder` keeps the name (drop the "2" from all copy — it's just **Bull Market Finder** now). `/Projects/Regime-Finder` becomes a permanent redirect to it (next.config `redirects()`), landing on the **Macro 30 tab** so P·04 muscle memory still works.

**The switcher:** a segmented control in the title row, above the existing tier tabs:

```
STRATEGY   [ MONEY LINE D×W ]  WEEKLY   DAILY   (200D)
TIER       [ All ]  Macro 30   US 500   NDX+   Crypto   ETFs
```

Switching refetches with `?strategy=` (server ranking is authoritative, same posture as the leaderboard). The page adapts per strategy:

- **D×W:** exactly today's table — two glyph columns, conflict groups, "Confirmed / Flip" cell.
- **Weekly:** one **W** glyph column; groups collapse to newly bullish / bullish / bearish / warm-up; flip dates are weekly closes; "Confirmed" shows the weekly flip (`Jun 30 · W+3`).
- **Daily:** one **D** glyph; same collapse; transitions rail becomes the hero strip.
- Summary strip, strength ×vol, RS 63d, tier tabs, honest empty states: identical across strategies.
- **Consensus chip** per row (`2/3`, colored by majority) + a "Disagreement" toggle filtering to rows where lenses conflict.
- Methodology footnote swaps per strategy (each lens gets its own two-sentence honest description; the D×W text is today's footnote).

**Homepage:** remove the P·04 `RegimeFinder` card; the `BullFinder` card is retitled "Bull Market Finder" and its stack line becomes `Money Line D×W · Weekly · Daily`. `Work.tsx` traverse math: SURFACES 8 → 7, runway `h-[960vh]` → `h-[840vh]`, headline back to "Seven intelligence surfaces". **P-numbers:** the merged module keeps **P·05**; P·04 is retired with a gap (directory grammar tolerates gaps — renumbering six live modules for cosmetics is churn with real regression risk).

---

## 6. Thesis Lab dependency (the one external consumer)

`backend/src/thesis/marketContext.ts` reads the trend chip `regime_snapshots` → `bull_snapshots` (in that order). Flip the priority: **`bull_snapshots` (strategy = `ml-dw`) first**, `regime_snapshots` second (stale-but-present fallback during transition, removable later). `TrendContext.source` already models both table names; tests update with the flipped priority. No other consumer of `regime_snapshots` exists.

---

## 7. Rollout — three independently shippable phases

**Phase A — backend (invisible).** Migration 015 · strategy registry with `ml-dw`/`ml-weekly`/`ml-daily` · compute-pass loop + per-strategy ranking/transitions · API `strategy` param + `strategies` list + consensus · marketContext priority flip. Old UI keeps working untouched (default strategy). *Tests:* strategy unit tests on synthetic bar series (weekly-only flip semantics, recency ×5 scaling, warm-up), per-strategy transition isolation, API param validation, alias-shape test for `/api/regime/latest`.

**Phase B — UI.** Switcher + adaptive columns/groups + consensus chip + disagreement filter + per-strategy footnotes on the existing P·05 page. *Verify:* all strategies against the live API, empty/error states per strategy.

**Phase C — retirement.** Redirect `/Projects/Regime-Finder` · homepage card removal + traverse math · drop `runRegimeCycle` from the ingest cron · `/api/regime/latest` → alias. Ship last, only after A+B have survived a few daily scans.

---

## 8. Edge cases & risks

- **Weekly warm-up:** Donchian-20 on weekly needs ~21 closed weeks; the 5y backfill (~260 weeks) covers every symbol — but newly added symbols with short Yahoo history will sit in WARMUP on `ml-weekly` while live on `ml-daily`. That's honest, not a bug; the consensus chip shows `1/3 · 2 warm-up`.
- **First-run transition noise per strategy** — guarded per §3.
- **`trend-200` NEUTRAL** has no analogue in the verdict enum; if shipped, map NEUTRAL → the conflict group (it *is* a disagreement between the 50/200 legs) rather than widening the shared enum that P·04 history uses.
- **Ranking comparability:** recency is always expressed in daily-bar units (weekly ×5) so "most recent first" means the same thing on every strategy — this is the one invariant every future strategy must honor.
- **regime_snapshots history:** frozen, not migrated — `ml-dw` history continues seamlessly in `bull_snapshots`, which already has it.

---

## Open questions (decide before Phase A)

1. **Strategy set for v1:** ship `ml-dw` + `ml-weekly` + `ml-daily` first and hold `trend-200` for v1.1 (recommended), or include all four from day one?
2. **Naming:** merged module keeps "Bull Market Finder" at P·05 with a retired-P·04 gap (recommended) — or do you want a renumber?
3. **Retention:** keep all strategies' history forever, or prune non-default strategies to a trailing ~90 days (recommended: don't prune until it matters)?
