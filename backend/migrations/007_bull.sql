-- ────────────────────────────────────────────────────────────────
-- Bull Market Finder (Module 5, P·05) schema — additive to 006.
--
-- market_bars: stored daily OHLC per (symbol, series, date).
--   series 'raw' = as fetched · 'adj' = futures back-adjusted
--   (identical to raw for non-futures). Backfill writes both;
--   the daily scan appends increments and shifts 'adj' history on
--   futures rolls. Raw is never mutated after insert — the audit
--   baseline.
--
-- bull_snapshots: regime_snapshots shape + tier + strength v2 + RS.
--   One row per (run_date, symbol), upserted (idempotent scan).
--
-- bull_transitions: verdict changes between consecutive runs — the
--   "newly bullish" feed. Append-only.
--
-- futures_rolls: one row per detected contract roll — the audit
--   trail (date, old/new contract, gap, cumulative adjustment).
--
-- bull_source_health: which adapter served each symbol each run —
--   the Yahoo outage-frequency audit. (Named to avoid colliding
--   with the oil module's source_health table.)
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists market_bars (
  symbol      text not null,
  series      text not null check (series in ('raw','adj')),
  date        date not null,
  open        double precision not null,
  high        double precision not null,
  low         double precision not null,
  close       double precision not null,
  updated_at  timestamptz not null default now(),
  primary key (symbol, series, date)
);

create index if not exists market_bars_symbol_series_date_idx
  on market_bars (symbol, series, date desc);

create table if not exists bull_snapshots (
  run_date              date not null,
  symbol                text not null,
  display_name          text not null,
  tier                  text not null,
  asset_class           text not null,
  verdict               text not null,
  rank                  integer not null,
  newly_bullish         boolean not null default false,

  daily_trend           smallint not null,
  weekly_trend          smallint not null,
  daily_line            double precision,
  weekly_line           double precision,
  daily_flip_date       date,
  daily_flip_price      double precision,
  weekly_flip_date      date,
  weekly_flip_price     double precision,
  daily_since_flip_pct  double precision,
  weekly_since_flip_pct double precision,
  daily_cushion_pct     double precision,
  weekly_cushion_pct    double precision,
  daily_bars_since_flip integer,
  weekly_bars_since_flip integer,

  aligned_since         date,
  days_since_aligned    integer,
  strength              double precision,
  atr_pct               double precision,
  strength_vol          double precision,
  rs_63                 double precision,
  adjusted              boolean not null default false,
  last_close            double precision,
  last_close_date       date,

  updated_at            timestamptz not null default now(),
  primary key (run_date, symbol)
);

create index if not exists bull_snapshots_latest_idx
  on bull_snapshots (run_date desc, rank);
create index if not exists bull_snapshots_tier_idx
  on bull_snapshots (run_date desc, tier, rank);

create table if not exists bull_transitions (
  run_date      date not null,
  symbol        text not null,
  display_name  text not null,
  tier          text not null,
  from_verdict  text,
  to_verdict    text not null,
  created_at    timestamptz not null default now(),
  primary key (run_date, symbol)
);

create index if not exists bull_transitions_recent_idx
  on bull_transitions (run_date desc);

create table if not exists futures_rolls (
  symbol         text not null,
  roll_date      date not null,
  old_contract   text not null,
  new_contract   text not null,
  gap            double precision not null,
  cum_adjustment double precision not null,
  created_at     timestamptz not null default now(),
  primary key (symbol, roll_date)
);

create table if not exists bull_source_health (
  run_date        date not null,
  symbol          text not null,
  adapter_used    text,
  fallback_reason text,
  ok              boolean not null,
  latency_ms      integer,
  error           text,
  created_at      timestamptz not null default now(),
  primary key (run_date, symbol)
);

commit;
