-- ────────────────────────────────────────────────────────────────
-- Gold Tracker stock/flow metrics (additive).
-- Parallel to oil corridor_metrics: locus × metric × period_date.
-- Price stays in gold_prices / gold_snapshots — never blended here.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists gold_flow_metrics (
  locus       text not null,              -- etf_us | etf_global | comex | …
  metric      text not null,              -- etf_holdings_t | comex_registered_toz | …
  period_date date not null,
  value       double precision not null,
  unit        text not null,              -- tonnes | troy_oz | usd_mn
  source      text not null,              -- wgc-etf | comex-stocks
  observed_at timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb,
  primary key (locus, metric, period_date)
);

create index if not exists gold_flow_metrics_locus_metric_date_desc
  on gold_flow_metrics (locus, metric, period_date desc);

create index if not exists gold_flow_metrics_period_date_desc
  on gold_flow_metrics (period_date desc);

commit;
