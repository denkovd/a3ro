# PLAN — Trend Finder (Bull Market Finder, P·02) updates

> **Status (2026-11-17):** decisions locked (see "Decisions" at the end). **All four phases built** — Phase 1 tooltips + sorting (`columns.ts`, `useInfoTip`); Phase 2 asset drawer (`AssetDrawer.tsx`, `/api/bull/asset`); Phase 3 chart (`chart/`, `/api/bull/chart`, `bull/chartSignals.ts` signal contract); Phase 4 fundamentals (`profiles/`, `profileRepo.ts`, migration 023, `profiles-refresh.yml`). Tests: `npm run test:bull`, `npm run test:security`, `backend: npx tsx --test tests/assetProfiles.test.ts`.

Scope: three requested features for `/Projects/Bull-Market-Finder`:

1. **Column explanations on hover** (Str ×vol, RS 63d, Lens, and every other header)
2. **Click an asset → detail view**: chart with flip levels, plus asset details (market cap etc.) and earnings
3. **Sort by any column header**

Files read for this plan: `app/Projects/Bull-Market-Finder/view.tsx`, `app/components/projects/bull/bullData.ts`,
`app/api/bull/{latest,transitions}/route.ts`, `backend/src/bull/{engine,pipeline,adapters,universe,types}.ts`,
`backend/src/regime/{engine,types}.ts`, `backend/src/storage/{bullRepo,earningsRepo}.ts`, `backend/src/earnings/finnhub.ts`,
`app/components/projects/btc/BtcPriceChart.tsx`.

---

## What already exists (and what's missing)

| Need | Status today |
|---|---|
| Daily OHLC history per symbol | **Have it.** `market_bars` (raw + adj series), ~5y backfill per symbol from the scan (`pipeline.ts`, range `5y` on first fetch). |
| Flip levels (D + W) | **Stored, not exposed.** `bull_snapshots` writes `daily_line`, `weekly_line`, `*_flip_price`, `weekly_since_flip_pct`, `weekly_cushion_pct`, `weekly_bars_since_flip` — but `getLatestBullSnapshots` / `BullSnapshotRow` don't return them. |
| Flip history (for chart markers) | **Computable, not stored.** `runMoneyLine` already returns `flips[]`; the per-bar line value isn't emitted. |
| Earnings | **Partial.** `earnings_surprises` (via `getCachedQuarters`) covers tickers on the Earnings-Beat watchlist; Finnhub client + `FINNHUB_API_KEY` already in the backend. |
| Market cap / sector / fundamentals | **Missing.** No profile source or table. |
| Chart library | **None.** Existing charts are hand-rolled SVG (`BtcPriceChart.tsx`). |
| Header tooltips / sorting | **Missing.** Headers are a static string array; rows are always rank-ordered and grouped. |

Constraint to keep: API routes on Vercel **only read**; all writes happen in GitHub Actions jobs (`bull-scan.yml` posture). The Money Line engine is a verified port — **no fork**, only additive output.

---

## Phase 1 — Column definitions, tooltips, sorting (frontend only)

### 1a. One column registry
New `app/components/projects/bull/columns.ts` — single source of truth for header label, alignment, tooltip text and sort accessor (today the header array and `GRID` are separate, which is how they drift).

```ts
type BullColumn = {
  key: SortKey;            // "rank" | "asset" | "state" | "d" | "w" | "confirmed" | "strVol" | "rs63" | "lens" | "close"
  label: string;
  align: "left" | "right";
  tip: (tf: StrategyTimeframe) => string;   // lens-aware text
  sortValue: (r: BullRow) => number | string | null;
  defaultDir: "asc" | "desc";
};
```

### 1b. Tooltip copy (draft — matches what the engine actually computes)

