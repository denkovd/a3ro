-- ────────────────────────────────────────────────────────────────
-- Corridor metrics schema (Postgres 14+) — additive to 001_init.sql.
--
-- Mirrors price_observations' append-only-per-key posture: one row
-- per (corridor, metric, period_date), upserted on re-fetch so
-- re-running ingestion is idempotent. Unlike price_observations
-- (append-only audit log feeding a separate resolved table),
-- corridor_metrics IS both the audit log and the read table for v1 —
-- there's no cross-source resolution step yet (one source per
-- corridor today; see docs/corridor-data-sources.md for what's next).
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists corridor_metrics (
  corridor    text not null,
  metric      text not null,
  period_date date not null,
  value       double precision not null,
  unit        text not null,
  source_id   text not null,
  confidence  text not null,
  observed_at timestamptz not null,
  fetched_at  timestamptz not null,
  raw_value   double precision,
  raw_unit    text,
  meta        jsonb,
  updated_at  timestamptz not null default now(),
  primary key (corridor, metric, period_date)
);

create index if not exists corridor_metrics_latest_idx
  on corridor_metrics (corridor, metric, period_date desc);

commit;
