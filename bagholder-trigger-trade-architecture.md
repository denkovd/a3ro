# Bagholder Trigger Trade (P·08) — Module Architecture

**Product goal:** detect when a high-profile narrative shock creates a trapped population of participants (bagholders) and convert that into a scored, timed, invalidatable trade setup — fade, follow-through, rotation, or delayed mean reversion — across crypto, equities, macro, commodities. Deterministic scoring only (matches the rest of A3RO: no LLM calls, no invented reasoning, every number traces to a listed contribution — see `DECISIONS.md` §1). Route: `/Projects/Bagholder-Trigger-Trade`. Backend: `backend/src/bagholder/`.

---

## 1. Module thesis

**Definition.** A *Bagholder Trigger Trade* (BTT) is a trade whose edge comes not from being right about a narrative, but from correctly identifying that a population of participants is **structurally trapped** by that narrative at a specific price/positioning level, such that their *forced or psychological future behavior* (capitulation, short-covering, forced deleveraging, rotation into a new narrative) is more predictable than the narrative's underlying truth value.

The object of analysis is never "is Chamath right about BTC." It is: *who got positioned because of this narrative, at what level, with what exit constraints, and what forces them to act.*

**The psychology.** Three population states, in order:
1. **Anchoring** — participants enter or add based on a narrative at price/time X.
2. **Sunk-cost holding** — price moves against the narrative; instead of exiting, holders wait for "vindication" (hope holding), because admitting the narrative failed also means admitting the loss.
3. **Forced or capitulatory unwind** — a trigger (funding cost, margin call, redemption, quarter-end mark, a fresher counter-narrative) removes the option to keep waiting. The unwind is mechanical, not persuadable — which is exactly why it's tradeable.

A BTT setup exists in the gap between step 2 and step 3: a population is visibly trapped (positioning + price + narrative all corroborate it) but the mechanical trigger hasn't fired yet. That gap is the tradeable window. Before it, you're guessing. After it (post-capitulation), you're chasing.

**How this differs from adjacent approaches:**

| | What it optimizes for | What it ignores | Where it breaks |
|---|---|---|---|
| **Sentiment analysis** | Aggregate mood/valence of text | Whether anyone is actually *positioned* on that mood | Loud sentiment with no positioning behind it is noise, not a trade |
| **Trend following** | Continuation of an established price move | *Why* the move is happening or who's trapped by it | Gets run over exactly at exhaustion points — the moments BTT is built to catch |
| **Pure contrarianism** | "Crowd is wrong, fade it" | Timing, mechanics, and invalidation — no trigger discipline | Right idea, wrong century; crowded contrarian trades are their own bagholder trap (see §11) |
| **Bagholder Trigger Trade** | The mechanical unwind of a *specific trapped cohort*, timed to a *trigger* | The narrative's truth value entirely | Narrative misattribution, stale triggers, thin positioning data (see §11) |

**Why it deserves its own module.** Thesis Lab (P·07) pressure-tests *a single thesis you already hold* and audits *your* book against it — it's a first-person workflow. Bull Finder (P·04/05) is pure price/trend, no narrative or positioning layer. Regime Shift (P·06) is macro-only. None of them fuse *narrative shock → positioning/crowding → relative performance → macro regime* into one cross-asset signal about a **third party's** trapped position. That fusion — and specifically the trigger/invalidator state machine that turns it into a timed trade rather than an opinion — is a genuinely different object, and it's the piece missing from the platform.

---

## 2. Core framework

Five layers, evaluated in this order because each gates the next — a narrative shock with no crowding behind it never reaches a trigger, no matter how loud.

| Layer | Measures | Why it matters | Representative data | Primary failure mode |
|---|---|---|---|---|
| **L1 — Macro regime** | Is the backdrop supportive or hostile to the narrative's implied direction | A locally correct narrative can lose to a macro current (liquidity, rates, risk-on/off) for quarters | `macro_snapshots` (GRID quadrant, pressure_score), `cot_positioning` (rates/liquidity proxies) | Regime lag (monthly-cadence data describing a market that re-prices in hours); macro doesn't explain single-name moves |
| **L2 — Narrative shock** | Novelty, reach, credibility, and internal hedging of the triggering event | Distinguishes a fresh shock (real information) from a recycled take (the "you're 10 months late" reply pattern) | Source post, reply corpus, prior-appearance timestamp, engagement/reach, author credibility weight | Narrative misclassification; missing the true first-mover post; coordinated amplification read as organic |
| **L3 — Positioning / crowding** | Who is trapped, how, and how much | This is the layer that makes it a *trade* instead of a take — no crowding, no bagholders, no setup | COT, funding rates, options skew/OI, ETF flows, exchange netflows, borrow/lending rates, short interest | Positioning data lag (COT is weekly); no reliable crypto-native positioning source for many pairs; spoofable OI |
| **L4 — Relative performance divergence** | Has price already re-rated relative to peers/benchmark, or is the gap still open | If the market already priced the narrative, there's no edge left — only confirmation | `market_bars`-derived RS, pair spreads (e.g., miner basket vs BTC, AI-infra basket vs miners) | Benchmark selection bias; structural regime breaks (halving cycles, index reconstitutions) corrupt RS baselines |
| **L5 — Trigger / invalidator logic** | Converts L1–L4 into a state machine: `WATCHLIST → SETUP_FORMING → LIVE_TRIGGER → INVALIDATED` | Without explicit trigger and invalidation conditions, this is just a thesis with extra steps | Deterministic rules over the above layers' scores + price action | Trigger conditions too loose (fires on noise) or too tight (never fires); invalidation defined after the fact instead of at trigger time |

