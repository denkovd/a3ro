-- ────────────────────────────────────────────────────────────────
-- Asset profiles (Postgres 14+) — Bull Market Finder asset drawer,
-- Phase 4. One row per scan-universe symbol that has fundamentals:
--
--   equities / ETFs  provider 'finnhub'   (weekly: /stock/profile2,
--                                          /stock/metric, /stock/earnings;
--                                          daily: next earnings date)
--   crypto           provider 'coingecko' (daily: /coins/markets)
--   macro            no row — no fundamentals by design
--
-- `symbol` is the scan's Yahoo notation (BRK-B); `provider_id` is the
-- provider's own key (BRK.B / bitcoin). Units are stored as plain
-- numbers (shares, USD) — never provider "millions".
-- Market cap for equities is recomputed at read time as
-- shares_outstanding × latest scan close, so it stays daily-fresh on
-- a weekly fetch; market_cap here is the provider's own figure.
--
-- Written only by the GitHub Actions job (profiles-refresh.yml) over
-- the privileged server connection; read by /api/bull/asset. RLS on,
-- no anon/authenticated access — same posture as
-- supabase/migrations/20261029072536.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists asset_profiles (
  symbol               text primary key,
  provider             text not null check (provider in ('finnhub', 'coingecko')),
  provider_id          text not null,
  name                 text,
  exchange             text,
  country              text,
  currency             text,
  industry             text,
  ipo_date             date,
  website              text,
  logo_url             text,
  shares_outstanding   double precision,
  market_cap           double precision,
  week52_high          double precision,
  week52_low           double precision,
  pe_ttm               double precision,
  beta                 double precision,
  dividend_yield_pct   double precision,
  circulating_supply   double precision,
  total_supply         double precision,
  max_supply           double precision,
  volume_24h           double precision,
  ath                  double precision,
  ath_date             date,
  ath_change_pct       double precision,
  market_cap_rank      int,
  -- newest first: [{ period, year, quarter, actual, estimate, surprisePct }]
  earnings             jsonb check (earnings is null or jsonb_typeof(earnings) = 'array'),
  next_earnings_date   date,
  next_earnings_hour   text,
  fetched_at           timestamptz not null,
  earnings_fetched_at  timestamptz,
  raw                  jsonb
);

alter table asset_profiles enable row level security;
revoke all on asset_profiles from public, anon, authenticated;

commit;
