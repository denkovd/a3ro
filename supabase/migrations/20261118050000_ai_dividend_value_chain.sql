begin;

-- AI Dividend build step 2: trailing-12-month company figures from SEC XBRL.
-- One row per distinct dataset; re-fetching identical figures only bumps last_verified_at.
create table if not exists public.value_chain_vintages (
  content_hash text primary key,
  payload jsonb not null,
  first_retrieved_at timestamptz not null,
  last_verified_at timestamptz not null
);

create index if not exists value_chain_vintages_latest
  on public.value_chain_vintages (last_verified_at desc);

alter table public.value_chain_vintages enable row level security;
revoke all privileges on table public.value_chain_vintages from anon, authenticated, public;

commit;
