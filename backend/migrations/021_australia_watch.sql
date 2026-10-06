begin;

create table if not exists australia_watch_observations (
  indicator text not null, reference_period text not null, value double precision not null,
  unit text not null, unit_multiplier int, frequency text not null, adjustment text not null,
  source_url text not null, publication_date date, source_status text, source_comment text,
  first_retrieved_at timestamptz not null, last_verified_at timestamptz not null,
  primary key (indicator, reference_period)
);
create table if not exists australia_watch_revisions (
  id bigserial primary key, indicator text not null, reference_period text not null,
  previous_value double precision not null, next_value double precision not null,
  previous_meta jsonb not null, next_meta jsonb not null, detected_at timestamptz not null default now()
);
create table if not exists australia_watch_fetch_runs (
  id bigserial primary key, indicator text not null, started_at timestamptz not null, finished_at timestamptz not null,
  health text not null, observation_count int not null default 0, error text
);
create index if not exists australia_watch_observations_indicator_period_desc on australia_watch_observations (indicator, reference_period desc);
create index if not exists australia_watch_fetch_runs_indicator_finished_desc on australia_watch_fetch_runs (indicator, finished_at desc);
-- These tables are accessed through the privileged server connection, not the public Data API.
alter table australia_watch_observations enable row level security;
alter table australia_watch_revisions enable row level security;
alter table australia_watch_fetch_runs enable row level security;
commit;
