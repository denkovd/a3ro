-- ────────────────────────────────────────────────────────────────
-- Weekly newsletter v2 (roadmap #36 follow-on, #116).
--   newsletter_issues   + a Premium edition (subject/html/text) next to
--                         the free one, + the owner-approved editorial
--                         (big news, flips pattern, A3RO updates) that
--                         survives regenerating the data sections
--   newsletter_settings   small key → value store edited in Admin:
--                         consensus quadrants (Fed SEP, RBA SMP)
--   newsletter_red_flags  ongoing commodity disturbances listed under the
--                         commodity brief until resolved. 'auto' rows are
--                         written by the generator from tracker data,
--                         'manual' rows by the owner in Admin.
-- Safe to run again.
-- ────────────────────────────────────────────────────────────────

begin;

alter table newsletter_issues add column if not exists subject_premium text;
alter table newsletter_issues add column if not exists html_premium    text;
alter table newsletter_issues add column if not exists text_premium    text;
alter table newsletter_issues add column if not exists editorial       jsonb not null default '{}'::jsonb;

create table if not exists newsletter_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists newsletter_red_flags (
  id          bigint generated always as identity primary key,
  commodity   text not null,
  title       text not null,
  detail      text not null default '',
  source      text not null default 'manual' check (source in ('auto', 'manual')),
  auto_key    text unique,
  since       date not null default current_date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  updated_by  text
);

-- Consensus quadrants, as read from the latest official forecasts.
-- Update after each Fed SEP (Mar/Jun/Sep/Dec) and RBA SMP (Feb/May/Aug/Nov).
insert into newsletter_settings (key, value, updated_by) values
  ('us_consensus', '{"quadrant":"GOLDILOCKS","source":"Fed Summary of Economic Projections","asOf":"2026-09-16","note":"Median real GDP 2.3% in 2026 rising to 2.4% in 2027; PCE inflation 3.7% falling to 2.3%."}', 'seed'),
  ('au_consensus', '{"quadrant":"INFLATION","source":"RBA Statement on Monetary Policy","asOf":"2026-11-03","note":"GDP growth below potential; inflation outlook revised materially higher, back to target by mid-2028."}', 'seed')
on conflict (key) do nothing;

-- Ongoing disturbances already tracked on the Commodity Watch pages.
insert into newsletter_red_flags (commodity, title, detail, source, auto_key, since, updated_by) values
  ('Oil & LNG', 'Strait of Hormuz shipping restricted', 'Closed or heavily restricted since 28 Feb 2026; about a fifth of world LNG supply (Qatar, UAE) cut off and Ras Laffan damaged.', 'manual', 'seed:hormuz', '2026-02-28', 'seed'),
  ('Copper', 'Grasberg not at full capacity', 'Block Cave stopped after the 8 Sep 2025 mud rush; Freeport expects full capacity in early 2028.', 'manual', 'seed:grasberg', '2025-09-08', 'seed')
on conflict (auto_key) do nothing;

revoke all privileges on table newsletter_settings, newsletter_red_flags from anon, authenticated, public;
alter table newsletter_settings enable row level security;
alter table newsletter_red_flags enable row level security;

commit;
