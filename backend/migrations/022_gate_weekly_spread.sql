-- ────────────────────────────────────────────────────────────────
-- Gate weekly spread (Postgres 14+) — additive to 005_baselines.sql.
--
-- Adds, to each (corridor, metric, win) baseline row, the spread of
-- the gate's 7-DAY AVERAGES over that same window. The existing
-- mean/p10/p90 columns describe single days; the product's live gate
-- reading is a 7-day average, which needs its own yardstick.
--
--   weekly             jsonb  { n, min, p05, p10, p25, p50, p75, p90,
--                               p95, max, mad, sampleFrom, sampleTo }
--                             (see backend/src/core/weeklySpread.ts;
--                             units follow the row's metric)
--   weekly_computed_at        when that spread was last computed —
--                             the freshness guard for runGateSpreadCycle
--                             (backend/src/ingest/gateSpreadCycle.ts)
--
-- Both columns are nullable and nothing else reads them by name, so
-- applying this is safe at any point: until the cycle has run, the
-- API returns baselines without a `weekly` field and the frontend
-- keeps its fixed 85–115% band.
--
-- No new table, so the row-level-security and privilege posture set
-- by supabase/migrations/20261029072536 is unchanged.
-- ────────────────────────────────────────────────────────────────

begin;

alter table corridor_baselines
  add column if not exists weekly jsonb,
  add column if not exists weekly_computed_at timestamptz;

commit;
