-- Server-managed, publicly sourced refinery evidence. No direct browser grants.
begin;
create table if not exists public.oil_refinery_events (
  id text primary key,
  refinery_id text not null,
  incident_id text not null,
  kind text not null check (kind in ('closure','idled','outage','maintenance','restart','disruption','notice')),
  scope text not null check (scope in ('facility','unit','group')),
  event_date text not null check (event_date ~ '^\d{4}-\d{2}(-\d{2})?$'),
  published_at timestamptz not null,
  verified_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists oil_refinery_events_facility_date on public.oil_refinery_events (refinery_id, published_at desc);
create index if not exists oil_refinery_events_incident on public.oil_refinery_events (refinery_id, incident_id);
alter table public.oil_refinery_events enable row level security;
revoke all on public.oil_refinery_events from public, anon, authenticated;

create table if not exists public.oil_refinery_source_checks (
  source_id text primary key,
  last_attempted_at timestamptz not null,
  last_success_at timestamptz,
  status text not null check (status in ('healthy','error')),
  message text
);
alter table public.oil_refinery_source_checks enable row level security;
revoke all on public.oil_refinery_source_checks from public, anon, authenticated;
commit;
