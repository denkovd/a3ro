# Execute module — build plan (Nov 2026)

**Goal:** a Premium A3RO module that tracks the BTC Event Pivots strategy (v1.1). It shows upcoming FOMC/CPI pivots, the live signal, a forward paper-trade record kept separate from the backtest, and a weekly newsletter block.

**Status (26 Nov 2026):** built, not yet live. Pending: apply the migration, merge, then run the workflow once in `backfill` mode and once in `daily` mode.
- Engine: `execute-engine/`. `strategy.py` ports `pine/a3ro_execute_v1_1.pine` and reproduces the published backtest exactly (`test_engine.py::test_parity_with_published_backtest`).
- Migration: `supabase/migrations/20261126120000_execute_module.sql`. Workflow: `.github/workflows/execute.yml`.
- Page: `/Projects/Execute`. APIs: `/api/execute-peek` (public, calendar only) and `/api/execute` (Premium).

**Where the build differs from the plan below:**
- **Writes** go through `DATABASE_URL`, like every other A3RO workflow, not the service-role key.
- **Reads:** tables follow the repo rule of RLS on with nothing granted to anon or authenticated. Reads go through server routes, and the Premium gate is `lib/access.ts` plus middleware, not table policies.
- **Forward paper record:** a deterministic replay of v1.1 from **27 Nov 2026** (`PAPER_START` in `execute_engine.py`). A finished paper trade is never rewritten: the engine's upsert skips it, and a DB trigger refuses the update.
- **Extra tables and columns:** `execute_runs` (engine log), plus `execute_signals.state/as_of_bar`, `execute_trades.levels/checklist/z/pnl_usd/...` and `execute_stats.equity` (the chart).
- **Calendar:** the seed covers 2022–2027, because the backtest rows reference events.
- **Newsletter:** no newsletter builder exists in code (it goes out through Loops). The block is built by `backend/src/execute/format.ts`, served on `/api/execute`, and shown to admins on the page with copy buttons.
- **Max drawdown** = dollar drawdown ÷ starting capital, the definition behind the published −8.4%. Measured from the equity peak it's −7.2%.

---

## 1. Strategy (v1.1, frozen for launch)

| Rule | Value |
|---|---|
| Events | FOMC decisions (2:00pm New York), CPI releases (8:30am New York). Monthly open is off. |
| Narrative | 7-day log move ÷ (hourly vol over the 30 days before the run-in × √168) ≥ **0.75** → fade it (up → short, down → long) |
| Arm | Bar whose close passes event − 24h |
| Entries | E1 at market; E2/E3 limits 0.75% and 1.5% further into the push (⅓ each). Unfilled entries cancel at event + 12h |
| Stop | 3-day swing ± 0.5% buffer. Skip the trade if the stop is more than 3% from E1 |
| Risk | 3% of equity per trade, notional capped at 3x |
| Exits | +2% from average entry: close 50%, stop to breakeven. Runner trails 1.5% once +4% is reached. Time stop at event + 96h |
| Overlaps | One trade at a time |

**Backtest** (Binance BTCUSDT 1H, Jan 2022 – Nov 2026): 27 trades, +38.4% net, profit factor 2.09, max drawdown −8.4%. By year: 2022 +11%, 2023 +16%, 2024 +5%, 2025 +8%, 2026 −2%.
**Caveats:** small sample. The settings were chosen on the data before Mar 2025 and checked on the data after it.

Do not change the rules after launch without a version bump. The forward record must stay tied to one fixed version.

---

## 2. Architecture

```
GitHub Action (daily 00:15 UTC + event-day hourly)
   └─ execute_engine.py  (from backtest.py)
        ├─ pull BTC 1H candles   → data.binance.vision (daily zips) / Coinbase fallback
        ├─ compute signal state for next 14 days of events
        ├─ step the forward paper-trade state machine
        └─ upsert to Supabase
Supabase (execute_* tables, RLS: Premium read, service-role write)
Next.js /execute page (Premium; locked peek for free users)
Newsletter builder (Mon 6pm Sydney) → reads execute_signals for next 7 days
```

**Why GitHub Actions rather than Vercel cron:** it runs Python for free with enough runtime, and it can reach market data. One catch: **api.binance.com blocks US-based IPs**, and GitHub runners are in the US. So:
- Use `data.binance.vision`, which serves the archive files.
- Use Coinbase `BTC-USD` 1h candles for the most recent hours.
- Test reachability first (step 1).

