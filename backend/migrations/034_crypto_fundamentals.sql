-- ────────────────────────────────────────────────────────────────
-- Crypto fundamentals (roadmap #82). One DefiLlama snapshot per day,
-- written by .github/workflows/crypto-fundamentals.yml. The job also
-- creates this table if it is missing, so running this by hand is
-- optional.
-- ────────────────────────────────────────────────────────────────
begin;

create table if not exists crypto_fundamentals (
  as_of       date primary key,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table crypto_fundamentals from anon, authenticated, public;
alter table crypto_fundamentals enable row level security;

commit;
