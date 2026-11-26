begin;

-- Execute module (P·Execute): BTC Event Pivots v1.1. See docs/execute-module-plan.md.
-- Written only by the GitHub Action (execute-engine/, DATABASE_URL). Read only by server API
-- routes: /api/execute-peek (next pivot, public) and /api/execute (Premium, gated in middleware).
-- Like every other A3RO table, nothing is granted to anon/authenticated — RLS on, no policies.

create table if not exists public.execute_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('FOMC', 'CPI')),
  event_time timestamptz not null unique,
  source text check (source in ('fed', 'bls')),
  notes text
);

create table if not exists public.execute_signals (          -- one row per event per snapshot
  id bigint generated always as identity primary key,
  event_id bigint not null references public.execute_events(id) on delete cascade,
  snapshot_at timestamptz not null,
  as_of_bar timestamptz not null,                             -- 1H bar the values were read at
  arm_time timestamptz not null,
  state text not null check (state in ('preview', 'armed')),  -- armed = values frozen at the arm bar
  btc_price numeric,
  move_7d_pct numeric,
  z numeric,
  z_threshold numeric not null default 0.75,
  lean text not null check (lean in ('short', 'long', 'none')),
  checklist jsonb,                                            -- q1..q5 + month confluence (info only in v1.1)
  strategy_version text not null default 'v1.1'
);

create index if not exists execute_signals_latest on public.execute_signals (event_id, snapshot_at desc);

create table if not exists public.execute_trades (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('backtest', 'paper', 'live')),
  strategy_version text not null,
  event_id bigint references public.execute_events(id),
  event_kind text not null,
  event_time timestamptz not null,
  armed_at timestamptz not null,
  side text not null check (side in ('short', 'long')),
  risk_pct numeric,
  z numeric,
  move_7d_pct numeric,
  levels jsonb,                                               -- e1/e2/e3/stop/tp1/stop_dist_pct
  checklist jsonb,
  entries jsonb not null default '[]',                        -- [{tag, price, qty, time}]
  exits jsonb not null default '[]',
  stop numeric,
  pnl_pct numeric,                                            -- % of equity at arm
  pnl_usd numeric,                                            -- on a $100k starting account
  status text not null check (status in ('pending', 'open', 'closed', 'skipped')),
  skip_reason text,
  opened_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (mode, strategy_version, event_id)
);

create index if not exists execute_trades_record on public.execute_trades (mode, strategy_version, event_time desc);

-- The forward record is append-only once a trade finishes: the engine's upsert skips closed/skipped
-- rows, and this trigger enforces it for any other writer too.
create or replace function public.execute_trades_freeze() returns trigger language plpgsql as $$
begin
  if old.mode <> 'backtest' and old.status in ('closed', 'skipped') then
    raise exception 'execute_trades %: finished % trades are frozen', old.id, old.mode;
  end if;
  return new;
end $$;

drop trigger if exists execute_trades_freeze on public.execute_trades;
create trigger execute_trades_freeze before update on public.execute_trades
  for each row execute function public.execute_trades_freeze();

create table if not exists public.execute_stats (
  mode text not null,
  strategy_version text not null,
  as_of timestamptz not null,
  trades int not null,
  net_pct numeric,
  profit_factor numeric,
  win_rate numeric,
  max_dd_pct numeric,                                         -- $ drawdown / starting capital
  by_year jsonb,
  equity jsonb,                                               -- [{t, pct}] after each closed trade
  primary key (mode, strategy_version)
);

create table if not exists public.execute_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  mode text not null,
  ok boolean not null,
  meta jsonb
);

create index if not exists execute_runs_latest on public.execute_runs (ran_at desc);

do $$
declare t text;
begin
  foreach t in array array['execute_events', 'execute_signals', 'execute_trades', 'execute_stats', 'execute_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all privileges on table public.%I from anon, authenticated, public', t);
  end loop;
end $$;

