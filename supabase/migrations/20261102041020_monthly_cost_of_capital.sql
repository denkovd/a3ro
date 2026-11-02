begin;

create table if not exists public.cost_of_capital_observations (
  methodology text not null check (methodology = 'msci-trailing-pe-plus-monthly-10y-v1'),
  market_id text not null check (market_id in ('US', 'CN', 'EA', 'CH', 'JP', 'GB', 'AU')),
  as_of date not null check (extract(day from as_of + interval '1 day') = 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  published_at timestamptz not null default now(),
  primary key (methodology, market_id, as_of),
  check (payload->>'marketId' = market_id),
  check (payload->>'asOf' = as_of::text)
);

create index if not exists cost_of_capital_observations_recent
  on public.cost_of_capital_observations (methodology, as_of desc, market_id);

-- Public market facts are served by the read-only Next.js route. Only the
-- existing privileged server connection can publish; no Data API writes.
alter table public.cost_of_capital_observations enable row level security;
revoke all on public.cost_of_capital_observations from public, anon, authenticated;

commit;
