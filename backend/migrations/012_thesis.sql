-- ────────────────────────────────────────────────────────────────
-- Thesis Lab schema (Postgres 14+) — additive to 011_tape.sql.
--
-- P·07 Thesis Lab: pressure-test a trading thesis, generate scenarios,
-- audit the live book against both. Two tables:
--
--  * theses — one row per saved thesis. `analysis` holds the FULL
--    ThesisAnalysis + ScenarioSet snapshot (jsonb) as computed at save
--    time, stamped with engine_version so a future engine can re-score
--    old rows without ambiguity. The text (title/body) is the source
--    of truth; the analysis is derived state — rebuildable by POSTing
--    the body back through /api/thesis/analyze.
--
--  * portfolio_positions — the trader's actual book, entered by hand
--    (no broker integration yet — deliberate; see DECISIONS.md).
--    Marks come from live stores at read time (latest_quotes for
--    WTI/BRENT, bull_snapshots.last_close for the ~650-symbol bull
--    universe); manual_mark is the labeled fallback ONLY when no live
--    mark exists. quantity is in units (bbl, shares, coins); exposure
--    = quantity × mark, so no contract-multiplier magic hides here.
--
-- Mirrors the other snapshot tables' conventions: idempotent DDL,
-- explicit checks, newest-first read indexes.
-- ────────────────────────────────────────────────────────────────

begin;

create table if not exists theses (
  id             bigint generated always as identity primary key,
  title          text not null,
  body           text not null,
  direction      text check (direction in ('long','short','neutral')),
  instrument     text,                    -- primary symbol/benchmark ("WTI", "BRENT", bull-universe symbol)
  horizon_days   int check (horizon_days > 0),
  analysis       jsonb not null,          -- ThesisAnalysis + ScenarioSet at save time
  engine_version int not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists theses_created_desc on theses (created_at desc);

create table if not exists portfolio_positions (
  id            bigint generated always as identity primary key,
  symbol        text not null,            -- "WTI", "BRENT", or a bull-universe symbol ("AAPL", "BTC-USD", "GC=F", …)
  display_name  text,
  side          text not null check (side in ('long','short')),
  quantity      double precision not null check (quantity > 0),
  entry_price   double precision not null check (entry_price >= 0),
  manual_mark   double precision check (manual_mark >= 0),  -- labeled fallback when no live mark exists
  thesis_id     bigint references theses(id) on delete set null,
  notes         text,
  opened_at     date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists portfolio_positions_created_desc on portfolio_positions (created_at desc);

commit;
