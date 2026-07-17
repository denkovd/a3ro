-- ────────────────────────────────────────────────────────────────
-- Earnings-Beat Tracker v2 — additive to 013_earnings.sql.
--
-- See earnings-beat-tracker-architecture.md §1 for the authoritative
-- schema this migration converges 013's v1 tables toward. Nothing
-- here drops or renames an existing column/table — it only adds.
--
-- 1. earnings_surprises: add `raw` (verbatim source payload(s) for
--    audit, §1 "raw jsonb") and `updated_at` (tracks null-fill
--    enrichment writes from the v2 upsert routine, §2.1). `pulled_at`
--    remains the immutable first-insert timestamp.
-- 2. pipeline_runs: new table, one row per pipeline execution —
--    powers the weekly watermark (§2.2 step 1) and observability
--    (§2.4, §4 "data_as_of").
-- 3. earnings_surprises.report_date: NOT NULL dropped — the v2
--    backfill's primary source (/stock/earnings) carries no
--    announcement date, so backfilled rows legitimately lack one.
-- 4. RLS: 013 already enabled RLS on watchlist/earnings_surprises but
--    added no policies (nothing could read them through PostgREST).
--    This migration adds the three explicit read policies from §1
--    and enables + policies RLS on the new pipeline_runs table. Uses
--    `drop policy if exists` + `create policy` (Postgres has no
--    `create policy if not exists`) so the migration is safe to
--    re-run without erroring on duplicate policy names.
-- ────────────────────────────────────────────────────────────────

begin;

-- ========================================================================
-- earnings_surprises: additive columns (§1)
-- ========================================================================
alter table public.earnings_surprises
  add column if not exists raw        jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Rows backfilled from /stock/earnings have NO announcement date (that
-- endpoint doesn't carry one) and it must never be faked from `period`/
-- fiscal_date_ending. The calendar-enrich pass fills it later when the
-- quarter falls inside the calendar's ~30-day free-tier lookback.
alter table public.earnings_surprises
  alter column report_date drop not null;

comment on column public.earnings_surprises.report_date is
  'Announcement date. NULL for quarters backfilled solely from /stock/earnings, which has no announcement date — never faked from period/fiscal_date_ending.';
comment on column public.earnings_surprises.fiscal_date_ending is
  'Finnhub-NORMALIZED calendar-quarter-end from /stock/earnings.period (e.g. MU reported 2026-06-24 but period says 2026-06-30) — not the exact fiscal end date.';

-- ========================================================================
-- pipeline_runs : one row per pipeline execution (watermark + observability, §1/§2.2/§2.4)
-- ========================================================================
create table if not exists public.pipeline_runs (
  id             bigint generated always as identity primary key,
  flow           text        not null check (flow in ('weekly','backfill')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  window_from    date,
  window_to      date,
  rows_inserted  integer,
  rows_enriched  integer,                          -- null-fill updates (§2.1)
  tickers_failed text[]      not null default '{}',
  status         text        not null default 'running'
                   check (status in ('running','success','failed')),
  error          text
);

-- Weekly watermark reads "the last successful weekly run" — index to match
-- (§2.2 step 1: `getLastSuccessfulPipelineRun`).
create index if not exists pipeline_runs_flow_status_idx
  on public.pipeline_runs (flow, status, finished_at desc);

-- ========================================================================
-- RLS: pipeline writes with the service-role key (bypasses RLS);
-- the dashboard reads through these explicit policies (§1).
-- ========================================================================
alter table public.watchlist          enable row level security;
alter table public.earnings_surprises enable row level security;
alter table public.pipeline_runs      enable row level security;

drop policy if exists watchlist_read on public.watchlist;
create policy watchlist_read on public.watchlist
  for select to anon, authenticated using (true);

drop policy if exists earnings_read on public.earnings_surprises;
create policy earnings_read on public.earnings_surprises
  for select to anon, authenticated using (true);

drop policy if exists runs_read on public.pipeline_runs;
create policy runs_read on public.pipeline_runs
  for select to anon, authenticated using (true);   -- powers data_as_of (§4)
-- If the dashboard later requires login, drop `anon` from these three policies.

commit;
