-- ────────────────────────────────────────────────────────────────
-- Account settings (roadmap #105).
--   user_profiles  one row per account: display name, interests
--                  (ids from lib/interests.ts), newsletter choice
--                  (null = never chosen; then the leads list decides)
--   user_feedback  reviews and requests sent from /account
-- Server connection only, like user_access: RLS on, no policies, no
-- grants to the browser roles. Rows go when the account is deleted.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists user_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 80),
  interests     text[] not null default '{}',
  newsletter    boolean,
  newsletter_changed_at timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists user_feedback (
  id          bigserial primary key,
  user_id     uuid references auth.users (id) on delete cascade,
  email       text,
  kind        text not null check (kind in ('review', 'request', 'problem', 'other')),
  rating      smallint check (rating between 1 and 5),
  message     text not null check (char_length(message) between 1 and 4000),
  page        text,
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
create index if not exists user_feedback_created_idx on user_feedback (created_at desc);

revoke all privileges on table user_profiles, user_feedback from anon, authenticated, public;
revoke all privileges on sequence user_feedback_id_seq from anon, authenticated, public;
alter table user_profiles enable row level security;
alter table user_feedback enable row level security;

commit;
