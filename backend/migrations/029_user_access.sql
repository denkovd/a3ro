-- ────────────────────────────────────────────────────────────────
-- Premium access per account.
--   Anyone can create an account (Supabase Auth). An account opens
--   nothing beyond the public modules until it has Premium.
--   premium        true = Premium modules open for this account
--   source         who granted it: 'admin' (the /owner/users checkbox)
--                  today, 'stripe' once payments exist (#27)
--   premium_since  when Premium was last switched on
--   updated_by     email of the admin who made the last change
-- Admin emails (OWNER_EMAILS) always have Premium, whatever this says.
--
-- Also renames module_settings levels: 'owner' / 'subscriber' → 'premium'.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists user_access (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  premium       boolean not null default false,
  source        text not null default 'admin' check (source in ('admin', 'stripe')),
  premium_since timestamptz,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

-- Server-side connection only; never exposed through the public Data API,
-- so nobody can grant themselves Premium from the browser.
revoke all privileges on table user_access from anon, authenticated, public;
alter table user_access enable row level security;

alter table module_settings drop constraint if exists module_settings_level_check;
update module_settings set level = 'premium' where level in ('owner', 'subscriber');
alter table module_settings add constraint module_settings_level_check check (level in ('public', 'premium'));

commit;
