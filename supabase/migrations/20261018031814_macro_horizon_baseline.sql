begin;

create table if not exists public.horizon_source_vintages (
  source_key text not null check (source_key in ('bls', 'bea', 'dfa')),
  content_hash text not null,
  payload jsonb not null,
  first_retrieved_at timestamptz not null,
  last_verified_at timestamptz not null,
  primary key (source_key, content_hash)
);

create index if not exists horizon_source_vintages_latest
  on public.horizon_source_vintages (source_key, last_verified_at desc);

create table if not exists public.horizon_fetch_runs (
  id bigint generated always as identity primary key,
  source_key text not null check (source_key in ('bls', 'bea', 'dfa')),
  checked_at timestamptz not null,
  health text not null check (health in ('healthy', 'degraded', 'unavailable')),
  content_hash text,
  error text
);

create index if not exists horizon_fetch_runs_latest
  on public.horizon_fetch_runs (source_key, checked_at desc, id desc);

alter table public.horizon_source_vintages enable row level security;
alter table public.horizon_fetch_runs enable row level security;

commit;
