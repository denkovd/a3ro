begin;

-- AI Dividend build step 3: capability (Epoch AI), adoption (Census BTOS)
-- and job postings by occupation (Indeed Hiring Lab).
create table if not exists public.dividend_signal_vintages (
  source_key text not null check (source_key in ('epoch', 'btos', 'indeed')),
  content_hash text not null,
  payload jsonb not null,
  data_url text not null,
  first_retrieved_at timestamptz not null,
  last_verified_at timestamptz not null,
  primary key (source_key, content_hash)
);

create index if not exists dividend_signal_vintages_latest
  on public.dividend_signal_vintages (source_key, last_verified_at desc);

create table if not exists public.dividend_signal_runs (
  id bigint generated always as identity primary key,
  source_key text not null check (source_key in ('epoch', 'btos', 'indeed')),
  checked_at timestamptz not null,
  health text not null check (health in ('healthy', 'unavailable')),
  content_hash text,
  error text
);

create index if not exists dividend_signal_runs_latest
  on public.dividend_signal_runs (source_key, checked_at desc, id desc);

alter table public.dividend_signal_vintages enable row level security;
alter table public.dividend_signal_runs enable row level security;
revoke all privileges on table public.dividend_signal_vintages from anon, authenticated, public;
revoke all privileges on table public.dividend_signal_runs from anon, authenticated, public;

commit;
