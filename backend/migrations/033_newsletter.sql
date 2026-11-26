-- ────────────────────────────────────────────────────────────────
-- Weekly newsletter on Resend (roadmap #36).
--   newsletter_issues        one issue per Monday: generated as a draft
--                            in Admin → Newsletter, approved by hand, sent
--                            by the Monday 6pm (Sydney) cron
--   newsletter_sends         one row per recipient per issue, written as
--                            each batch goes out, so a retried send never
--                            emails anyone twice
--   newsletter_unsubscribes  emails that clicked unsubscribe; never sent
--                            to again until they sign up again
-- Subscribers are the newsletter sign-ups in `leads`, minus these
-- unsubscribes and accounts that switched the newsletter off.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists newsletter_issues (
  id           bigint generated always as identity primary key,
  issue_date   date not null unique,
  subject      text not null,
  html         text not null,
  text_body    text not null,
  data         jsonb not null default '{}'::jsonb,
  status       text not null default 'draft' check (status in ('draft', 'approved', 'sending', 'sent')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  text,
  sent_at      timestamptz,
  sent_count   int not null default 0,
  failed_count int not null default 0,
  last_error   text
);

create table if not exists newsletter_sends (
  issue_id   bigint not null references newsletter_issues (id) on delete cascade,
  email      text not null,
  resend_id  text,
  error      text,
  sent_at    timestamptz not null default now(),
  primary key (issue_id, email)
);

create table if not exists newsletter_unsubscribes (
  email           text primary key,
  unsubscribed_at timestamptz not null default now(),
  source          text not null default 'link'
);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table newsletter_issues, newsletter_sends, newsletter_unsubscribes from anon, authenticated, public;
alter table newsletter_issues enable row level security;
alter table newsletter_sends enable row level security;
alter table newsletter_unsubscribes enable row level security;

commit;
