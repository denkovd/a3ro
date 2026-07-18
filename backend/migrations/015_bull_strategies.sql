-- ────────────────────────────────────────────────────────────────
-- Bull Market Finder unified (P·04 + P·05 merge) — strategy dimension.
-- See bull-finder-unified-architecture.md §2.
--
-- Adds `strategy` to bull_snapshots and bull_transitions so one daily
-- scan can write several lenses over the same stored bars:
--   ml-dw     Money Line daily × weekly double-confirm (the default —
--             exactly the pre-migration behavior; existing rows become
--             ml-dw history via the column default)
--   ml-weekly Money Line weekly-only (position lens)
--   ml-daily  Money Line daily-only (fast lens)
--
-- NOTE (deviation from the spec's first draft, deliberate): single-
-- timeframe strategies still store BOTH computed legs (daily_trend /
-- weekly_trend stay NOT NULL) — both are real computed values from the
-- same bars; `strategy` records which leg DRIVES the verdict/ranking.
-- The UI dims the non-driving leg instead of hiding a NULL.
--
-- Safe to re-run: column adds are IF NOT EXISTS; the pkey swap drops
-- IF EXISTS and recreates the same 3-column key.
-- ────────────────────────────────────────────────────────────────

begin;

-- ── bull_snapshots ──────────────────────────────────────────────
alter table public.bull_snapshots
  add column if not exists strategy text not null default 'ml-dw';

comment on column public.bull_snapshots.strategy is
  'Lens that produced verdict/rank/recency for this row (ml-dw | ml-weekly | ml-daily). Both timeframe legs are always populated; strategy says which one drives.';

alter table public.bull_snapshots
  drop constraint if exists bull_snapshots_pkey;
alter table public.bull_snapshots
  add primary key (run_date, symbol, strategy);

-- Read path is always "latest run, one strategy, rank order" — the
-- indexes gain the strategy column accordingly.
drop index if exists bull_snapshots_latest_idx;
create index bull_snapshots_latest_idx
  on public.bull_snapshots (run_date desc, strategy, rank);
drop index if exists bull_snapshots_tier_idx;
create index bull_snapshots_tier_idx
  on public.bull_snapshots (run_date desc, strategy, tier, rank);

-- ── bull_transitions ────────────────────────────────────────────
alter table public.bull_transitions
  add column if not exists strategy text not null default 'ml-dw';

alter table public.bull_transitions
  drop constraint if exists bull_transitions_pkey;
alter table public.bull_transitions
  add primary key (run_date, symbol, strategy);

commit;
