-- ────────────────────────────────────────────────────────────────
-- Public track record (roadmap #11). One row each time a signal
-- changes state, written on the day it changes, so a call is on
-- record before anyone knows how it turned out.
--   signal          which signal: 'au-pulse', 'us-macro-quadrant',
--                   'macro-weather' to start (open data only)
--   fired_on        UTC date the new state was first seen
--   state           machine-readable state, e.g. 'up/down', 'GOLDILOCKS'
--   previous_state  the state it replaced (null for the first row)
--   label           the wording shown on the site at the time
--   detail          the inputs behind it (shares, scores, coverage)
--   outcomes        filled in later by scoring at 1, 3 and 6 months,
--                   e.g. {"1m": {"hit": true, ...}}; empty until then
-- Append-only by design: rows are never edited except to add outcomes.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists signal_log (
  id             bigint generated always as identity primary key,
  signal         text not null,
  fired_on       date not null,
  state          text not null,
  previous_state text,
  label          text not null,
  detail         jsonb not null default '{}'::jsonb,
  outcomes       jsonb not null default '{}'::jsonb,
  logged_at      timestamptz not null default now(),
  unique (signal, fired_on)
);
create index if not exists signal_log_signal_fired_desc on signal_log (signal, fired_on desc);

-- Server-side connection only; never exposed through the public Data API.
revoke all privileges on table signal_log from anon, authenticated, public;
alter table signal_log enable row level security;

commit;
