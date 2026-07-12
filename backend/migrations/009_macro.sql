-- ────────────────────────────────────────────────────────────────
-- Macro layer schema (Postgres 14+) — additive to 008_seasonal.sql.
--
-- One row per run_date holding BOTH readings off the same FRED panel
-- (sources/fredMacro.ts), because they are computed together in one
-- cycle from one fetch (macro/engine.ts):
--   • the Darius-Dale-style GRID regime (quadrant + growth/inflation
--     axes) → powers P·06's Regime Shift Finder card;
--   • the Macro Override "Macro pressure" half (0..100 score +
--     divergence flag) → powers the Macro Override chip (#5).
--
-- Mirrors regime_snapshots' shape (one row per run_date, newest wins
-- on run_date desc). Idempotent cron: upsert on run_date. Free-tier,
-- keyless FRED data — no api key stored anywhere.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists macro_snapshots (
  run_date          date primary key,

  -- GRID regime (P·06)
  quadrant          text not null,             -- GOLDILOCKS|REFLATION|INFLATION|DEFLATION|PENDING
  growth_yoy        double precision,          -- INDPRO YoY %
  growth_momentum   double precision,          -- Δyoy (accel/decel)
  inflation_yoy     double precision,          -- CPI YoY %
  inflation_momentum double precision,
  regime_headline   text not null,
  favored           text not null,
  regime_coverage   int not null default 0,    -- axes live / 2

  -- Macro Override pressure (#5)
  pressure_score    int,                       -- 0..100, null = insufficient
  pressure_status   text not null,             -- elevated|normal|muted|insufficient
  diverging         boolean not null default false,
  pressure_headline text not null,
  components        jsonb not null default '[]'::jsonb, -- per-leg breakdown

  computed_at       timestamptz not null default now()
);

-- Newest-first reads (the API returns the latest run).
create index if not exists macro_snapshots_run_date_desc on macro_snapshots (run_date desc);

commit;