-- Calendar (2022 for the backtest, 2023+ from the Pine v1.1 script). Update each January and when
-- the Fed/BLS revise dates. Times are UTC for 2:00pm (FOMC) / 8:30am (CPI) New York.
insert into public.execute_events (kind, event_time, source, notes) values
  ('CPI', '2022-01-12T13:30:00+00:00', 'bls', null),
  ('FOMC', '2022-01-26T19:00:00+00:00', 'fed', null),
  ('CPI', '2022-02-10T13:30:00+00:00', 'bls', null),
  ('CPI', '2022-03-10T13:30:00+00:00', 'bls', null),
  ('FOMC', '2022-03-16T18:00:00+00:00', 'fed', null),
  ('CPI', '2022-04-12T12:30:00+00:00', 'bls', null),
  ('FOMC', '2022-05-04T18:00:00+00:00', 'fed', null),
  ('CPI', '2022-05-11T12:30:00+00:00', 'bls', null),
  ('CPI', '2022-06-10T12:30:00+00:00', 'bls', null),
  ('FOMC', '2022-06-15T18:00:00+00:00', 'fed', null),
  ('CPI', '2022-07-13T12:30:00+00:00', 'bls', null),
  ('FOMC', '2022-07-27T18:00:00+00:00', 'fed', null),
  ('CPI', '2022-08-10T12:30:00+00:00', 'bls', null),
  ('CPI', '2022-09-13T12:30:00+00:00', 'bls', null),
  ('FOMC', '2022-09-21T18:00:00+00:00', 'fed', null),
  ('CPI', '2022-10-13T12:30:00+00:00', 'bls', null),
  ('FOMC', '2022-11-02T18:00:00+00:00', 'fed', null),
  ('CPI', '2022-11-10T13:30:00+00:00', 'bls', null),
  ('CPI', '2022-12-13T13:30:00+00:00', 'bls', null),
  ('FOMC', '2022-12-14T19:00:00+00:00', 'fed', null),
  ('CPI', '2023-01-12T13:30:00+00:00', 'bls', null),
  ('FOMC', '2023-02-01T19:00:00+00:00', 'fed', null),
  ('CPI', '2023-02-14T13:30:00+00:00', 'bls', null),
  ('CPI', '2023-03-14T12:30:00+00:00', 'bls', null),
  ('FOMC', '2023-03-22T18:00:00+00:00', 'fed', null),
  ('CPI', '2023-04-12T12:30:00+00:00', 'bls', null),
  ('FOMC', '2023-05-03T18:00:00+00:00', 'fed', null),
  ('CPI', '2023-05-10T12:30:00+00:00', 'bls', null),
  ('CPI', '2023-06-13T12:30:00+00:00', 'bls', null),
  ('FOMC', '2023-06-14T18:00:00+00:00', 'fed', null),
  ('CPI', '2023-07-12T12:30:00+00:00', 'bls', null),
  ('FOMC', '2023-07-26T18:00:00+00:00', 'fed', null),
  ('CPI', '2023-08-10T12:30:00+00:00', 'bls', null),
  ('CPI', '2023-09-13T12:30:00+00:00', 'bls', null),
  ('FOMC', '2023-09-20T18:00:00+00:00', 'fed', null),
  ('CPI', '2023-10-12T12:30:00+00:00', 'bls', null),
  ('FOMC', '2023-11-01T18:00:00+00:00', 'fed', null),
  ('CPI', '2023-11-14T13:30:00+00:00', 'bls', null),
  ('CPI', '2023-12-12T13:30:00+00:00', 'bls', null),
  ('FOMC', '2023-12-13T19:00:00+00:00', 'fed', null),
  ('CPI', '2024-01-11T13:30:00+00:00', 'bls', null),
  ('FOMC', '2024-01-31T19:00:00+00:00', 'fed', null),
  ('CPI', '2024-02-13T13:30:00+00:00', 'bls', null),
  ('CPI', '2024-03-12T12:30:00+00:00', 'bls', null),
  ('FOMC', '2024-03-20T18:00:00+00:00', 'fed', null),
  ('CPI', '2024-04-10T12:30:00+00:00', 'bls', null),
  ('FOMC', '2024-05-01T18:00:00+00:00', 'fed', null),
  ('CPI', '2024-05-15T12:30:00+00:00', 'bls', null),
  ('CPI', '2024-06-12T12:30:00+00:00', 'bls', null),
  ('FOMC', '2024-06-12T18:00:00+00:00', 'fed', null),
  ('CPI', '2024-07-11T12:30:00+00:00', 'bls', null),
  ('FOMC', '2024-07-31T18:00:00+00:00', 'fed', null),
  ('CPI', '2024-08-14T12:30:00+00:00', 'bls', null),
  ('CPI', '2024-09-11T12:30:00+00:00', 'bls', null),
  ('FOMC', '2024-09-18T18:00:00+00:00', 'fed', null),
  ('CPI', '2024-10-10T12:30:00+00:00', 'bls', null),
  ('FOMC', '2024-11-07T19:00:00+00:00', 'fed', null),
  ('CPI', '2024-11-13T13:30:00+00:00', 'bls', null),
  ('CPI', '2024-12-11T13:30:00+00:00', 'bls', null),
  ('FOMC', '2024-12-18T19:00:00+00:00', 'fed', null),
  ('CPI', '2025-01-15T13:30:00+00:00', 'bls', null),
  ('FOMC', '2025-01-29T19:00:00+00:00', 'fed', null),
  ('CPI', '2025-02-12T13:30:00+00:00', 'bls', null),
  ('CPI', '2025-03-12T12:30:00+00:00', 'bls', null),
  ('FOMC', '2025-03-19T18:00:00+00:00', 'fed', null),
  ('CPI', '2025-04-10T12:30:00+00:00', 'bls', null),
  ('FOMC', '2025-05-07T18:00:00+00:00', 'fed', null),
  ('CPI', '2025-05-13T12:30:00+00:00', 'bls', null),
  ('CPI', '2025-06-11T12:30:00+00:00', 'bls', null),
  ('FOMC', '2025-06-18T18:00:00+00:00', 'fed', null),
  ('CPI', '2025-07-15T12:30:00+00:00', 'bls', null),
  ('FOMC', '2025-07-30T18:00:00+00:00', 'fed', null),
  ('CPI', '2025-08-12T12:30:00+00:00', 'bls', null),
  ('CPI', '2025-09-11T12:30:00+00:00', 'bls', null),
  ('FOMC', '2025-09-17T18:00:00+00:00', 'fed', null),
  ('CPI', '2025-10-24T12:30:00+00:00', 'bls', null),
  ('FOMC', '2025-10-29T18:00:00+00:00', 'fed', null),
  ('FOMC', '2025-12-10T19:00:00+00:00', 'fed', null),
  ('CPI', '2025-12-18T13:30:00+00:00', 'bls', null),
  ('CPI', '2026-01-13T13:30:00+00:00', 'bls', null),
  ('FOMC', '2026-01-28T19:00:00+00:00', 'fed', null),
  ('CPI', '2026-02-13T13:30:00+00:00', 'bls', null),
  ('CPI', '2026-03-11T12:30:00+00:00', 'bls', null),
  ('FOMC', '2026-03-18T18:00:00+00:00', 'fed', null),
  ('CPI', '2026-04-10T12:30:00+00:00', 'bls', null),
  ('FOMC', '2026-04-29T18:00:00+00:00', 'fed', null),
  ('CPI', '2026-05-12T12:30:00+00:00', 'bls', null),
  ('CPI', '2026-06-10T12:30:00+00:00', 'bls', null),
  ('FOMC', '2026-06-17T18:00:00+00:00', 'fed', null),
  ('CPI', '2026-07-14T12:30:00+00:00', 'bls', null),
  ('FOMC', '2026-07-29T18:00:00+00:00', 'fed', null),
  ('CPI', '2026-08-12T12:30:00+00:00', 'bls', null),
  ('CPI', '2026-09-11T12:30:00+00:00', 'bls', null),
  ('FOMC', '2026-09-16T18:00:00+00:00', 'fed', null),
  ('CPI', '2026-10-14T12:30:00+00:00', 'bls', null),
  ('FOMC', '2026-10-28T18:00:00+00:00', 'fed', null),
  ('CPI', '2026-11-10T13:30:00+00:00', 'bls', null),
  ('FOMC', '2026-12-09T19:00:00+00:00', 'fed', null),
  ('CPI', '2026-12-10T13:30:00+00:00', 'bls', null),
  ('CPI', '2027-01-13T13:30:00+00:00', 'bls', null),
  ('FOMC', '2027-01-27T19:00:00+00:00', 'fed', null),
  ('CPI', '2027-02-11T13:30:00+00:00', 'bls', null),
  ('CPI', '2027-03-10T13:30:00+00:00', 'bls', null),
  ('FOMC', '2027-03-17T18:00:00+00:00', 'fed', null),
  ('CPI', '2027-04-13T12:30:00+00:00', 'bls', null),
  ('FOMC', '2027-04-28T18:00:00+00:00', 'fed', null),
  ('CPI', '2027-05-12T12:30:00+00:00', 'bls', null),
  ('FOMC', '2027-06-09T18:00:00+00:00', 'fed', null),
  ('CPI', '2027-06-10T12:30:00+00:00', 'bls', null),
  ('CPI', '2027-07-14T12:30:00+00:00', 'bls', null),
  ('FOMC', '2027-07-28T18:00:00+00:00', 'fed', null),
  ('CPI', '2027-08-11T12:30:00+00:00', 'bls', null),
  ('CPI', '2027-09-14T12:30:00+00:00', 'bls', null),
  ('FOMC', '2027-09-15T18:00:00+00:00', 'fed', null),
  ('CPI', '2027-10-14T12:30:00+00:00', 'bls', null),
  ('CPI', '2027-11-10T13:30:00+00:00', 'bls', null),
  ('FOMC', '2027-11-17T19:00:00+00:00', 'fed', null),
  ('CPI', '2027-12-10T13:30:00+00:00', 'bls', null)
on conflict (event_time) do nothing;

commit;
