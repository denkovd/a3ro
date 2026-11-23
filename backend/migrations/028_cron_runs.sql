-- ────────────────────────────────────────────────────────────────
-- Cron run log (roadmap #47, Ops data health tab). One row per
-- scheduled run: when it started, how long it took, whether it
-- worked, and a compact per-series result list taken from the
-- route's JSON report. Written by withErrorLog in
-- app/api/_lib/errorLog.ts; rows older than 90 days are trimmed on
-- insert (see storage/cronRunRepo.ts).
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists cron_runs (
  id           bigint generated always as identity primary key,
  job          text not null,
  started_at   timestamptz not null,
  duration_ms  int not null,
  status       text not null check (status in ('ok', 'degraded', 'failed')),
  http_status  int not null,
  results      jsonb not null default '[]'::jsonb,
  error        text
);
create index if not exists cron_runs_job_started_desc on cron_runs (job, started_at desc);
create index if not exists cron_runs_started_desc on cron_runs (started_at desc);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table cron_runs from anon, authenticated, public;
alter table cron_runs enable row level security;

commit;