Each layer produces one 0–100 score (§3) plus a `coverage` flag (how much of that layer's data is actually live), mirroring the `coverage` int pattern already used in `macro_snapshots`/`tape_snapshots` — a layer with 1 of 4 inputs live is never silently treated the same as one with 4 of 4.

---

## 3. Scoring model

### Component scores (0–100 each, all built as a sum of listed, inspectable contributions — no black-box weighting inside a subscore)

- **Macro Score (M)** — from `macro_snapshots.pressure_score` remapped to the instrument's directional exposure (a GOLDILOCKS quadrant scores differently for BTC-long vs miner-long theses), plus a rates/liquidity-cost term from `cot_positioning`-adjacent series.
- **Narrative Exhaustion Score (N)** — composite of: `staleness` (days since first documented appearance of this narrative, decayed — the Chamath tweet is *not* day zero if the reallocation argument has circulated since Q3 2025), `dispersion` (reply-level agree/disagree/reframe ratio — high disagreement = contested, not exhausted; high "yeah but late" ratio = genuinely exhausted), `repetition_count` (independent sources making the same claim in the trailing window), `hedge_language` (does the source hedge — "I could be wrong" lowers conviction-of-originator, which cuts both ways: less reflexive follow-through, but also signals the poster themselves isn't fully committed).
- **Positioning / Pain Score (P)** — distance of the relevant cohort's positioning from its trailing extreme (reuse the `percentile_1y` pattern from `cot_positioning`), plus funding-rate/borrow-rate stress, plus drawdown-from-cohort's-average-entry (the actual bag size).
- **Opportunity Score (O)** — expected move size implied by the setup vs the instrument's own realized volatility (same σ-scaling discipline as Thesis Lab's scenario engine, DECISIONS.md §4) — a real edge has to be large relative to noise, not just directionally plausible.
- **Confidence Score (C)** — data coverage completeness across all four layers (`live_inputs / total_inputs`, the same coverage-chip idea as Thesis Lab) times a historical base-rate term once backtest history exists for that trigger taxonomy type (§12); starts at a conservative fixed prior pre-backtest.

### Composite formula

```
Composite_raw = wM·M + wN·N + wP·P + wO·O          (weights sum to 1, timeframe-dependent — see table below)
Composite_final = Composite_raw × (0.5 + 0.5 × C/100)
```

The confidence multiplier is a **dampener, never a zeroer** (floor 0.5×) — a low-coverage setup is downgraded, not deleted, exactly matching the "unmodeled things are flagged, never guessed" rule the risk model already follows (DECISIONS.md §5). `C` itself is always shown alongside `Composite_final` — the module must never present a confidence-suppressed score as if it were a clean read.

### Weights by timeframe

| Timeframe | wM (macro) | wN (narrative) | wP (positioning) | wO (opportunity) | Rationale |
|---|---|---|---|---|---|
| **Intraday** | 0.10 | 0.35 | 0.35 | 0.20 | Macro regime is nearly static intraday; narrative freshness and immediate positioning stress dominate |
| **Swing (days–2wk)** | 0.20 | 0.25 | 0.30 | 0.25 | Balanced — this is the module's primary design point |
| **Multi-week** | 0.35 | 0.15 | 0.20 | 0.30 | Narrative freshness decays in relevance; macro regime and structural opportunity size dominate |

### Normalization

Each subscore is built additively (sum of capped, named contributions, clipped to 0–100) rather than z-scored — this trades statistical elegance for auditability, matching Thesis Lab's "you can recompute any output by hand" rule. The known cost: a fixed 0–100 scale doesn't self-adjust across asset classes with wildly different baseline volatility/positioning behavior (BTC funding stress and equity short-interest stress are not naturally comparable in raw form). **V2 flag:** once ≥50 triggers exist per asset class, migrate to within-class percentile normalization; keep the raw additive score as the audit trail underneath it, don't replace it.

### Threshold bands (as requested) — and why they're weak as given

| Band | Label |
|---|---|
| 0–39 | No trade |
| 40–59 | Watchlist |
| 60–74 | Setup forming |
| 75+ | Live trigger |

**Critique, direct:** fixed global thresholds are the single weakest part of a scoring system like this, for three concrete reasons:
1. **They don't adapt across asset classes or vol regimes.** A 75 in low-vol large-cap equities and a 75 in altcoin narrative trades do not represent the same edge; a single global cutoff either lets crypto noise through constantly or makes equities nearly untriggerable.
2. **They invite silent overfitting.** The moment you have backtest history, the temptation is to nudge 75 → 71 because it "would have caught" a good trade. That's curve-fitting with extra steps unless you're doing it out-of-sample.
3. **They imply false precision.** 74 vs 75 reads as a hard line; it is not — it's a smoothed sum of noisy inputs. The band edges deserve a hysteresis buffer (e.g., require 2 consecutive scoring cycles above 75, not one print) to avoid flapping between `SETUP_FORMING` and `LIVE_TRIGGER` on noise.

**Recommendation:** ship the fixed bands in V1 *because they're auditable and simple*, but treat them explicitly as a placeholder — log every score against outcome from day one (§12), and graduate to per-asset-class, backtest-derived bands only after enough trigger history exists to do it out-of-sample. This mirrors the exact tradeoff DECISIONS.md already made for Thesis Lab's fragility scoring ("percentile-based calibration once thesis history accumulates" — flagged future work, not done on purpose).

---

## 4. Trigger taxonomy

| Type | Setup description | Ideal conditions | Common false positives | Preferred expression |
|---|---|---|---|---|
| **Late Narrative Fade** | A narrative resurfaces well after its informational edge decayed; the "smart money already knows" population reacts with derision/staleness replies, but retail still positions on the headline | High `staleness`, high dispersion toward "old news" replies, positioning shows fresh retail inflow on old information | Confusing "loud" with "fresh" — a stale narrative can still be *correct*, just not *new*; don't fade the thesis, fade the crowd reacting to it as if it's new | Spot/perp fade of the fresh-money side, sized small (the edge is timing, not conviction); options for defined-risk fade if IV hasn't repriced |
| **Momentum Continuation Trap** | Price already moved hard on the narrative; latecomers pile in expecting continuation, but positioning/funding shows the move is already crowded and macro/RS shows no confirming divergence | Strong recent trend + `P` score already extreme (crowded, not building) + `O` score low (little vol-adjusted room left) | Mistaking early-stage trend (genuine continuation) for late-stage crowding — requires the positioning layer, not price action alone, to disambiguate | Perp/futures fade with tight invalidation above/below the recent extreme; avoid spot shorts on crypto due to funding/borrow cost |
| **Forced Rotation Unwind** | Capital was crowded into asset A on a narrative; a competing narrative (higher expected return, same capital pool) causes forced/voluntary rotation out of A regardless of A's own fundamentals | Clear substitute asset with rising relative flows, `L1` macro regime favoring risk mobility (not risk-off freeze), documented liquidity-preference language (exactly the "marginal liquidity would rather speculate elsewhere" argument) | Assuming rotation *must* complete — capital can return; this setup requires an ongoing flow confirmation, not a one-time headline | Pair trade: short the rotation-source asset vs long the rotation-destination asset — isolates the flow thesis from either asset's outright direction |
| **Miner/Infra Re-rating Exhaustion** | A structural cost/revenue shift (e.g., opportunity cost of an input resource) re-rates an infrastructure layer (miners) independent of the underlying asset (BTC) it services | Direct, quantifiable margin impact (e.g., $/MWh spread between mining and alternative use), infra equities showing valuation compression while the underlying asset is flat/resilient | Conflating the infra layer with the underlying asset — this is explicitly *not* a BTC-directional trade; treating it as one is the single most common misread in this taxonomy | Relative-value pair: short miner basket vs long the underlying asset (isolates the margin-compression thesis) or short miners vs long the competing-use-case infra (AI compute) if that basket is investable |
| **Structural Story, Cyclical Timing Mismatch** | The narrative's *direction* may be structurally correct, but the *timing mechanism* invoked is cyclical/mean-reverting, so the trade window is unclear and likely premature | Explicit reply-thread disagreement on cyclical-vs-structural framing (this is a direct tell — when the crowd itself is split on timing, it's a signal, not noise) | Treating "structurally right" as "tradeable now" — the module's most important job here is often to output `WATCHLIST`, not a trigger | None preferred by default — this taxonomy type should usually resolve to no trade or a small, long-dated options structure (asymmetric, time-insensitive) rather than spot/perp directional risk |

