-- ────────────────────────────────────────────────────────────────
-- Regime Shift Finder (Module 4) schema — additive to 003_leads.sql.
--
-- One row per (run_date, symbol), upserted so re-running the daily
-- cron is idempotent (same posture as corridor_metrics). The table
-- is both the read model for /api/regime/latest (newest run_date)
-- and a durable history of state transitions: diffing consecutive
-- run_dates on `verdict` reconstructs every regime change the
-- scanner has ever seen.
--
-- Trends are smallint: 1 bull · -1 bear · 0 warm-up.
-- Verdict: BULLISH | CONFLICT_DAILY | CONFLICT_WEEKLY | BEARISH | WARMUP.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists regime_snapshots (
  run_date              date not null,
  symbol                text not null,
  display_name          text not null,
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
  last_close            double precision,
  last_close_date       date,

  updated_at            timestamptz not null default now(),
  primary key (run_date, symbol)
);

create index if not exists regime_snapshots_latest_idx
  on regime_snapshots (run_date desc, rank);

commit;
