-- ────────────────────────────────────────────────────────────────
-- App error log (roadmap #48). Failed API routes and cron runs are
-- grouped by (source, fingerprint): one row per distinct error with
-- first seen, last seen and a running count. Vercel Hobby keeps only
-- an hour of logs, so this is the durable history behind the Ops page.
-- Messages are redacted before insert (see storage/errorLogRepo.ts).
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists app_errors (
  id          bigint generated always as identity primary key,
  source      text not null,
  fingerprint text not null,
  message     text not null,
  status      int,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  count       int not null default 1,
  unique (source, fingerprint)
);
create index if not exists app_errors_last_seen_desc on app_errors (last_seen desc);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table app_errors from anon, authenticated, public;
alter table app_errors enable row level security;

commit;