---

## 5. Data model

Mirrors existing migration conventions exactly: idempotent DDL, `jsonb` for inspectable component breakdowns, `coverage`/`computed_at` fields, newest-first indexes, no silent nulls. Proposed migration `017_bagholder.sql`.

```sql
-- narratives: one row per distinct narrative thread (deduped across posts)
create table if not exists bh_narratives (
  id                bigint generated always as identity primary key,
  slug              text not null unique,          -- "btc-energy-reallocation-to-ai"
  headline          text not null,
  first_seen_at     timestamptz not null,           -- earliest documented appearance — NOT the trigger post's date
  category          text not null,                  -- CRYPTO|EQUITY|MACRO|COMMODITY|CROSS_ASSET
  primary_direction text check (primary_direction in ('bullish','bearish','mixed')),
  status            text not null default 'active', -- active|dormant|resolved
  created_at        timestamptz not null default now()
);

-- linked posts/news/events feeding a narrative
create table if not exists bh_narrative_events (
  id             bigint generated always as identity primary key,
  narrative_id   bigint not null references bh_narratives(id) on delete cascade,
  source_type    text not null,                     -- X_POST|NEWS|FILING|ONCHAIN|OTHER
  source_url     text,
  author         text,
  author_weight  double precision,                  -- credibility/reach prior, 0..1
  posted_at      timestamptz not null,
  text           text,
  reply_agree    int not null default 0,
  reply_disagree int not null default 0,
  reply_reframe  int not null default 0,             -- "point 2 affects miners more than BTC" — a reframe, not agree/disagree
  hedge_detected boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists bh_narrative_events_narrative_idx on bh_narrative_events (narrative_id, posted_at desc);

-- assets the module tracks (superset can reuse bull_snapshots' universe by symbol)
create table if not exists bh_assets (
  symbol       text primary key,                    -- "BTC-USD", "MARA", "RIOT", ai-infra basket members, etc.
  display_name text not null,
  asset_class  text not null,                        -- CRYPTO|MINER_EQUITY|AI_INFRA_EQUITY|MACRO_PROXY|COMMODITY
  role         text not null                          -- UNDERLYING|INFRA|SUBSTITUTE|BENCHMARK
);

-- which assets a narrative implicates, and how
create table if not exists bh_narrative_assets (
  narrative_id     bigint not null references bh_narratives(id) on delete cascade,
  symbol           text not null references bh_assets(symbol),
  exposure_type    text not null,                    -- DIRECT|INDIRECT_INFRA|SUBSTITUTE|BENCHMARK
  implied_direction text check (implied_direction in ('long','short')),
  primary key (narrative_id, symbol)
);

-- one row per (narrative, run_date): the scored state at that point in time — append-only, never overwritten
create table if not exists bh_regime_snapshots (
  narrative_id      bigint not null references bh_narratives(id) on delete cascade,
  run_date          date not null,
  macro_score       int not null,
  narrative_score   int not null,
  positioning_score int not null,
  opportunity_score int not null,
  confidence_score  int not null,
  composite_raw     double precision not null,
  composite_final   double precision not null,
  timeframe         text not null,                   -- INTRADAY|SWING|MULTI_WEEK
  components        jsonb not null default '[]'::jsonb, -- named contributions per subscore, Thesis-Lab style
  coverage          int not null default 0,           -- live inputs / total, this cycle
  computed_at       timestamptz not null default now(),
  primary key (narrative_id, run_date, timeframe)
);
create index if not exists bh_regime_snapshots_latest_idx on bh_regime_snapshots (narrative_id, run_date desc);

-- positioning indicators feeding L3 — generic enough to hold COT-like, funding, OI, borrow, netflow series
create table if not exists bh_positioning_indicators (
  id             bigint generated always as identity primary key,
  symbol         text not null references bh_assets(symbol),
  indicator_type text not null,                      -- FUNDING_RATE|OI|BORROW_RATE|EXCHANGE_NETFLOW|SHORT_INTEREST|COT_NET_LENGTH
  report_date    date not null,
  value          double precision not null,
  percentile_1y  double precision,                    -- null until enough history — same rule as cot_positioning
  stance         text,                                -- CROWDED_LONG|CROWDED_SHORT|NEUTRAL|PENDING
  source         text not null,
  computed_at    timestamptz not null default now(),
  unique (symbol, indicator_type, report_date)
);
create index if not exists bh_positioning_symbol_idx on bh_positioning_indicators (symbol, indicator_type, report_date desc);

-- the trigger state machine — one row per (narrative × setup taxonomy), state transitions are updates, history is bh_trigger_events
create table if not exists bh_triggers (
  id                bigint generated always as identity primary key,
  narrative_id      bigint not null references bh_narratives(id) on delete cascade,
  taxonomy          text not null,                     -- LATE_NARRATIVE_FADE|MOMENTUM_TRAP|FORCED_ROTATION|MINER_RERATING|STRUCTURAL_CYCLICAL_MISMATCH
  state             text not null default 'WATCHLIST', -- WATCHLIST|SETUP_FORMING|LIVE_TRIGGER|INVALIDATED|EXPIRED
  direction         text check (direction in ('long','short','pair','basket','no_trade')),
  primary_symbol    text references bh_assets(symbol),
  trigger_condition jsonb not null,                     -- the rule(s) that must fire — inspectable, not hidden in code
  invalidation      jsonb not null,                     -- explicit invalidation price/time/evidence condition, set AT trigger creation
  entered_state_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists bh_triggers_state_idx on bh_triggers (state, updated_at desc);

-- append-only audit trail of every state transition (never mutate history)
create table if not exists bh_trigger_events (
  id           bigint generated always as identity primary key,
  trigger_id   bigint not null references bh_triggers(id) on delete cascade,
  from_state   text,
  to_state     text not null,
  reason       text not null,
  evidence     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists bh_trigger_events_trigger_idx on bh_trigger_events (trigger_id, created_at desc);

-- the emitted trade object (§9) — one row per LIVE_TRIGGER firing
create table if not exists bh_trade_objects (
  id             bigint generated always as identity primary key,
  trigger_id     bigint not null references bh_triggers(id) on delete cascade,
  payload        jsonb not null,                        -- full trade object, see §9 schema
  status         text not null default 'open',          -- open|closed|invalidated
  outcome_id     bigint,                                  -- fk to bh_backtest_outcomes once resolved (live or historical)
  created_at     timestamptz not null default now()
);

-- resolved outcomes — powers §12 backtesting and the post-mortem UI panel
create table if not exists bh_backtest_outcomes (
  id                bigint generated always as identity primary key,
  trade_object_id   bigint references bh_trade_objects(id),
  is_backtest       boolean not null default false,        -- true = historical replay, false = live trade
  entry_price       double precision,
  exit_price        double precision,
  mfe_pct           double precision,                        -- max favorable excursion
  mae_pct           double precision,                        -- max adverse excursion
  time_to_trigger_hours double precision,
  hold_duration_hours   double precision,
  result            text,                                    -- WIN|LOSS|SCRATCH|INVALIDATED_PRE_ENTRY
  pnl_pct           double precision,
  notes             text,
  created_at        timestamptz not null default now()
);
```