| Column | Tooltip |
|---|---|
| Rank | Position in this lens's ranking: newly bullish → double confirmed → conflicted → bearish → warm-up; most recent confirmation first; ties broken by Str ×vol. |
| State | Money Line verdict for the active lens. D×W: Double Confirmed = bullish daily and weekly; Early = daily flipped, weekly not yet; Lagging = weekly bull, daily broken. Single-leg lenses: Bull / Bear / Warm-up. |
| D / W | Direction of the daily / weekly Money Line (▲ bull, ▼ bear, · warm-up). The leg the active lens doesn't rank on is dimmed. |
| Confirmed / Flip | Date both legs aligned and trading days since — or, for conflicted names, the date of the leg that flipped (D or W). |
| **Str ×vol** | How far price has run into its trend, measured in units of normal daily range: (cushion above the daily flip level % + move since the daily flip %) ÷ 14-day ATR %. Higher = deeper, more established trend. Used only as a tiebreaker, so crypto's bigger swings don't automatically outrank low-volatility assets. |
| **RS 63d** | Relative strength: this asset's return over the last 63 trading days (~1 quarter) minus its benchmark's — S&P 500 for stocks, ETFs and indices; BTC for crypto. Blank for FX, rates and commodities (no natural benchmark). Context only — not a ranking input. |
| **Lens** | Consensus: how many of the strategy lenses (D×W, Weekly, Daily) read this asset as bullish on this run, e.g. 2/3. Conflicted or warm-up counts as neutral. Amber = lenses disagree. |
| Last close | Most recent closed daily bar (futures are roll-adjusted continuous series). |

Also add a one-line tooltip on each **strategy button** and on the **Disagreement** toggle ("shows only assets where at least one lens is bullish and another bearish").

### 1c. Tooltip component
`HeaderTip` in `intel/primitives.tsx` (shared with other modules later):
- Shows on hover **and** keyboard focus (header becomes a `<button>`), tap-to-toggle on touch.
- `role="tooltip"` + `aria-describedby`; small delay (~150 ms) so sweeping the mouse across headers doesn't flicker.
- Portal-rendered so it isn't clipped by the table's `overflow-x-auto`.
- Small dotted underline on labels that carry a tip — discoverable without clutter.

### 1d. Sorting
- Click a header: first click → column's `defaultDir` (desc for Str ×vol / RS 63d / Lens, asc for name/rank), second click → reverse, third → back to default rank order.
- **Nulls always sort last** in both directions (RS 63d is null for FX/rates/commodities — they must not float to the top).
- Sort accessors: State → verdict group order; D/W → trend value; Confirmed → `daysSinceAligned` (fallback flip date); Lens → `bull/of` then net (bull − bear); Asset → `displayName`.
- When sorted by anything other than Rank, **flatten the group headers** (`withBullGroupBoundaries` only applies in rank mode) and show a small "Sorted by RS 63d ↓ · Reset" chip above the table.
- `aria-sort` on the active header; ▲/▼ indicator next to the label.
- Persist in the URL (`?sort=rs63&dir=desc`) so a sorted view is shareable and survives strategy/tier switches and reloads.
- Sort applies after tier filter + disagreement filter (all client-side; ~650 rows, `useMemo` is plenty).

