-- ────────────────────────────────────────────────────────────────
-- Gold Tracker schema (Postgres 14+) — additive to 015_bull_strategies.sql.
--
-- Two tables, deliberately kept separate (docs/RULES.md §3 — never
-- blend price kinds without knowing what you're doing):
--   • gold_prices     — pure daily-close history, sourced ONLY from
--     Yahoo Finance's keyless GC=F chart endpoint (sources/yahooGold.ts;
--     replaced FRED's GOLDAMGBD228NLBM after FRED discontinued that
--     series in 2022). This is what all history-based math (w1/y1/
--     y5/y10 changes, trend, momentum, volatility) reads. GoldAPI's
--     live tick is NEVER written here.
--   • gold_snapshots  — the final computed reading the API route
--     serves, one row per run_date. price/price_as_of prefer the
--     live GoldAPI tick (sources/goldapi.ts) when this run got one,
--     falling back to gold_prices' newest Yahoo close otherwise.
--     Mirrors macro_snapshots' shape: honest nulls in `indicators`
--     when a leg doesn't have enough data yet, never a fabricated
--     reading.
--
-- Idempotent cron: upsert on run_date, same as every other cycle.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists gold_prices (
  run_date   date primary key,
  price      double precision not null,
  source     text not null,             -- 'yahoo' (only source today)
  fetched_at timestamptz not null default now()
);

create index if not exists gold_prices_run_date_desc on gold_prices (run_date desc);

create table if not exists gold_snapshots (
  run_date       date primary key,

  price          double precision,          -- null = no reading yet
  price_currency text not null default 'USD',
  price_unit     text not null default 'troy oz',
  price_as_of    timestamptz,
  price_source   text not null,             -- 'goldapi' (live) | 'yahoo' (fallback)

  changes        jsonb not null default '{}'::jsonb,    -- {d1,w1,y1,y5,y10}
  indicators     jsonb not null default '{}'::jsonb,    -- {trend,momentum,volatility,usdPressure,realYieldPressure}

  computed_at    timestamptz not null default now()
);

-- Newest-first reads (the API returns the latest run); also backs the
-- goldCycle self-guard ("did today's row already get a live tick?").
create index if not exists gold_snapshots_run_date_desc on gold_snapshots (run_date desc);

commit;
