-- ────────────────────────────────────────────────────────────────
-- KISS allocation target — additive to 019_macro_liquidity.sql.
--
-- Persists the three-sleeve target (stocks 60 / gold 30 / BTC 10 caps,
-- cash the remainder) that runMacroCycle derives from the regime, the
-- risk matrix and the six cycles, so the page renders the SAME numbers
-- the cycle computed rather than recomputing them client-side from a
-- partial view of the inputs.
--
-- Separate file from 019 because 019 has already been applied — an
-- applied migration is history and never edited in place.
--
-- Idempotent: `add column if not exists`, safe to re-run.
-- ────────────────────────────────────────────────────────────────

begin;

alter table macro_snapshots
  -- regime the allocation was taken against, and where it came from.
  -- Stored separately from `quadrant` and `market_regime` above
  -- because the rule prefers the MARKET's regime and falls back to the
  -- economic one — without this you cannot tell, after the fact, which
  -- it actually used on a given day.
  add column if not exists allocation_regime        text,
  add column if not exists allocation_regime_source text not null default 'none', -- market|economic|none

  add column if not exists allocation_invested      double precision,             -- 0..1
  add column if not exists allocation_cash          double precision,             -- 0..1
  -- full per-sleeve breakdown: weight, cap, regimeScore, vamsMultiplier,
  -- cycleDrag, state, available. Kept whole so every weight on the page
  -- can be traced to the four factors that produced it.
  add column if not exists allocation_weights       jsonb not null default '[]'::jsonb;

commit;
