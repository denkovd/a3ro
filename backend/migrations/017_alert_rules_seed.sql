-- ────────────────────────────────────────────────────────────────
-- Seed free-tier Oil Tracker alert rules (docs/RULES.md §4).
-- Idempotent: re-running is a no-op. Stale thresholds stay wide
-- (7d) while settlement feeds dominate; tighten once intraday is
-- the primary ticker.
-- ────────────────────────────────────────────────────────────────

begin;

insert into alert_rules (id, benchmark, type, params) values
  ('wti-above-100',     'WTI',   'level_cross',         '{"direction":"above","level":100}'::jsonb),
  ('wti-below-50',      'WTI',   'level_cross',         '{"direction":"below","level":50}'::jsonb),
  ('wti-daily-5pct',    'WTI',   'pct_move',            '{"basis":"daily_close","windowDays":1,"thresholdPct":5}'::jsonb),
  ('wti-stale-7d',      'WTI',   'stale_benchmark',     '{"maxAgeHours":168}'::jsonb),
  ('wti-src-disagree',  'WTI',   'source_disagreement', '{}'::jsonb),
  ('brent-above-100',   'BRENT', 'level_cross',         '{"direction":"above","level":100}'::jsonb),
  ('brent-below-50',    'BRENT', 'level_cross',         '{"direction":"below","level":50}'::jsonb),
  ('brent-daily-5pct',  'BRENT', 'pct_move',            '{"basis":"daily_close","windowDays":1,"thresholdPct":5}'::jsonb),
  ('brent-stale-7d',    'BRENT', 'stale_benchmark',     '{"maxAgeHours":168}'::jsonb),
  ('brent-src-disagree','BRENT','source_disagreement',  '{}'::jsonb)
on conflict (id) do nothing;

-- Latch rows so first evaluation has an armed state without a race.
insert into alert_state (rule_id, status)
  select id, 'armed' from alert_rules
on conflict (rule_id) do nothing;

commit;
