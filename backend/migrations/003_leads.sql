-- ────────────────────────────────────────────────────────────────
-- Leads schema (Postgres 14+) — additive to 001_init.sql /
-- 002_corridors.sql.
--
-- Captures pro-tier access requests from the Oil Tracker's contact
-- panel (app/api/leads). One row per submission; no dedup/upsert —
-- the same email can legitimately follow up more than once, and
-- this is a low-volume form, not an ingestion feed.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists leads (
  id         bigint generated always as identity primary key,
  email      text not null,
  message    text,
  context    text,
  created_at timestamptz not null default now()
);

commit;
