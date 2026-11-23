-- ────────────────────────────────────────────────────────────────
-- Manual jobs log (Ops). One row each time the owner marks a hand-done
-- update as done (e.g. the quarterly world assets figures). The job
-- list itself lives in lib/manualJobs.ts.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists manual_job_runs (
  id       bigint generated always as identity primary key,
  job_id   text not null,
  done_at  timestamptz not null default now(),
  note     text
);
create index if not exists manual_job_runs_job_done_desc on manual_job_runs (job_id, done_at desc);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table manual_job_runs from anon, authenticated, public;
alter table manual_job_runs enable row level security;

commit;
