-- ────────────────────────────────────────────────────────────────
-- Earnings-Beat Tracker schema — additive to 012.
--
-- watchlist: tickers the user tracks. Ticker is the FK target for
--   earnings_surprises, so it carries the unique constraint that
--   makes that FK possible.
--
-- earnings_surprises: one row per ticker per fiscal quarter, immutable
--   once pulled (ON CONFLICT DO NOTHING — see pipeline.ts). Natural
--   key is (ticker, fiscal_year, fiscal_quarter), NOT (ticker,
--   fiscal_date_ending) — see architecture spec §0/§1: the free
--   /calendar/earnings endpoint never returns a fiscal-period-end
--   date, and a UNIQUE constraint over a nullable column would not
--   dedup (Postgres treats every NULL as distinct), so keying off a
--   frequently-null column would silently admit duplicate pulls.
--
-- DEVIATION FROM SPEC DEFAULT (explicitly requested, and called out
-- in the spec itself as the alternative to flip to): the FK below
-- uses `on delete restrict`, not `on delete cascade`. The spec's
-- primary recommendation is `cascade` with the workaround of setting
-- `is_active = false` to retain history; this migration instead
-- makes hard-deleting a watchlist row with cached earnings an error,
-- so the immutable earnings history can never be silently dropped by
-- a watchlist delete. `is_active = false` remains the intended way
-- to "remove" a ticker (see edge case §5 "Ticker removed from
-- watchlist").
-- ────────────────────────────────────────────────────────────────

begin;

-- ========================================================================
-- watchlist : tickers the user tracks
-- ========================================================================
create table public.watchlist (
  id            bigint generated always as identity primary key,
  ticker        text        not null,
  company_name  text,
  is_active     boolean     not null default true,
  added_at      timestamptz not null default now(),
  constraint watchlist_ticker_key unique (ticker)     -- FK target + dedup
);

-- Partial index: the pipeline and API only ever scan active tickers.
create index watchlist_active_idx
  on public.watchlist (ticker)
  where is_active;

-- ========================================================================
-- earnings_surprises : one row per ticker per fiscal quarter (immutable once pulled)
-- ========================================================================
create table public.earnings_surprises (
  id                        bigint generated always as identity primary key,
  ticker                    text     not null
                              references public.watchlist (ticker)
                              on update cascade on delete restrict,
  fiscal_year               smallint not null,
  fiscal_quarter            smallint not null check (fiscal_quarter between 1 and 4),
  fiscal_date_ending        date,                 -- from /stock/earnings.period; nullable
  report_date               date     not null,    -- calendar "date" (announcement date)
  report_hour               text     check (report_hour in ('bmo','amc','dmh')),
  reported_eps              numeric,
  estimated_eps            numeric,
  eps_surprise_percent     numeric,
  reported_revenue         numeric(20,2),
  estimated_revenue        numeric(20,2),
  revenue_surprise_percent numeric,
  source                   text        not null default 'finnhub',
  pulled_at                timestamptz not null default now(),

  -- Prevents duplicate pulls. (year, quarter) is supplied by BOTH endpoints and
  -- is never null, so it reliably enforces "one row per ticker per quarter".
  constraint earnings_surprises_period_key
    unique (ticker, fiscal_year, fiscal_quarter)
);

-- Compute layer reads the newest N quarters per ticker — index to match.
create index earnings_surprises_ticker_period_idx
  on public.earnings_surprises (ticker, fiscal_year desc, fiscal_quarter desc);

-- Supabase: enable RLS; the pipeline writes with the service-role key (bypasses RLS),
-- the dashboard reads via policies (add per your auth model).
alter table public.watchlist          enable row level security;
alter table public.earnings_surprises enable row level security;

commit;
