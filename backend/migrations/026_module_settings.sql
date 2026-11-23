-- ────────────────────────────────────────────────────────────────
-- Owner settings per module (roadmap #52 / #53).
--   level       overrides the access level in lib/access.ts without a
--               redeploy (null = use the code default). Market-data
--               modules can never be set public (enforced in the app).
--   fit_rating  the owner's 1-5 strategic fit score for the scorecard.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists module_settings (
  module_id  text primary key,
  level      text check (level in ('public', 'owner', 'subscriber')),
  fit_rating int check (fit_rating between 1 and 5),
  updated_at timestamptz not null default now()
);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table module_settings from anon, authenticated, public;
alter table module_settings enable row level security;

commit;