---

## 3. Supabase schema

```sql
create table execute_events (
  id bigserial primary key,
  kind text check (kind in ('FOMC','CPI')),
  event_time timestamptz unique not null,
  source text,                       -- 'fed' | 'bls'
  notes text
);

create table execute_signals (           -- one row per event per snapshot
  id bigserial primary key,
  event_id bigint references execute_events(id),
  snapshot_at timestamptz not null,
  arm_time timestamptz not null,
  btc_price numeric,
  move_7d_pct numeric,
  z numeric,
  z_threshold numeric default 0.75,
  lean text check (lean in ('short','long','none')),
  checklist jsonb,                       -- q1..q5 + month confluence (info only)
  strategy_version text default 'v1.1'
);

create table execute_trades (
  id bigserial primary key,
  mode text check (mode in ('backtest','paper','live')),
  strategy_version text not null,
  event_id bigint references execute_events(id),
  side text, risk_pct numeric,
  entries jsonb, exits jsonb,            -- [{tag, price, qty, time}]
  stop numeric, pnl_pct numeric,
  status text check (status in ('pending','open','closed','skipped')),
  skip_reason text,
  opened_at timestamptz, closed_at timestamptz
);

create table execute_stats (
  mode text, strategy_version text, as_of timestamptz,
  trades int, net_pct numeric, profit_factor numeric,
  win_rate numeric, max_dd_pct numeric, by_year jsonb,
  primary key (mode, strategy_version)
);
```

**RLS:**
- `execute_events`: public read, so the free peek shows the next pivot.
- Every other table: Premium read only. Writes use the service role only, from the Action.

---

## 4. Build steps

1. **Data + engine (GitHub Action)**
   - Check reachability of data.binance.vision and Coinbase from a runner.
   - Refactor `backtest.py` → `execute_engine.py` with three modes:
     - `backfill`: write backtest trades and stats.
     - `snapshot`: write signals for upcoming events.
     - `step`: advance the paper trades.
   - The paper trade state lives in `execute_trades` (status `pending` / `open`). Each run, the engine replays the 1H bars since the last run.
   - Workflow `execute.yml`: runs daily, and hourly from event − 26h to event + 100h.
2. **Supabase:** migration with the tables above, RLS, and a seed of the 2026–27 calendar (dates from the Pine script).
3. **Module page `/execute` (Premium)**
   - Upcoming pivots timeline with countdowns, shown in Sydney time.
   - Signal card: event · BTC 7-day move · z vs 0.75 · lean · "arms in Xh".
   - Open paper position (if any): entries, stop, TP1.
   - Track record, with a **forward paper** tab (default) and a **backtest (hypothetical)** tab: equity curve, stats, by-year table, trade list.
   - Free users see the next pivot and countdown only, with Premium sections locked.
4. **Newsletter block ("Execute this week")**
   - Include it only if an event falls in the next 7 days.
   - Content: event and Sydney time, current z and lean, what would arm it, and the last trade's result.
   - Free version: dates only. Premium version: full lean and record.

---

## 5. Maintenance

- **Calendar:** update `execute_events` each January, and whenever the Fed or BLS revise their dates (shutdowns move CPI).
  - Sources: federalreserve.gov/monetarypolicy/fomccalendars.htm and bls.gov/schedule/news_release/cpi.htm
- **Backtest refresh:** rerun `backfill` monthly. The backtest stats update; the forward record never changes.
- **Version bumps:** any rule change = a new `strategy_version`, and the forward record starts fresh for it.

---

## 6. Launch checks

- [ ] **Legal:** check with a lawyer whether publishing BTC long/short leans to paying subscribers counts as financial product advice (AFSL). Default framing: educational research tracker, general advice only, with warnings on the page and in the newsletter.
- [ ] Label the backtest "hypothetical"; show forward paper results separately.
- [ ] Paper-trade 2+ months before adding any `live` mode.
- [ ] The Pine v1.1 script and the Python engine agree on 2026 trades, within fill differences.

**Expectations to state on the page:** 1–3 trades a month, some months with none, and losing streaks of 2–3 are normal.
