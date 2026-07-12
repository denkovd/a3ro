-- ────────────────────────────────────────────────────────────────
-- Composite tape schema (Postgres 14+) — additive to 010_positioning.
--
-- The headline synthesis (scores-plan "Composite tape stance"): one
-- row per run_date rolling Flow Stress + Tightness + Macro Override
-- into a single stance + the dominant driver. Computed in the score
-- cycle AFTER those three, upserted (idempotent). Mirrors the other
-- snapshot tables (newest wins on run_date desc).
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists tape_snapshots (
  run_date    date primary key,
  stance      text not null,             -- SUPPLY_TIGHT|SUPPLY_AMPLE|MACRO_DRIVEN|BALANCED|PENDING
  label       text not null,             -- display form, e.g. "SUPPLY-TIGHT"
  headline    text not null,
  drivers     jsonb not null default '[]'::jsonb, -- the 3 composite readings
  coverage    int not null default 0,    -- composites live / 3
  computed_at timestamptz not null default now()
);

create index if not exists tape_snapshots_run_date_desc on tape_snapshots (run_date desc);

commit;
