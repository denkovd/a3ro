-- ────────────────────────────────────────────────────────────────
-- World Bank monthly commodity prices (roadmap #126). One row per
-- series, written by .github/workflows/pink-sheet.yml. The job also
-- creates this table if it is missing, so running this by hand is
-- optional.
-- ────────────────────────────────────────────────────────────────
begin;

create table if not exists commodity_monthly (
  series      text primary key,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table commodity_monthly from anon, authenticated, public;
alter table commodity_monthly enable row level security;

commit;
