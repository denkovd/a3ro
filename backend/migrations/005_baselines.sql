-- ────────────────────────────────────────────────────────────────
-- Chokepoint gate baselines schema (Postgres 14+) — additive to
-- 004_regime.sql.
--
-- One row per (corridor, metric, win): the 1y/5y historical norms
-- (mean, p10, p90) for a gate's tanker_transits/tanker_volume, plus
-- year-over-year drift on the 1y row. Refreshed ~monthly by
-- runBaselineCycle (backend/src/ingest/baselineCycle.ts) against
-- IMF PortWatch's server-side statistics endpoint — this table is
-- NOT derived from corridor_metrics; it's an independently-fetched
-- aggregate over a much longer lookback than the daily/7d rows
-- corridor_metrics carries.
--
-- volume is stored in Mt/d — the same canonical unit corridor_metrics
-- uses for tanker_volume (see sources/portwatch.ts's tonsToMegatons).
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists corridor_baselines (
  corridor    text not null,
  metric      text not null,           -- 'tanker_transits' | 'tanker_volume'
  win         text not null,           -- '1y' | '5y'
  mean_value  double precision not null,
  p10         double precision,
  p90         double precision,
  yoy_pct     double precision,        -- only set on '1y' rows: (mean(0..365d) − mean(365..730d)) / mean(365..730d) × 100
  sample_from date not null,
  sample_to   date not null,
  computed_at timestamptz not null default now(),
  primary key (corridor, metric, win)
);

commit;