**Decided:** Last close is **not sortable** (prices of unrelated assets aren't comparable); it keeps its tooltip.

As built: the active sort is exposed through the header button's accessible label rather than `aria-sort` (the table is a CSS grid, not an ARIA table). Strategy buttons and the Disagreement toggle also carry tooltips.

**Tests** (`tests/bull-columns.test.mjs`): comparator nulls-last both directions, tri-state toggle, group flattening only outside rank mode.

---

## Phase 2 — Asset detail drawer (snapshot + flip levels)

### UX
- Whole row becomes clickable (plus Enter/Space when focused); also clickable from the "Turned bullish" rail.
- Opens a **right-side drawer** (~560 px, full-screen on mobile) over the table, so the ranked list keeps its scroll position. URL gets `?asset=NVDA` → deep-linkable.
- ↑/↓ in the drawer steps to the previous/next asset in the **current sorted order** — fast scanning.
- **Esc fix:** today Esc leaves the module. New behaviour: Esc closes the drawer first; Esc again leaves.

### Drawer sections (this phase)
1. **Header** — name, symbol, tier, State badge, last close + date, Lens consensus with per-lens breakdown (D×W ▲ · Weekly ▲ · Daily ▼).
2. **Flip levels** — two columns, Daily and Weekly:
   - Trend, **next flip level** (the Money Line value), **distance to flip** (cushion %), last flip date + price, % since flip, bars since flip.
   - Plain-English line, e.g. "Daily turns bearish on a close below 182.40 (−4.1%)".
3. **Recent transitions** for this symbol (last 90 days, all lenses).

### Backend
- Extend `BullSnapshotRow` + `getLatestBullSnapshots` select with the columns already stored: `daily_line`, `weekly_line`, `daily_flip_price`, `weekly_flip_price`, `weekly_since_flip_pct`, `weekly_cushion_pct`, `daily_bars_since_flip`, `weekly_bars_since_flip`. (Cheap; also lets the table show a "dist. to flip" column later.)
- New `GET /api/bull/asset/[symbol]?strategy=` — read-only:
  - **Symbol whitelisted against `BULL_UNIVERSE`** → 404 otherwise (in line with `Security-review.md`; no raw symbol ever reaches SQL or an upstream).
  - Returns: full snapshot row for the requested lens, the other lenses' verdicts, symbol transitions (new repo fn `getTransitionsForSymbol(db, symbol, days)`).
  - `Cache-Control: s-maxage` until the next scan (06:20 UTC).
- `bullData.ts`: `useBullAsset(symbol, strategy)` hook with the same loading/live/pending/error normalisation pattern.

---

## Phase 3 — Chart with Money Line flip levels

### Engine (additive, no fork)
- Add an optional trace to `runMoneyLine`: `{ date, line, trend }` per closed bar. Same loop, just records state it already computes. Default off, so the scan path is unchanged.
- Regression test: last trace point's `line`/`trend` equal the returned final state, and `flips[]` is identical with trace on or off, on fixture series (incl. a roll-adjusted future).

### API
Extend `/api/bull/asset/[symbol]` with `?range=3m|6m|1y|5y` (default 1y):
- `bars`: from `market_bars` — `adj` series where the snapshot is `adjusted`, else `raw` — passed through `closedDailyBars(…, runDate)` so the chart matches the table exactly.
- `moneyLine.daily` / `moneyLine.weekly`: trace computed **server-side** from the full history (Donchian needs warm-up, so compute on all 5y then slice to the range). Weekly via `resampleWeekly`.
- `flips.daily` / `flips.weekly`: from the same run.
- Payload: ~250 bars × 2 traces for 1y — small; 5y ~1,250 bars, still fine.

### Chart
- Candles (or close line toggle), **daily Money Line as a stepped line coloured by trend** (cobalt bull / pink bear), weekly line as a thinner dashed overlay (toggle).
- **Flip markers** ▲/▼ at each flip bar with price on hover.
- **Next-flip horizontal level** with a right-edge label ("D flip 182.40 · −4.1%"), same for weekly.
- Crosshair readout: date, OHLC, D line, W line, cushion.
- Range buttons 3M / 6M / 1Y / 5Y.

**Library: `lightweight-charts` v5** (Apache-2.0, attribution required), lazy-loaded with the drawer — behind a library-agnostic **signal layer**, because Daniel will overlay his own trading signals.

Signal contract (backend produces, chart adapter renders):

```ts
type ChartSignal =
  | { kind: "line" | "step"; id; label; pane?: number; points: { time; value; color? }[] }
  | { kind: "markers"; id; label; points: { time; position: "above" | "below"; shape: "up" | "down" | "dot"; text? }[] }
  | { kind: "level"; id; label; value; style?: "solid" | "dashed" }
  | { kind: "band"; id; label; upper: { time; value }[]; lower: { time; value }[] }
  | { kind: "histogram"; id; label; pane: number; points: { time; value; color? }[] };
```

- One adapter (`bull/chart/lwcAdapter.ts`) maps signals → lwc series / markers / price lines / panes; `band` and anything exotic → a series primitive plugin. Swapping libraries later = rewrite the adapter only.
- **Money Line is the first signal** expressed through this contract (step lines + flip markers + next-flip levels), so the contract is proven before custom signals arrive.
- `/api/bull/asset/[symbol]` returns `signals: ChartSignal[]`; new signals are backend-only additions.

---

## Phase 4 — Asset details & earnings

### Data source
Finnhub (key already configured): `/stock/profile2` (market cap, shares outstanding, sector/industry, exchange, country, IPO date, website, logo) and `/stock/metric?metric=all` (52-week high/low, P/E, beta, dividend yield). Earnings: `/stock/earnings` (last 4 quarters EPS actual vs estimate) + `/calendar/earnings` (next date).

### Storage & refresh (keeps routes read-only)
- New table `asset_profiles` (symbol PK, provider, fetched_at, typed columns for the fields above + `raw jsonb`). Migration in `supabase/`.
- New table or columns for `next_earnings_date` + last-4-quarter surprises for symbols **not** already in `earnings_surprises`.
- New **weekly** GitHub Actions job (`profiles-refresh.yml`) for equity tiers (`us_large`, `ndx_extra`): ~550 symbols × 2 calls at the 60/min free limit ≈ 20 min — fine for Actions. Next-earnings dates refreshed in the daily scan (one calendar call covers everything).
- **Market cap stays daily-accurate without daily calls**: compute shares outstanding (weekly) × last close (daily scan) in the API.

### Coverage — honest per tier
| Tier | Details shown |
|---|---|
| US large / NDX extra | Full profile, metrics, earnings history + next date |
| ETFs | Name, exchange, category if Finnhub returns it; otherwise "Fund details not available" — no fabricated fields |
| Crypto | **CoinGecko (in scope now)**: one `/coins/markets` call (≤250 coins/page) in the daily scan → market cap, circulating / max supply, 24h volume, ATH + drawdown from ATH. Needs a `coingeckoId` per crypto entry in `universeData.ts` (e.g. `BTC-USD` → `bitcoin`). Check free-tier monthly call cap + "Powered by CoinGecko" attribution before shipping. |
| Macro (futures, FX, rates, indices) | Description from `universeData.ts` (contract, roll note); no fundamentals section |

### Drawer section
- **Details** card: market cap (with "as of" date), sector · industry, exchange, 52w range bar with current price marked, P/E, beta, div yield.
- **Earnings** card: next report date (+ days until), last 4–8 quarters EPS actual vs estimate as small bars with surprise %, revenue where cached; reuse `earnings_surprises` via `getCachedQuarters` when the ticker is on the Earnings-Beat watchlist, and link through to that module.
- Optional: "Filings" link to SEC EDGAR for the full report.
- Every field shows its source + fetched date (same freshness pattern as the other modules); nulls render "—", never zero.

---

## Sequencing & sizing

| Phase | Work | Size | Ships value alone? |
|---|---|---|---|
| 1 | Column registry, tooltips, sorting | S | Yes |
| 2 | Drawer, flip-level panel, asset endpoint, repo select extension | M | Yes — flip levels visible immediately, all data already stored |
| 3 | Engine trace, bars + trace in endpoint, chart | M–L | Yes |
| 4 | Profiles table + weekly job, earnings wiring, details/earnings cards | L | Yes |

Suggested order: 1 → 2 → 3 → 4. Phases 1 and 2 need no new data sources.

## Tests to add
- `tests/bull-columns.test.mjs` — sort comparators, nulls-last, tri-state toggle.
- `backend` — Money Line trace parity (Phase 3), profile/metric parsers on Finnhub fixtures (Phase 4), symbol-whitelist rejection on `/api/bull/asset/[symbol]` (add to `test:security`).

## Decisions (Daniel, 2026-11-17)
1. Chart: `lightweight-charts` v5 behind the signal-layer contract (custom signals overlay planned).
2. Detail view: **side panel/drawer** first.
3. CoinGecko crypto info: **in scope now** (Phase 4).
4. Last close: **not sortable**.
