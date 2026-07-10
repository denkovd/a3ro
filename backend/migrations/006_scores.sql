-- ────────────────────────────────────────────────────────────────
-- Composite score snapshots schema (Postgres 14+) — additive to
-- 005_baselines.sql.
--
-- One row per (run_date, score_id), upserted so re-running the daily
-- cron is idempotent (same posture as regime_snapshots /
-- corridor_metrics). The table is both the read model for
-- /api/oil/scores (newest run_date per score_id) and a durable
-- history of how each score evolved — diffing consecutive run_dates
-- reconstructs the trajectory.
--
-- `components` is the jsonb array of leg objects (key, label, value,
-- unit, normalized, weight, asOf, note) exactly as the engine emits
-- them — the score NEVER hides its inputs (docs/scores-plan.md). It
-- is stored whole rather than exploded into rows because legs are
-- read and rendered as a set, never queried individually.
--
-- score is nullable: a composite with fewer than its minimum live
-- legs stores score = null / status = 'insufficient' and still keeps
-- its components so the UI can show which legs are live vs pending.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists score_snapshots (
  run_date           date not null,
  score_id           text not null,          -- 'brent_wti_spread' | 'flow_stress' | …
  score              double precision,       -- 0..100, null when insufficient
  status             text not null,          -- 'elevated'|'normal'|'muted'|'insufficient'
  label              text not null,          -- short badge, e.g. 'WIDE' | 'PENDING'
  headline           text not null,          -- one-line explanation
  components         jsonb not null default '[]'::jsonb,
  coverage_available int not null default 0, -- legs with data
  coverage_total     int not null default 0, -- legs defined
  updated_at         timestamptz not null default now(),
  primary key (run_date, score_id)
);

create index if not exists score_snapshots_latest_idx
  on score_snapshots (score_id, run_date desc);

commit;
