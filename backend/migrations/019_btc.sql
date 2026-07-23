-- ────────────────────────────────────────────────────────────────
-- BTC Tracker: price history/snapshots + ETF flow metrics.
-- Mirrors gold_prices/gold_snapshots (016_gold.sql) and
-- gold_flow_metrics (018_gold_flow.sql) shape-for-shape.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists btc_prices (
  run_date   date primary key,
  price      double precision not null,
  source     text not null,                 -- 'coinbase-candle'
  fetched_at timestamptz not null default now()
);

create table if not exists btc_snapshots (
  run_date       date primary key,
  price          double precision,          -- null = no reading yet
  price_currency text not null default 'USD',
  price_as_of    timestamptz,
  price_source   text not null,             -- 'coinbase-spot' | 'coinbase-candle'
  changes        jsonb not null default '{}'::jsonb,  -- {d1, w1, m1, y1}
  computed_at    timestamptz not null default now()
);

create table if not exists btc_flow_metrics (
  locus       text not null,                -- 'etf_us'
  metric      text not null,                -- 'etf_flow_usd_mn'
  period_date date not null,
  value       double precision not null,
  unit        text not null,                -- 'usd_mn'
  source      text not null,                -- 'farside-btc-etf'
  observed_at timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb,
  primary key (locus, metric, period_date)
);

create index if not exists btc_flow_metrics_locus_metric_date_desc
  on btc_flow_metrics (locus, metric, period_date desc);

create index if not exists btc_flow_metrics_period_date_desc
  on btc_flow_metrics (period_date desc);

commit;
