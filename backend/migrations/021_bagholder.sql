-- ────────────────────────────────────────────────────────────────
-- Bagholder Risk Map (P·08) — narrative shock → trapped-cohort
-- scoring → trigger/invalidator state machine. Schema per
-- bagholder-trigger-trade-architecture.md §5, verbatim.
--
-- Idempotent: `create table if not exists`, safe to re-run. Mirrors
-- the rest of the platform's DDL conventions — jsonb for inspectable
-- component breakdowns, coverage/computed_at fields, newest-first
-- indexes, no silent nulls.
-- ────────────────────────────────────────────────────────────────

begin;

-- one row per distinct narrative thread (deduped across posts)
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
  timeframe         text not null default 'SWING',      -- INTRADAY|SWING|MULTI_WEEK — which weight table this trigger scores against
  sustain_cycles    int not null default 0,             -- consecutive cycles at/above the current band, for hysteresis
  entered_state_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists bh_triggers_state_idx on bh_triggers (state, updated_at desc);
create index if not exists bh_triggers_narrative_idx on bh_triggers (narrative_id);

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

commit;
