-- ────────────────────────────────────────────────────────────────
-- Oil Tracker backend — initial schema (Postgres 14+)
--
-- WHY POSTGRES (not SQLite, not Timescale):
--  * SQLite: fine for the data volume, but this runs as serverless
--    cron + API handlers on Vercel — multiple short-lived processes
--    need a shared, concurrent store. SQLite has no good story
--    there, and migrating to PG later costs more than starting on a
--    free managed PG (Neon / Supabase / Vercel Postgres) today.
--  * Timescale: 2 benchmarks × ~4 sources × 1 settlement row/day
--    ≈ 3k rows/yr; even minute-level live quotes ≈ 500k/yr. Plain
--    btree indexes handle that with zero ops overhead. Revisit only
--    past ~10M rows or sub-minute multi-instrument ingestion —
--    price_observations is append-only, so converting it to a
--    hypertable later is a migration, not a redesign.
--
-- Design notes:
--  * price_observations is the append-only audit log: every record
--    every source ever gave us, normalized to USD/bbl. Never UPDATE.
--  * daily_prices + latest_quotes are RESOLVED outputs (what the
--    frontend reads). They are derived state — rebuildable from
--    observations at any time.
--  * numeric(12,4), not float: exact money math.
--  * prices may be negative (WTI, 2020-04-20: −$37.63). No CHECK > 0.
-- ────────────────────────────────────────────────────────────────

begin;

-- ── source catalog (mirrors SourceDescriptor; config wins at runtime) ──
create table if not exists sources (
  id           text primary key,           -- 'eia', 'fred', …
  name         text not null,
  priority     int  not null,              -- 1 = most trusted
  confidence   text not null check (confidence in ('official','exchange','aggregator','unofficial')),
  role         text not null check (role in ('backbone','supplement','reserve')),
  enabled      boolean not null default true,
  config       jsonb not null default '{}'::jsonb,  -- overrides (rate limits, etc.)
  created_at   timestamptz not null default now()
);

-- ── append-only observation log ──
create table if not exists price_observations (
  id           bigint generated always as identity primary key,
  source_id    text not null references sources(id),
  benchmark    text not null check (benchmark in ('WTI','BRENT')),
  kind         text not null check (kind in ('live','delayed','settlement','historical')),
  price        numeric(12,4) not null,     -- USD per barrel, normalized
  raw_price    numeric(14,6) not null,     -- as delivered by the source
  raw_unit     text not null,
  raw_currency text not null,
  observed_at  timestamptz not null,       -- when true in the market
  period_date  date,                       -- market day, settlement/historical only
  fetched_at   timestamptz not null default now(),
  meta         jsonb,
  -- idempotent ingestion: re-fetching the same point is a no-op
  constraint uq_observation unique (source_id, benchmark, kind, observed_at)
);

create index if not exists idx_obs_lookup
  on price_observations (benchmark, kind, observed_at desc);
create index if not exists idx_obs_period
  on price_observations (benchmark, period_date desc)
  where period_date is not null;

-- ── resolved: canonical daily series (chart feed) ──
create table if not exists daily_prices (
  benchmark    text not null check (benchmark in ('WTI','BRENT')),
  period_date  date not null,
  price        numeric(12,4) not null,
  source_id    text not null references sources(id),
  disagreement boolean not null default false,  -- comparable sources diverged > tolerance
  spread_pct   numeric(8,5),                    -- max relative spread across sources
  updated_at   timestamptz not null default now(),
  primary key (benchmark, period_date)
);

-- ── resolved: freshest usable quote per benchmark (ticker feed) ──
create table if not exists latest_quotes (
  benchmark    text primary key check (benchmark in ('WTI','BRENT')),
  price        numeric(12,4) not null,
  kind         text not null,
  source_id    text not null references sources(id),
  observed_at  timestamptz not null,
  staleness    text not null check (staleness in ('fresh','aging','stale','dead')),
  suspect      boolean not null default false,  -- failed live-vs-settlement sanity check
  updated_at   timestamptz not null default now()
);

-- ── per-source operational state (rate gate + circuit breaker) ──
-- DB-backed because serverless invocations share no memory.
create table if not exists source_health (
  source_id            text primary key references sources(id),
  last_success_at      timestamptz,
  last_error_at        timestamptz,
  last_error_kind      text,
  last_error_message   text,
  consecutive_failures int not null default 0,
  next_allowed_at      timestamptz,   -- rate gate: no calls before this
  cooldown_until       timestamptz,   -- circuit breaker: open until this
  disabled             boolean not null default false,  -- auth failures; manual re-enable
  updated_at           timestamptz not null default now()
);

-- ── alerting (rules + state + fired events; delivery is out of scope) ──
create table if not exists alert_rules (
  id         text primary key,             -- human-readable slug
  benchmark  text not null check (benchmark in ('WTI','BRENT')),
  type       text not null check (type in ('level_cross','pct_move','stale_benchmark','source_disagreement')),
  params     jsonb not null,               -- see alerts/rules.ts for shapes
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

-- one state row per rule: armed/fired latch drives hysteresis + dedup
create table if not exists alert_state (
  rule_id       text primary key references alert_rules(id) on delete cascade,
  status        text not null default 'armed' check (status in ('armed','fired')),
  last_fired_at timestamptz,
  last_value    numeric(12,4),
  updated_at    timestamptz not null default now()
);

-- append-only log of fired alerts; a delivery worker consumes rows
-- where delivered_at is null (delivery mechanism deferred)
create table if not exists alert_events (
  id           bigint generated always as identity primary key,
  rule_id      text not null references alert_rules(id) on delete cascade,
  fired_at     timestamptz not null default now(),
  payload      jsonb not null,             -- value, threshold, source, staleness…
  delivered_at timestamptz
);

create index if not exists idx_alert_events_undelivered
  on alert_events (fired_at) where delivered_at is null;

-- ── seed the source catalog ──
insert into sources (id, name, priority, confidence, role) values
  ('eia',          'U.S. Energy Information Administration', 1, 'official',   'backbone'),
  ('fred',         'FRED (St. Louis Fed)',                   2, 'official',   'backbone'),
  ('yfinance',     'Yahoo Finance futures (unofficial)',     3, 'unofficial', 'supplement'),
  ('alphavantage', 'Alpha Vantage commodities',              4, 'aggregator', 'reserve')
on conflict (id) do nothing;

insert into source_health (source_id)
  select id from sources
on conflict (source_id) do nothing;

commit;