Relationships, in one line: `bh_narratives 1—N bh_narrative_events`, `bh_narratives N—N bh_assets via bh_narrative_assets`, `bh_narratives 1—N bh_regime_snapshots` (time series), `bh_narratives 1—N bh_triggers`, `bh_triggers 1—N bh_trigger_events` (state history) `1—0/1 bh_trade_objects` (only on `LIVE_TRIGGER`) `1—0/1 bh_backtest_outcomes`. Positioning is asset-scoped, not narrative-scoped (`bh_positioning_indicators`), because the same funding-rate series feeds multiple narratives over time — don't duplicate it per narrative.

---

## 6. Inputs and signals

| Category | V1 (essential) | V1 (optional) | V2 | Noise/lag/cost flags |
|---|---|---|---|---|
| **Market data** | OHLC from existing `market_bars` (reuse Bull Finder's stored universe) | — | Intraday bars for the intraday timeframe tier | Free, low-latency, already in-platform — the one category with no caveats |
| **Cross-asset relative performance** | RS vs benchmark using existing `bull_snapshots` RS-63 pattern | Pair-spread z-scores (miner basket vs BTC) | Custom baskets (AI-infra power-cost proxy) with rebalancing rules | Benchmark choice is a real design decision, not a data problem — get it wrong and every downstream score is biased |
| **Liquidity/macro** | `macro_snapshots` (GRID quadrant, pressure_score) — already built | — | Cross-asset liquidity proxy (e.g., stablecoin supply growth for crypto rotation detection) | Monthly/lagging cadence — never treat as a same-day trigger input, only as a gate |
| **Derivatives/positioning** | Perp funding rates (crypto), COT `net_length`/`percentile_1y` (commodities/macro futures) | Options skew/put-call OI, borrow rates | Exchange netflows, short interest for equities, options dealer gamma exposure | **This is the expensive/hard category.** Crypto funding is cheap and real-time; equity short-interest is biweekly and lagged (FINRA); good options positioning data is typically paid. Budget for this to be the weakest-coverage layer in V1 — build the `coverage` flag assuming it |
| **Narrative/social/news** | Manually curated narrative events in V1 (you paste in the tweet + reply themes, as in the seed case) | Basic API pull of reply counts/ratios if platform access allows | Automated narrative clustering/dedup across sources, virality/reach modeling, author-credibility scoring learned from history | **Second-most expensive category** and the noisiest — reply sentiment is easy to game, bot-amplified, and hard to timestamp for true "first appearance." V1 should NOT attempt automated narrative extraction — hand-curate it, exactly like Thesis Lab V1 uses a lexicon engine instead of an LLM |
| **Miner/AI-infra specific** | Manually tracked $/MWh spread (mining profitability vs alternative compute use), if sourceable | Miner-equity basket price/RS via `market_bars` | Live hash-price, network difficulty, power-purchase-agreement pricing feeds | Genuinely niche data; V1 should treat this as manually updated reference data, not a live feed — don't over-engineer an ingestion pipeline for a handful of numbers that change monthly |

**Essential-vs-optional summary rule:** ship V1 with only the categories the platform already has live data for (market data, macro, COT-style positioning where it exists) plus **hand-curated** narrative input. Everything requiring a new paid feed or a scraping pipeline is V2+ — see §13.

---

## 7. UI/UX module design

Dense, terminal-style workbench — matches the existing `Chrome.tsx`/Oil-Tracker aesthetic (mono type, uppercase tracked labels, honest-null "—" states), not a consumer dashboard.

**Layout** — three-column workbench, collapsible:

```
┌─ Top bar: module id (P·08), summary cards, timeframe switcher (Intraday/Swing/Multi-week) ─┐
├──────────────┬────────────────────────────────────────┬───────────────────────────────────┤
│ NARRATIVE     │ TRIGGER BOARD (main)                    │ EVIDENCE / PLAYBOOK (right rail)   │
│ FEED (left)   │                                          │                                     │
│               │  ┌ Trigger card ─────────────────────┐   │  Selected trigger detail:          │
│ - active      │  │ taxonomy · state pill · symbol(s)  │   │  - Scoring breakdown (M/N/P/O/C)   │
│   narratives, │  │ composite score + sparkline        │   │    each with its named             │
│   newest      │  │ direction · expression type         │   │    contributions (reasons[])       │
│   first       │  └─────────────────────────────────────┘  │  - Related assets/pairs panel      │
│ - staleness   │  (repeat, grouped by state:               │  - Playbook: entry/invalidation/   │
│   + dispersion│   LIVE_TRIGGER → SETUP_FORMING →          │    expression, in plain language   │
│   chips       │   WATCHLIST, INVALIDATED collapsed        │  - Post-mortem tab (once resolved):│
│               │   below a fold)                            │    outcome, MAE/MFE, what the      │
│               │                                            │    scoring model got right/wrong   │
└──────────────┴────────────────────────────────────────┴───────────────────────────────────┘
```

**Panels, in detail:**

- **Top-level summary cards** — count by state (`N live triggers / N setups forming / N watchlist`), highest-composite active trigger, coverage health (aggregate `coverage` across active narratives — flags when the module is running on thin data).
- **Narrative feed** — reverse-chronological list of tracked narratives, each showing staleness (days since `first_seen_at`, not post date), reply-dispersion bar (agree/disagree/reframe as a stacked mini-bar, directly surfacing the "10 months late" / "cyclical not structural" signal type), and a link to every linked event.
- **Trigger board** — the core surface. Cards grouped by state, sorted by `composite_final` within state. Each card shows taxonomy tag, symbol(s), direction, expression type, and a compact score readout — clicking opens the right rail.
- **Scoring breakdown** — never just the number. Show `M/N/P/O/C` as five labeled bars with the actual contribution list underneath each (same "reasons[]" transparency as Thesis Lab), plus the confidence-dampening step shown explicitly (`raw → ×confidence → final`) so the discount is never hidden.
- **Related assets/pairs** — for pair/basket expressions, show both legs' independent price/RS charts side by side, not just the spread — a trader needs to see if the "pair trade" is actually one leg doing all the work.
- **Evidence panel** — the literal linked posts/events with their reply-theme tags, timestamped, so every score input is one click from its source (mirrors Thesis Lab's per-leg receipts).
- **Playbook panel** — plain-language: entry condition, invalidation condition, preferred expression, position-sizing note (this module scores setups, it does not size positions — sizing stays the trader's call, consistent with the platform's "no modeled number shown as live" discipline applied to risk).
- **Post-mortem/outcome tracking** — a dedicated tab per resolved trigger: what state path it took (`bh_trigger_events` timeline), realized MAE/MFE, and a short structured note on whether each subscore (M/N/P/O) was directionally right — this is what actually improves the weights over time, and it needs to be a first-class UI surface, not an afterthought table.

---

## 8. Alert logic

| Alert | Cause | Message content | Noise reduction |
|---|---|---|---|
| **Early warning** | Narrative first ingested with ≥1 implicated asset AND `Composite_raw` crosses ~30 for the first time | "New narrative tracked: {headline}. Implicates {symbols}. Composite {score} — below watchlist threshold, monitoring." | Rate-limited to one per narrative per day regardless of score wobble near the threshold |
| **Setup forming** | State transition `WATCHLIST → SETUP_FORMING` (composite sustained 60–74 for ≥2 consecutive scoring cycles — the hysteresis buffer from §3) | "{taxonomy} setup forming on {symbols}. Composite {score} (conf {C}%). Missing: {uncovered layers}." | Requires the 2-cycle sustain; a single-cycle spike never fires this alert |
| **Live trigger** | State transition `SETUP_FORMING → LIVE_TRIGGER` (composite ≥75 sustained, all invalidation pre-conditions still false) | Full trade object summary (§9): direction, expression, entry logic, invalidation, confidence | Deduplicated per `(narrative_id, taxonomy)` — a trigger can only fire once per state entry; re-crossing 75 after already being live does not re-alert |
| **Invalidation** | Any invalidation condition in the trigger's `invalidation` jsonb fires (price level breached, time window expired, contradicting evidence logged) | "{taxonomy} on {symbols} invalidated: {specific condition that fired}. State → INVALIDATED." | Always fires once, immediately, no cooldown — invalidation alerts should never be suppressed, since they're risk-reducing, not attention-seeking |
| **Post-trigger drift** | Live trigger remains open past its stated timeframe window (e.g., swing setup open >14 days) without hitting invalidation or a defined target | "{taxonomy} on {symbols} has drifted past its {timeframe} window. Re-evaluate — thesis may be stale, not wrong." | Fires once at window expiry, then again only on a fixed lower-frequency cadence (e.g., weekly) while still open — decaying urgency, not silence |

**Confidence decay.** A live trigger's displayed confidence decays the longer it sits without a fresh confirming data point:

```
confidence_t = confidence_0 × exp(−λ × hours_since_last_confirming_signal)
```

with `λ` tuned per timeframe tier (fast decay for intraday, slow for multi-week) — this is what powers the post-trigger-drift alert and prevents a stale `LIVE_TRIGGER` card from sitting at full confidence indefinitely on the board.

**Cooldown/dedup, generally:** one alert instance per `(narrative_id, taxonomy, state_transition)` — never re-alert the same transition, and collapse multiple narratives implicating the same asset pair within a short window into a single grouped alert rather than N separate pings.

---

## 9. Trade object design

```json
{
  "id": "bh_trade_00042",
  "trigger_id": 187,
  "setup_name": "Miner/Infra Re-rating Exhaustion — BTC energy reallocation",
  "taxonomy": "MINER_RERATING",
  "direction": "pair",
  "expression_type": "pair_trade",
  "target_assets": ["MINER_BASKET", "BTC-USD"],
  "legs": [
    { "symbol": "MINER_BASKET", "side": "short", "weight": 1.0 },
    { "symbol": "BTC-USD", "side": "long", "weight": 1.0 }
  ],
  "timeframe": "multi_week",
  "entry_logic": {
    "condition": "composite_final >= 75 sustained 2 cycles",
    "reference_spread": -0.12
  },
  "invalidation": {
    "type": "spread_reversion",
    "condition": "pair spread reverts above -0.03 for 3 consecutive sessions, OR $/MWh mining-vs-AI spread narrows below threshold",
    "time_stop": "2026-09-15"
  },
  "supporting_evidence": [
    { "type": "narrative_event", "id": 5031, "note": "reply theme: point 2 affects miners more than BTC" },
    { "type": "positioning", "symbol": "MINER_BASKET", "note": "equity valuations compressing while BTC flat" }
  ],
  "scores": { "macro": 58, "narrative": 41, "positioning": 52, "opportunity": 63, "confidence": 47 },
  "composite_final": 61.4,
  "confidence": 47,
  "bagholder_side": "miner-equity longs anchored to pre-reallocation valuation multiples",
  "notes": "Isolates the margin-compression thesis from BTC directional risk. Confidence capped by thin miner-equity positioning data coverage.",
  "status": "open",
  "created_at": "2026-07-21T04:00:00Z"
}
```

---

## 10. Applied to the Chamath BTC case

**Separate the three exposures first — this is the whole ballgame.**

| Exposure | What the tweet's two points actually imply | Direct mechanism |
|---|---|---|
| **BTC (underlying)** | Point 1 (liquidity rotation) is a demand-side, monetary-flow argument on BTC itself | Marginal speculative capital preferring prediction/equity markets is a *flow* claim, not a supply/protocol claim |
| **Miners (infra)** | Point 2 (energy reallocation) is a direct input-cost/opportunity-cost argument | Miner revenue = f(BTC price, difficulty, power cost); if power's alternative-use value rises 10–20x, miner margins compress *independent of BTC price* |
| **AI infra (substitute)** | The mirror image of point 2 | If mining power is reallocated, AI compute providers gain access to cheaper/more power — a relative beneficiary, not the subject of the original tweet at all |

**Running it through the framework:**

- **L1 Macro** — moderately supportive of "risk mobility" (capital *can* move to prediction/equity markets), not a risk-off freeze. Macro score: mid.
- **L2 Narrative** — this is the layer that kills the naive read. The reply corpus itself does the scoring for you: "you're 10 months late" is a direct staleness signal (this isn't a fresh shock, it's a restatement); "point 1 is cyclical, not structural" is a *structural-vs-cyclical* reframe, which per the taxonomy (§4) routes this toward **Structural Story, Cyclical Timing Mismatch**, not a clean fade or continuation; "point 2 affects miners more than BTC" is an **exposure-separation reframe** that should hard-route point 2 toward the miner leg specifically and *away* from the BTC leg. Narrative Exhaustion Score: **low** (stale, contested) — this cuts against any BTC-outright trigger.
- **L3 Positioning** — this is exactly where V1 is weakest per §6: no live miner short-interest, no live BTC funding read cited here. Without it, the module should show **low coverage → low confidence**, not silence. This alone should suppress any `LIVE_TRIGGER` state.
- **L4 Relative performance** — the real question is whether miner equities have already re-rated vs BTC. If they haven't yet moved relative to BTC despite the argument having circulated for ~10 months (per the reply itself), that's the actual edge signal — a stale *narrative* with an *unresolved* price divergence is the one combination worth trading. If they have already re-rated, there's nothing left.

**Verdict, by candidate trade:**

| Candidate | Verdict | Why |
|---|---|---|
| Short BTC outright | **Reject** | Point 1 is explicitly called cyclical by the crowd itself, the narrative is 10 months stale (poor entry timing — you'd be late to a late take), and it's a pure flow argument with no positioning confirmation cited. This is the textbook case of *becoming* the bagholder by shorting a stale narrative. |
| Short miners outright | **Weak, direction-only** | Point 2's mechanism is real and direct, but an outright miner short still carries full BTC beta — it doesn't isolate the thesis. Only worth it if you have no way to construct the pair leg. |
| **Long AI infra vs short miners** | **Best expression, if AI-infra basket is investable** | Cleanest isolation of the actual structural argument (power's alternative-use value), with zero BTC directional risk. This is the "Miner/Infra Re-rating Exhaustion" taxonomy at its purest. |
| **Long BTC vs short miners** | **Second-best, more practically investable** | Substitutes "AI infra" (hard to access as a clean basket) for "BTC" as the long leg — still isolates the margin-compression thesis from BTC's own direction, and BTC is trivially tradeable. Recommended default expression given real-world access constraints. |
| Fade the structural-bear narrative (i.e., go long BTC outright on "this is priced in/wrong") | **Reject** | Symmetric error to the outright short — there's no positioning evidence the narrative *moved* anyone yet (staleness cuts both ways: if it's old news, it's also not fresh enough to have created a fresh trapped-short cohort to fade). |
| **Do nothing / watchlist** | **Legitimate, and arguably correct for the BTC leg specifically** | The module should be honest here: BTC-outright resolves to `WATCHLIST`, not a trigger, given low narrative-freshness and no cited positioning confirmation. The miner-relative-value trade is the one piece of this that clears `SETUP_FORMING` — and only that, not `LIVE_TRIGGER`, until positioning coverage improves. |

**Bottom line:** this case is a textbook **Miner/Infra Re-rating Exhaustion**, not a BTC-directional trade — the reply corpus effectively pre-labels the taxonomy for you ("affects miners more than BTC" is the module's own routing rule, verbatim, from a reader). The honest output is: BTC leg → watchlist, no trigger; miner-vs-substitute relative value → setup forming, capped confidence pending real positioning data. **If forced to pick one trade today, it's long BTC vs short miners — not because BTC is bullish, but because it's the most investable proxy for "the narrative's power-reallocation argument hits miners, not BTC."**

---

## 11. Risk and failure analysis

| Failure mode | Concrete risk | Mitigation |
|---|---|---|
| **Narrative overfitting** | Taxonomy classification bends to fit a desired trade rather than the evidence | Require the reply-corpus reframe signals (§10) to *route* the taxonomy algorithmically where possible, not be picked after the fact; log the taxonomy decision as a first-class field before scoring, not after |
| **Hindsight bias** | Backtests look great because the taxonomy/thresholds were tuned on the same events being tested | Hold out a rolling set of historical narrative shocks never used for threshold tuning (§12); score them blind and compare |
| **False causality** | Assuming the tweet *caused* the move rather than coincided with an already-in-progress repricing | L4 (relative performance) must show the divergence was *unresolved before* the narrative event, not just present after it — sequence matters, and the schema timestamps `first_seen_at` separately from any single post's date for exactly this reason |
| **Duplicate signals** | Multiple narratives (or multiple posts of the same narrative) each spawning separate triggers on the same underlying trapped cohort | Dedup at the `bh_narratives` level via `slug`; trigger creation should check for an existing open trigger on the same `(taxonomy, primary_symbol)` before opening a new one |
| **Regime shifts** | A trigger built and scored under one macro regime remains open as the regime flips underneath it | `bh_regime_snapshots` is recomputed every cycle, not just at trigger creation — a live trigger's macro score should be able to independently drag its composite down and contribute to invalidation |
| **Bad social data** | Bot amplification, coordinated reply brigading, or simply mis-tagged reply themes inflate/deflate `N` and dispersion scores | V1's manual curation is itself the mitigation (a human reads the replies); if/when this automates in V2, require an author-credibility floor and reach-normalization before counting a reply toward dispersion |
| **Liquidity trap** | The "preferred expression" (pair/basket) is untradeable at size, or has wide spreads/slippage that eat the edge | Playbook panel must show realistic instrument liquidity, not just theoretical expression; default to the most liquid proxy (§10's BTC-vs-miners example) over the "purest" but illiquid one |
| **Crowded contrarianism** | By the time a bagholder setup is obvious enough to score highly, other systematic players have already crowded the same fade, capping the edge | Track how *the module's own signal* correlates with subsequent broad-based crowding (funding flips, OI spikes right after your trigger) in the post-mortem panel — if your triggers consistently precede a crowd rush rather than lead it, that's a warning your edge window is shrinking |

---

## 12. Backtesting and validation

**Replay framework.** Build a corpus of historical narrative shocks (manually curated in V1, same discipline as live input) with `first_seen_at`, implicated assets, and taxonomy label assigned *before* looking at what happened next. Run the deterministic scoring engine against point-in-time data only (no lookahead — macro/positioning/price data must be sliced as-of the narrative's timestamp, not today's values). This is a hard engineering requirement, not a nice-to-have: without strict point-in-time slicing, every backtest number is fiction.

**Success metrics:**

| Metric | Definition | Why it's the right one here |
|---|---|---|
| **Hit rate** | % of `LIVE_TRIGGER` firings resolving `WIN` vs `LOSS`/`INVALIDATED_PRE_ENTRY` | Baseline signal quality, but not sufficient alone (see expectancy) |
| **Expectancy** | `(hit_rate × avg_win_pct) − ((1 − hit_rate) × avg_loss_pct)` | The metric that actually matters for a low-frequency, high-conviction module — a 35% hit rate can still be strongly positive expectancy |
| **Time-to-trigger** | Hours/days from `WATCHLIST` entry to `LIVE_TRIGGER` (or to `EXPIRED` if it never fires) | Validates the state machine isn't sitting on dead setups; also a direct input to the confidence-decay tuning in §8 |
| **Max adverse excursion (MAE)** | Worst drawdown from entry before resolution | The right risk metric for setups meant to be invalidated cleanly — a trigger with a small MAE-to-target ratio is a well-defined setup; a large one means the invalidation logic is too loose |
| **Sharpe/Sortino, with caveat** | Standard risk-adjusted return, computed per-taxonomy (not pooled) | Given expected low trade frequency (this is not a high-N systematic strategy), a single pooled Sharpe across all taxonomies is close to meaningless — report per-taxonomy, and report N alongside every ratio, always |

**Overfitting avoidance:**
- **Suppress below N.** Directly reuse Thesis Lab's own rule (DECISIONS.md §4: "probabilities suppressed below 30 windows") — any taxonomy/timeframe cohort with fewer than ~15–20 resolved historical triggers should display metrics as `insufficient sample`, not a number. This is a real constraint given how infrequent genuine narrative-shock events are; don't paper over small-N with false precision.
- **Walk-forward, not in-sample.** Tune thresholds/weights only on data before a fixed cutoff; validate on data after it; never re-tune on the validation window.
- **Blind taxonomy labeling.** Have the taxonomy/direction call made by a separate pass that doesn't see the eventual outcome — the single easiest way to accidentally cheat a backtest here is labeling the setup type with the benefit of hindsight.

---

## 13. Build plan

| Stage | Scope | Data requirements | UI requirements | Engineering complexity | Likely bottleneck |
|---|---|---|---|---|---|
| **V0 — Concept prototype** | One narrative, hand-scored, hand-tracked in a spreadsheet-equivalent (or a single unstyled page reading a hardcoded JSON fixture) — prove the framework produces a sane score on the Chamath case and 2–3 other historical examples | None new — reuse `macro_snapshots`/`cot_positioning` read-only, manual narrative input | None real — a single debug view is enough | Low | Getting the taxonomy-routing logic right on real historical cases; everything else is trivial at this scale |
| **V1 — Manual/assisted workflow** | Full schema (§5) live; narratives and events entered by hand via a simple form; scoring engine runs deterministically on save (mirrors Thesis Lab's analyze-on-POST pattern); trigger board + evidence panel in UI; no automated alerts yet (page refresh is the "alert") | `bh_*` tables migrated; existing `macro_snapshots`/`cot_positioning`/`market_bars` read for L1/L3/L4 where available | Narrative feed + trigger board + scoring breakdown + evidence panel (§7, minus post-mortem) | Medium — mostly plumbing, the scoring math is already fully specified here | Positioning data coverage (§6) — expect most triggers to launch with capped confidence simply because crypto/equity positioning feeds aren't built yet |
| **V2 — Semi-automated scoring** | Scheduled recompute of `bh_regime_snapshots` for open narratives (cron, same pattern as the bull/oil scan jobs); real alert delivery (§8) wired to existing notification path; post-mortem panel live; basic automated positioning ingestion (funding rates, COT) where a keyless/cheap source exists | New ingestion adapters per positioning source; scheduled job | Add post-mortem tab, alert history view | Medium-high — the ingestion adapters are the real work, scoring/state-machine logic doesn't change | Sourcing reliable, cheap positioning data per asset class — this is the same problem the rest of A3RO already fights (source_health/fallback-adapter pattern from Bull Finder is directly reusable here) |
| **V3 — Full trigger engine** | Automated narrative ingestion (at minimum a semi-automated pull of a tracked account/keyword list, reply-theme classification without a human in the loop), per-asset-class percentile-normalized scoring (graduating from §3's fixed additive scale), backtest-derived threshold bands per taxonomy | Social data source/API access, larger historical backtest corpus (§12) | Backtest/validation dashboard, threshold-tuning view (with the walk-forward discipline visible, not hidden) | High — narrative extraction/classification without an LLM (matching the platform's no-LLM constraint) is a genuinely hard NLP problem with a hand-built lexicon/rule approach, same tradeoff Thesis Lab already accepted for claim extraction | Reply-theme classification accuracy at scale — this is the one place where the "deterministic, no LLM" constraint will bite hardest; budget real time for a rule engine that's good enough, not perfect (same tradeoff DECISIONS.md documents for Thesis Lab: "novel phrasings slip through unscored") |

---

## 14. Brutal critique

**What's weak as specified:**
- **The threshold bands are the weakest link, by design admission (§3).** Fixed global cutoffs will misfire across asset classes until there's enough backtest history to fix them — ship them anyway (auditability beats nothing), but don't let anyone treat 75+ as meaningfully different from 70 in year one.
- **Positioning data (L3) is the layer V1 genuinely cannot do well.** Crypto funding is fine; everything else (equity short interest, options positioning, miner-specific data) is lagged, paid, or absent. Every early trigger will carry a capped confidence score for this reason, not because the framework is wrong.
- **Narrative freshness (`first_seen_at`) is hard to get right and easy to get lazy about.** The temptation will always be to timestamp the trigger post, not the narrative's true origin — and that single shortcut silently breaks the Late-Narrative-Fade and Structural-Cyclical-Mismatch taxonomies, which both depend entirely on staleness being measured correctly.

**What's dangerous if built carelessly:**
- Treating a `LIVE_TRIGGER` composite score as a conviction level rather than a *setup* signal — this module scores setups, not sizes or certainty. If the UI (or a future automation layer) ever auto-sizes a position off `composite_final`, that's the point where a deterministic, well-audited scoring system turns into a false-confidence machine. Keep sizing a human decision, permanently, exactly as the portfolio risk model already does (DECISIONS.md §5: "transparent v1 beats an opaque VaR").
- **Crowded contrarianism is a real, structural risk to the module's own edge over time** (§11) — if this module works and gets used systematically, its own outputs become a crowding signal for whoever's watching next. That's not a reason not to build it, but the post-mortem panel needs to actively track this decay, not just win/loss.

**What's overcomplicated for V1:**
- Automated narrative extraction/classification (V3 scope) — don't build it early. Hand-curating narrative events is not a cop-out; it's the same deliberate choice Thesis Lab made for claim extraction, and it's correct here for the same reason: no API key in this stack, and a human reading a reply thread will out-classify a hand-built lexicon on day one.
- Percentile/z-score normalization (V2+ scope) — the additive, auditable scoring model is the right V1 choice; don't reach for statistical normalization before there's enough per-asset-class history to make it meaningful rather than arbitrary.
- The five-layer framework itself is *not* overcomplicated — it's the minimum needed to distinguish this from sentiment analysis and trend following (§1). Cutting a layer (e.g., skipping macro regime) would collapse it back into a narrower, less differentiated tool.

**What would make it actually differentiated:**
- **The exposure-separation discipline in §10 is the real product.** Most narrative-trading tools stop at "bullish/bearish on the headline asset." The genuine edge here is mechanically forcing every narrative through "what does this actually hit — the underlying, the infra, or the substitute — and are those the same trade?" That single discipline is what turned a generic BTC hot-take into a specific, honest, mostly-non-BTC trade idea in §10, and it's reusable verbatim across equities (a supply-chain scare narrative hits the input supplier, not necessarily the branded end-product company), commodities, and macro.
- **The reply corpus as a structured signal, not just color, is underused elsewhere and is cheap to do well by hand in V1.** "You're 10 months late" and "point 2 affects miners more than BTC" aren't just flavor text — treated as first-class dispersion/reframe signals (§3, §5), they directly route the taxonomy and cap the wrong trade. That's a genuinely differentiated use of social reply data that most sentiment tools throw away by only measuring aggregate valence.
- **Honest `WATCHLIST`/`no_trade` as a first-class, frequently-correct output** (not a fallback state) is what keeps this from becoming just another confirmation-bias machine — and the Chamath case in §10 is a good test of whether the module is honest: the correct output is mostly "watch the BTC leg, weakly trade the miner leg," not a confident directional call either way.
