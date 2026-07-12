-- ────────────────────────────────────────────────────────────────
-- CFTC managed-money positioning schema (Postgres 14+) — additive to
-- 009_macro.sql. Macro Override's POSITIONING half (roadmap P7 /
-- scores-plan #6): managed-money net length in WTI + its 1-yr
-- percentile.
--
-- Deliberately its OWN table, not folded into macro_snapshots: COT is
-- a separate data family with a different cadence (weekly, Friday
-- release) and different failure modes from the FRED macro half —
-- scores-plan's rule is that positioning is never silently merged into
-- macro pressure. One row per COT report_date, upserted (idempotent).
-- Keyless CFTC Socrata data — no api key stored anywhere.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists cot_positioning (
  report_date     date primary key,       -- COT report Tuesday
  market          text not null,          -- e.g. WTI, LIGHT SWEET-NYMEX
  mm_long         double precision not null,
  mm_short        double precision not null,
  net_length      double precision not null, -- longs − shorts
  percentile_1y   double precision,        -- 0..1 over trailing ~52 wks, null until ≥26 wks
  stance          text not null,           -- CROWDED_LONG|CROWDED_SHORT|NEUTRAL|PENDING
  computed_at     timestamptz not null default now()
);

create index if not exists cot_positioning_report_date_desc on cot_positioning (report_date desc);

commit;
