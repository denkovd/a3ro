-- ────────────────────────────────────────────────────────────────
-- Week-of-year seasonal baselines schema (Postgres 14+) — additive
-- to 007_bull.sql.
--
-- One row per (metric, iso_week): the 5-year mean/min/max of a WPSR
-- stock series for that ISO calendar week — the "inventories vs 5-yr
-- seasonal range" band Tightness reads (docs/scores-plan.md Phase 2).
-- Refreshed ~monthly by runSeasonalCycle (ingest/seasonalCycle.ts)
-- from EIA 5-year history — like corridor_baselines, this table is
-- NOT derived from corridor_metrics (which holds only a short
-- rolling window); norms need years.
--
-- Values are stored in Mbbl (million barrels), the same canonical
-- unit corridor_metrics uses for these metrics (see
-- sources/eiaInventory.ts's thousandBblToMillionBbl).
--
-- sample_count keeps the honesty ledger: thin weeks (ISO week 53
-- exists in only ~1-2 of any 5 years) are dropped at fetch time, so
-- every stored row has ≥3 observations behind it.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists seasonal_baselines (
  metric       text not null,            -- 'us_crude_stocks' | 'cushing_stocks' | 'gasoline_stocks' | 'distillate_stocks'
  iso_week     int not null,             -- 1..53 (core/time isoWeekOf)
  mean_value   double precision not null,
  min_value    double precision not null,
  max_value    double precision not null,
  sample_count int not null,
  sample_from  date not null,
  sample_to    date not null,
  computed_at  timestamptz not null default now(),
  primary key (metric, iso_week)
);

commit;
