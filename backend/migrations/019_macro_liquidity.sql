-- ────────────────────────────────────────────────────────────────
-- Liquidity / cost-of-capital layer — additive to 009_macro.sql.
--
-- Adds the asset-neutral reads behind the P·06 macro refresh
-- (docs/regime-macro-refresh.md) to the SAME macro_snapshots row: the
-- liquidity stress composite that replaces "macro pressure on oil" as
-- the page's headline number, and nominal GDP vs its own trend.
--
-- Deliberately additive rather than a new table. All of it is computed
-- in one pass off one FRED fetch in runMacroCycle, and the existing
-- pressure_* columns stay untouched so the Oil Tracker's Macro
-- Override chip reads exactly what it read before.
--
-- Idempotent: `add column if not exists`, safe to re-run.
-- ────────────────────────────────────────────────────────────────

begin;

alter table macro_snapshots
  -- liquidity stress composite (asset-neutral)
  add column if not exists liquidity_score      int,                                   -- 0..100, null = insufficient
  add column if not exists liquidity_status     text not null default 'insufficient',  -- elevated|normal|muted|insufficient
  add column if not exists risk_premium_alert   boolean not null default false,        -- elevated composite AND bond-vol breakout
  add column if not exists liquidity_headline   text not null default '',
  add column if not exists liquidity_legs       jsonb not null default '[]'::jsonb,    -- per-leg breakdown, same posture as components
  add column if not exists liquidity_coverage   int not null default 0,                -- legs live

  -- nominal growth vs its own trend windows
  add column if not exists nominal_gdp_yoy      double precision,
  add column if not exists nominal_trend_0307   double precision,
  add column if not exists nominal_trend_1519   double precision,
  add column if not exists nominal_gap          double precision,                      -- yoy − 2015–19 trend, pp
  add column if not exists nominal_as_of        date,

  -- global bond stress leg, kept whole so the UI can name its source
  add column if not exists global_bonds         jsonb,                                 -- GlobalBondRead | null

  -- ── Dale's TOP-DOWN layer: Global Macro Risk Matrix (VAMS) ──
  -- The regime the MARKET is pricing, stored separately from the
  -- bottom-up economic quadrant above. They are allowed to disagree —
  -- the disagreement is the signal, so never reconcile them on write.
  add column if not exists market_regime        text not null default 'PENDING',       -- modal regime across markets
  add column if not exists market_shares        jsonb not null default '{}'::jsonb,     -- per-regime confirmation share
  add column if not exists market_risk_on       double precision,                       -- Goldilocks+Reflation share
  add column if not exists market_scored        int not null default 0,                 -- markets with a live VAMS state
  add column if not exists market_universe      int not null default 0,
  add column if not exists market_headline      text not null default '',
  add column if not exists vams_reads           jsonb not null default '[]'::jsonb,     -- per-market VAMS detail

  -- ── the SIX cycles (growth, inflation, policy, profits,
  -- liquidity, positioning) — corrected from the previous
  -- growth/inflation/monetary/fiscal/liquidity/positioning set ──
  add column if not exists cycles               jsonb not null default '[]'::jsonb,
  add column if not exists cycles_tailwinds     int not null default 0,
  add column if not exists cycles_headwinds     int not null default 0,
  add column if not exists cycles_headline      text not null default '';

commit;
