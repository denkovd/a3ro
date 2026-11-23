-- ────────────────────────────────────────────────────────────────
-- Anonymous site interaction events (roadmap #46). One row per event:
-- page views, outbound clicks by destination, searches (including
-- no-result searches), asset opens, sign-ups by page. Deliberately no
-- user id, email, IP address or user agent.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists site_events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  type         text not null check (type in ('page_view', 'outbound', 'search', 'asset_view', 'signup', 'watch')),
  path         text not null,
  target       text,
  result_count int
);
create index if not exists site_events_occurred_desc on site_events (occurred_at desc);
create index if not exists site_events_type_occurred on site_events (type, occurred_at desc);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table site_events from anon, authenticated, public;
alter table site_events enable row level security;

commit;
