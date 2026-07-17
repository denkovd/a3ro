# Earnings-Beat Leaderboard — Module Spec (v2)

**Product goal:** a leaderboard that ranks watchlist companies by the size, consistency, and recency of their earnings beats. Top of the board = companies that keep beating estimates, beat big, and beat *recently*. Every number on the board traces to a real Finnhub field or a deterministic formula defined in this doc — **no synthetic, sample, or placeholder data is ever written to the database or rendered as real** (see §8, Data-integrity guarantees).

Stack: TypeScript (`backend/`) · Supabase (Postgres) · Finnhub free tier (60 req/min, no daily cap).
Cadence: data changes at most weekly (one pipeline run); reads are DB-only and cached.

> v2 supersedes v1. Changes: streak now walks all cached history (v1's §3.1 capped it at 4 quarters while the example showed a streak of 6 — contradiction fixed); `DO NOTHING` replaced with a fill-nulls-only upsert (late revenue no longer frozen); fixed 8-day window replaced with a watermark; pipeline error handling, cron placement/auth, RLS policies, and a test plan are now specified; three Finnhub behaviors are flagged for verification before build (§0.1).

---

## 0. API-reality note (read first)

The obvious endpoint, `/stock/earnings?symbol=X`, does **not** return revenue. On the free tier:

| Endpoint | Returns | Revenue? | Fiscal-period-end date? | EPS surprise % pre-computed? |
|---|---|---|---|---|
| `/calendar/earnings?from=&to=[&symbol=]` | `date`, `hour`, `year`, `quarter`, `epsActual`, `epsEstimate`, `revenueActual`, `revenueEstimate`, `symbol` | **Yes** | No (only `year`+`quarter`) | No (compute it) |
| `/stock/earnings?symbol=X` | `period`, `year`, `quarter`, `actual`, `estimate`, `surprise`, `surprisePercent`, `symbol` | **No (EPS only)** | **Yes** (`period` = fiscal end date) | Yes (EPS only) |

**Consequence:** `/calendar/earnings` is the **primary** source (only free endpoint carrying revenue). `/stock/earnings` is a **supplement** for `fiscal_date_ending` and the authoritative EPS surprise %. The schema's natural key is `(ticker, fiscal_year, fiscal_quarter)` — not `(ticker, fiscal_date_ending)` — because `fiscal_date_ending` is not reliably available and a `UNIQUE` over a nullable column does not dedup in Postgres (NULLs compare as distinct).

### 0.1 Verification results (resolved 2026-07-16 against the live API)

These were blocking pre-implementation tasks; all three now have recorded answers (probe transcript in `backend/docs/earnings-endpoint-verification.md`):

| # | Question | **Verified answer (2026-07-16)** | Consequence |
|---|---|---|---|
| **V1** | Free-tier history depth of `/calendar/earnings?symbol=X` | **FAILED — lookback is ~30 days.** A 3-month market-wide request returned rows from today−30d onward only; symbol-scoped requests for older windows return `{"earningsCalendar":[]}` (HTTP 200). | Historical backfill via calendar is impossible. Fallback is **active**: Flow B backfills EPS-only from `/stock/earnings` (last 4 quarters on free tier) — see §2.3. Backfilled quarters have no revenue and no announcement date (→ `report_date` is nullable). |
| **V2** | Do `(year, quarter)` labels agree between the two endpoints for offset-fiscal-year companies? | **PASSED.** Verified on real overlapping data: MU calendar `{date: 2026-06-24, 2026-Q3}` = stock `{period: 2026-06-30, 2026-Q3}`; NKE `2026-Q4` on both. Both endpoints use fiscal labeling. | Rows from either source collide correctly on `(ticker, fiscal_year, fiscal_quarter)`; the fill-nulls upsert merges them — no in-memory join needed at all. |
| **V3** | Actual value set of calendar `hour` | **PASSED** (`bmo`/`amc` observed in live market-wide data; `''` remains possible per docs). | `'' → NULL` normalization stands; CHECK constraint unchanged. |

Additional recorded fact: `/stock/earnings.period` is Finnhub-**normalized** calendar-quarter-end (MU reported 2026-06-24 but `period` = 2026-06-30), so `fiscal_date_ending` is approximate, not the exact fiscal close date.

---

## 1. Schema (SQL)

```sql
-- ========================================================================
-- watchlist : tickers the user tracks
-- ========================================================================
create table public.watchlist (
  id            bigint generated always as identity primary key,
  ticker        text        not null,
  company_name  text,
  is_active     boolean     not null default true,
  added_at      timestamptz not null default now(),
  constraint watchlist_ticker_key unique (ticker)
);

create index watchlist_active_idx
  on public.watchlist (ticker)
  where is_active;

-- ========================================================================
-- earnings_surprises : one row per ticker per fiscal quarter
-- Values never change once set; NULL columns may be filled by later runs.
-- ========================================================================
create table public.earnings_surprises (
  id                        bigint generated always as identity primary key,
  ticker                    text     not null
                              references public.watchlist (ticker)
                              on update cascade on delete restrict,
  fiscal_year               smallint not null,
  fiscal_quarter            smallint not null check (fiscal_quarter between 1 and 4),
  fiscal_date_ending        date,                 -- /stock/earnings.period; Finnhub-normalized quarter-end, approximate
  report_date               date,                 -- calendar "date" (announcement date); NULL for quarters
                                                  -- backfilled from /stock/earnings, which has no announcement
                                                  -- date — never faked from `period` (§0.1 V1)
  report_hour               text     check (report_hour in ('bmo','amc','dmh')),
  reported_eps              numeric,
  estimated_eps             numeric,
  eps_surprise_percent      numeric,
  reported_revenue          numeric(20,2),        -- absolute USD, exact
  estimated_revenue         numeric(20,2),
  revenue_surprise_percent  numeric,
  source                    text        not null default 'finnhub',
  raw                       jsonb,                -- verbatim source payload(s) for audit
  pulled_at                 timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- (year, quarter) is supplied by BOTH endpoints and never null →
  -- reliably enforces "one row per ticker per quarter".
  constraint earnings_surprises_period_key
    unique (ticker, fiscal_year, fiscal_quarter)
);

-- Ranking engine reads newest-first per ticker — index to match.
create index earnings_surprises_ticker_period_idx
  on public.earnings_surprises (ticker, fiscal_year desc, fiscal_quarter desc);

-- ========================================================================
-- pipeline_runs : one row per pipeline execution (watermark + observability)
-- ========================================================================
create table public.pipeline_runs (
  id             bigint generated always as identity primary key,
  flow           text        not null check (flow in ('weekly','backfill')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  window_from    date,
  window_to      date,
  rows_inserted  integer,
  rows_enriched  integer,                          -- null-fill updates (§2.1)
  tickers_failed text[]      not null default '{}',
  status         text        not null default 'running'
                   check (status in ('running','success','failed')),
  error          text
);

-- ========================================================================
-- RLS: pipeline writes with the service-role key (bypasses RLS);
-- the dashboard reads through these explicit policies.
-- ========================================================================
alter table public.watchlist          enable row level security;
alter table public.earnings_surprises enable row level security;
alter table public.pipeline_runs      enable row level security;

create policy watchlist_read on public.watchlist
  for select to anon, authenticated using (true);
create policy earnings_read on public.earnings_surprises
  for select to anon, authenticated using (true);
create policy runs_read on public.pipeline_runs
  for select to anon, authenticated using (true);   -- powers data_as_of (§4)
-- If the dashboard later requires login, drop `anon` from these three policies.
```

### Schema decisions

- **Natural key `(ticker, fiscal_year, fiscal_quarter)`** — present and non-null in both endpoints; delivers "no duplicate pulls" robustly (see §0 for why not `fiscal_date_ending`).
- **`on delete restrict`** (changed from v1's `cascade`): earnings rows cost API calls to rebuild and a re-add only re-backfills partial history, so hard-deleting a watchlist row must not silently destroy them. Deactivate with `is_active = false`; a deliberate hard delete removes earnings rows first, explicitly.
- **`raw jsonb`** stores the verbatim Finnhub payload(s) the row was built from. Nearly free at this row count; turns every future "why does this number look wrong" into a `SELECT` instead of API archaeology. It is also the audit proof that no value was fabricated.
- **`updated_at`** tracks null-fill enrichment (§2.1). `pulled_at` = first insert, immutable.
- **Surprise-percent columns are stored** so the read path stays a pure sort: Finnhub's own EPS `surprisePercent` is persisted verbatim when available; revenue % is derived once at write time by `safePct` (§2.1).
- **`report_hour`**: `bmo` = before market open, `amc` = after close, `dmh` = during market hours. The pipeline normalizes empty string → `NULL` before insert (V3).

---

## 2. Pipeline

Two flows share one write routine. Both are idempotent: re-running any number of times converges to the same state.

**Where it runs:** GitHub Actions scheduled workflow (`.github/workflows/`) — *not* a Vercel cron. Reason: Flow B paces requests at ~1.1 s to respect 60 req/min, so backfilling even 30 tickers exceeds serverless function timeouts; Actions has no such pressure and its cron is free. The workflow runs a script in `backend/scripts/` that talks to Supabase with the service-role key from repository secrets. If any HTTP trigger route is ever added, it must require a `CRON_SECRET` bearer header.

**Timezone:** all schedules and date windows are **UTC**. Weekly run: **Saturday 12:00 UTC** (≈ Sat 07:00/08:00 ET) — after Friday `amc` reports have settled.

### 2.1 Shared write routine — `upsertQuarter(row)`

Field mapping (every target column ← a named source field or a formula, nothing else):

```
reported_eps             ← calendar.epsActual
estimated_eps            ← calendar.epsEstimate
reported_revenue         ← calendar.revenueActual
estimated_revenue        ← calendar.revenueEstimate
eps_surprise_percent     ← /stock/earnings.surprisePercent   (if fetched & V2 passed)
                           else safePct(epsActual, epsEstimate)
revenue_surprise_percent ← safePct(revenueActual, revenueEstimate)
fiscal_year              ← calendar.year
fiscal_quarter           ← calendar.quarter
report_date              ← calendar.date
report_hour              ← calendar.hour, with '' normalized to NULL
fiscal_date_ending       ← /stock/earnings.period             (if fetched & V2 passed, else NULL)
raw                      ← the source payload(s) verbatim
```

`safePct(actual, estimate)`:
- `actual` or `estimate` is `null`, or `estimate = 0` → `null` (no/undefined surprise — never invent a number, never use 0 as a stand-in).
- else → `((actual − estimate) / abs(estimate)) × 100`.

**Insert = fill-nulls-only upsert** (replaces v1's `DO NOTHING`). Finnhub's calendar frequently has `epsActual` within hours of a report while `revenueActual` and settled estimates arrive later; plain `DO NOTHING` would freeze those columns at `NULL` forever. This clause keeps populated values immutable (first non-null write wins — restatements are still ignored by design) while letting late-arriving data land:

```sql
insert into public.earnings_surprises (ticker, fiscal_year, fiscal_quarter, ...)
values (...)
on conflict (ticker, fiscal_year, fiscal_quarter) do update set
  fiscal_date_ending       = coalesce(earnings_surprises.fiscal_date_ending,       excluded.fiscal_date_ending),
  report_hour              = coalesce(earnings_surprises.report_hour,              excluded.report_hour),
  reported_eps             = coalesce(earnings_surprises.reported_eps,             excluded.reported_eps),
  estimated_eps            = coalesce(earnings_surprises.estimated_eps,            excluded.estimated_eps),
  eps_surprise_percent     = coalesce(earnings_surprises.eps_surprise_percent,     excluded.eps_surprise_percent),
  reported_revenue         = coalesce(earnings_surprises.reported_revenue,         excluded.reported_revenue),
  estimated_revenue        = coalesce(earnings_surprises.estimated_revenue,        excluded.estimated_revenue),
  revenue_surprise_percent = coalesce(earnings_surprises.revenue_surprise_percent, excluded.revenue_surprise_percent),
  updated_at               = now()
where earnings_surprises.fiscal_date_ending       is null and excluded.fiscal_date_ending       is not null
   or earnings_surprises.report_hour              is null and excluded.report_hour              is not null
   or earnings_surprises.reported_eps             is null and excluded.reported_eps             is not null
   or earnings_surprises.estimated_eps            is null and excluded.estimated_eps            is not null
   or earnings_surprises.eps_surprise_percent     is null and excluded.eps_surprise_percent     is not null
   or earnings_surprises.reported_revenue         is null and excluded.reported_revenue         is not null
   or earnings_surprises.estimated_revenue        is null and excluded.estimated_revenue        is not null
   or earnings_surprises.revenue_surprise_percent is null and excluded.revenue_surprise_percent is not null;
```

(The `where` clause makes no-op conflicts truly no-op, so `updated_at` and row versions don't churn on overlapping runs.)

### 2.2 Flow A — Weekly incremental

1. **Compute the window from a watermark, not a fixed 8 days.** A fixed window silently loses any report that lands during a failed/skipped week — nothing ever re-detects it.
   `from = (window_to of the last pipeline_runs row with status='success' and flow='weekly', else today − 8d) − 2d overlap`, `to = today`. Cap the span at **30 days — the calendar's verified free-tier lookback limit (§0.1 V1)**; when the cap engages, log a warning that quarters older than 30 days are recoverable only EPS-only via the backfill/reconcile flow (§2.3).
2. **Detect who reported.** One market-wide call: `GET /calendar/earnings?from={from}&to={to}` (no `symbol`). Filter to `symbol ∈ active watchlist` **and** `epsActual !== null` — a non-null actual is the definitive "it reported" signal; scheduled dates are unreliable (holiday shifts). → *1 call/week regardless of watchlist size.*
3. **Re-attempt rows with missing revenue.** Select cached rows in the window where `reported_revenue is null`; their calendar entries from step 2 feed `upsertQuarter`, and the null-fill upsert absorbs late revenue. → *0 extra calls.*
4. **Insert new quarters.** For each reported ticker with no cached row for that `(year, quarter)`:
   - *(only if V2 passed)* `GET /stock/earnings?symbol=X` → `period` + authoritative EPS `surprisePercent`.
   - `upsertQuarter(...)`.
   → *≤1 supplemental call per genuinely new quarter. 100-name watchlist in a heavy week ≈ a few dozen calls — far under 60/min.*
5. **Record the run** in `pipeline_runs` (window, counts, failures, status).

### 2.3 Flow B — Backfill on watchlist-add (revised per §0.1 V1: stock-primary)

Streaks and trailing averages need history, and the calendar can't provide it (30-day lookback). On add (and as a nightly reconcile for active tickers with < 4 cached quarters):

1. **Primary:** `GET /stock/earnings?symbol=X` → last 4 quarters, EPS-only rows: `fiscal_year`/`fiscal_quarter` from the entry, `fiscal_date_ending = period`, EPS actual/estimate + Finnhub's `surprisePercent` verbatim, `report_date = NULL`, `report_hour = NULL`, revenue columns `NULL`, `raw` = the stock entry.
2. **Enrich:** `GET /calendar/earnings?from={today − 30d}&to={today}&symbol=X` — if the ticker reported within the last 30 days, the calendar row (revenue, `report_date`, `hour`) merges onto the same `(ticker, fiscal_year, fiscal_quarter)` via the fill-nulls upsert (labels agree per V2 — no in-memory join).
3. `upsertQuarter(...)` per quarter. → *2 calls per added ticker, once.*

Consequences: backfilled history is **EPS-only** (revenue signal accrues forward from weekly runs — composite scores those quarters EPS-only per §3.3, which is exactly the honest behavior); initial streak depth is capped at ~4–5 quarters and grows over time (`streak_is_capped` keeps the UI honest).

Pacing: token bucket at ~55 req/min (1.1 s spacing) whenever more than a handful of calls are queued.

### 2.4 Error handling & observability (new in v2)

- **Retries:** on HTTP 429/5xx/network error, retry twice with exponential backoff + jitter (≈1 s, 4 s). After the third failure, give up on that call.
- **Per-ticker isolation:** a failed *supplemental* call never blocks the insert — calendar data alone is sufficient; insert with `fiscal_date_ending = NULL` and record the ticker in `tickers_failed`. A failed *calendar* call fails the run (`status='failed'`, watermark not advanced, so the next run re-covers the window).
- **Never write partial/guessed data:** if a field can't be obtained, it stays `NULL`. No defaults, no estimates-as-actuals, no zeros.
- **Alerts** (GitHub Actions job failure notification is sufficient): run `status='failed'`; or `rows_inserted = 0` in a week where the market-wide calendar showed ≥1 watchlist ticker reporting (strong signal of a filter/parse bug).

---

## 3. Ranking engine (on-read, deterministic)

Input: all cached quarters for a ticker, newest-first by `(fiscal_year desc, fiscal_quarter desc)`. All constants live in one config object (`RANKING_CONFIG`), not as literals.

### 3.1 Beat streak — walks **all cached history** (fixed from v1)

From the newest quarter, count consecutive quarters with `eps_surprise_percent > 0`; stop at the first `≤ 0` **or** `null` (an unknown surprise breaks the streak — a data gap must never extend a streak). Not capped at 4.

The streak is still bounded by cache depth: if every cached quarter is a beat, the true streak may extend further back than we can see. Expose `streak_is_capped = (beat_streak === quarters_available)` so the UI renders `"6"` vs `"9+"` honestly.

### 3.2 Trailing-4Q averages

Over the newest `N = min(4, quarters_available)` quarters:
- `eps_surprise_avg` = mean of **non-null** `eps_surprise_percent`.
- `revenue_surprise_avg` = mean of **non-null** `revenue_surprise_percent` (missing-estimate quarters are excluded, never counted as 0).
- Both `null` if no non-null values exist.

### 3.3 Composite rank score (recency-weighted, EPS-tilted)

Over the newest `N = min(4, quarters_available)` quarters `q₁…q_N` (`q₁` latest):

```
winsor(x) = max(-50, min(50, x))      -- one blowout quarter can't dominate

per-quarter blend sᵢ — 0.6/0.4 EPS/revenue split, renormalized over
whichever components are non-null (symmetric):
  eᵢ = winsor(eps_surprise_percentᵢ) ;  vᵢ = winsor(revenue_surprise_percentᵢ)
  both present              →  sᵢ = 0.6·eᵢ + 0.4·vᵢ
  revenue null              →  sᵢ = eᵢ
  EPS null, revenue present →  sᵢ = vᵢ
  both null                 →  no signal: DROP quarter qᵢ

recency weights r = [0.4, 0.3, 0.2, 0.1] (newest-first, positional);
drop no-signal quarters; renormalize retained weights to sum to 1:
  wᵢ = rᵢ / Σ r_retained

rank_score = Σ wᵢ · sᵢ over retained quarters
  no quarter has signal → rank_score = null   (render "—", sort last; never 0)
```

**Leaderboard order** (ties broken deterministically):
1. `rank_score` desc (nulls always last, regardless of `order`)
2. `beat_streak` desc
3. `eps_surprise_avg` desc (nulls last)
4. `ticker` asc

**Confidence label** (UI hint, derived, not stored): `high` = 4 quarters with signal, `medium` = 2–3, `low` = 1.

Worked checks — these six cases ship as unit-test fixtures (§7), so "verified" survives refactors:

| Case | Input (newest-first) | Expected |
|---|---|---|
| Full 4Q | `eps=[5,3,−2,8]`, `rev=[2,null,1,4]` | `rank_score = 2.90`, `beat_streak = 2` |
| Short history | 2Q: `eps=[10,4]`, `rev=[5,null]` | weights → `[0.571, 0.429]`, `rank_score ≈ 6.29` |
| Outlier | `eps₁ = 900` | winsorized to 50 |
| EPS missing | `eps₁ = null`, `rev₁ = 3` | `s₁ = 3` (revenue-only) |
| Interior gap | q₂ both-null of 3 | q₂ dropped; weights `[0.4, 0.2]` → `[0.667, 0.333]` |
| No signal at all | all quarters both-null | `rank_score = null`, sorts last — never 0 |

Design rationale: EPS weighted 0.6 (the headline surprise markets react to) vs revenue 0.4 (harder to beat via buybacks/tax items — keeps "big beat" honest); ±50 % winsorization tames small-cap blowouts; weight renormalization makes short-history and missing-revenue tickers directly comparable. **Null handling is symmetric across all three outputs:** streak stops on null, averages exclude null, composite drops no-signal quarters and yields `null` (not 0) with no signal — so a data gap can never outrank a genuine negative surprise, and no metric ever displays an invented value.

---

## 4. API contract

One read endpoint; the ranking engine runs inside it and returns render-ready, pre-sorted rows. **The read path never calls Finnhub** — it serves from Postgres only.

### Request

```
GET /api/leaderboard/earnings-beats
```

| Query param | Type | Default | Meaning |
|---|---|---|---|
| `active` | boolean | `true` | Only `is_active = true` tickers. |
| `min_quarters` | integer | `0` | Drop tickers with fewer cached quarters (UI default: `2`). |
| `limit` | integer | `100` | Max rows. |
| `order` | `asc`\|`desc` | `desc` | Sort direction on `rank_score` (nulls always last). |
| `ticker` | string | — | Single-ticker detail view. |

Response headers: `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` — data changes at most weekly, so recomputing per-request buys nothing.

### Response `200 application/json`

Field values below are **illustrative shapes, not real market data**; production values come exclusively from the pipeline.

```json
{
  "generated_at": "2026-07-18T09:00:12Z",
  "data_as_of": "2026-07-18T12:00:41Z",
  "count": 2,
  "params": { "active": true, "min_quarters": 0, "limit": 100, "order": "desc" },
  "results": [
    {
      "ticker": "NVDA",
      "company_name": "NVIDIA Corp",
      "is_active": true,
      "rank_score": 34.72,
      "beat_streak": 6,
      "streak_is_capped": false,
      "confidence": "high",
      "eps_surprise_avg": 8.41,
      "revenue_surprise_avg": 4.10,
      "quarters_available": 9,
      "latest": {
        "fiscal_year": 2026,
        "fiscal_quarter": 1,
        "fiscal_date_ending": "2026-04-30",
        "report_date": "2026-05-28",
        "report_hour": "amc",
        "reported_eps": 0.96,
        "estimated_eps": 0.88,
        "eps_surprise_percent": 9.09,
        "reported_revenue": 44060000000.00,
        "estimated_revenue": 43310000000.00,
        "revenue_surprise_percent": 1.73,
        "pulled_at": "2026-05-30T12:00:04Z"
      },
      "quarters": [
        { "fiscal_year": 2026, "fiscal_quarter": 1, "eps_surprise_percent": 9.09, "revenue_surprise_percent": 1.73 },
        { "fiscal_year": 2025, "fiscal_quarter": 4, "eps_surprise_percent": 7.80, "revenue_surprise_percent": 5.20 }
      ]
    },
    {
      "ticker": "ACME",
      "company_name": "Acme Inc",
      "is_active": true,
      "rank_score": 3.10,
      "beat_streak": 1,
      "streak_is_capped": false,
      "confidence": "medium",
      "eps_surprise_avg": 2.20,
      "revenue_surprise_avg": null,
      "quarters_available": 2,
      "latest": { "...": "same shape as above" },
      "quarters": [ "..." ]
    }
  ]
}
```

Field-contract notes:
- `data_as_of` = `finished_at` of the last successful `pipeline_runs` row — the UI shows data freshness from this, not `generated_at` (which only says when the JSON was rendered).
- Internal consistency invariants (enforced by tests, §7): `beat_streak ≤ quarters_available`; `streak_is_capped ⇔ beat_streak = quarters_available`; averages computed over ≤ 4 newest quarters; `quarters` is newest-first and `latest = quarters[0]` expanded.
- `null` means "unknown" everywhere and renders as "—" — never coerced to `0`.
- Monetary values: absolute USD. `*_percent`: percentages (`9.09` = +9.09 %).

### Errors

```json
{ "error": { "code": "DB_UNAVAILABLE", "message": "..." } }
```

| HTTP | `code` | When |
|---|---|---|
| `400` | `INVALID_PARAM` | Bad query param (e.g. non-int `limit`). |
| `404` | `TICKER_NOT_FOUND` | `ticker` param not in watchlist. |
| `500` | `INTERNAL` | Unhandled server error. |
| `503` | `DB_UNAVAILABLE` | Postgres unreachable (renamed from v1's misleading `UPSTREAM_UNAVAILABLE` — this path has no upstream). |

---

## 5. Edge cases

| Case | Handling |
|---|---|
| **< 4 quarters of history** | Compute over `N = available`; renormalize recency weights; expose `quarters_available` + `confidence`. Flow B seeds history on add. |
| **No revenue estimate** | `safePct → null`; excluded from averages; composite scores that quarter EPS-only. Never 0. |
| **Estimate = 0** | `safePct → null` (divide-by-zero / meaningless ±∞). |
| **Revenue arrives after EPS** | Weekly step 3 + fill-nulls upsert absorbs it on the next run. |
| **Duplicate calendar entries** | Unique key + upsert; also dedup within a batch pre-insert, preferring the row with non-null `epsActual`. |
| **Weekend/holiday date shift** | Never key off scheduled date; detect via `epsActual !== null`; watermark window with 2-day overlap; idempotency makes overlap free. |
| **Not yet reported** (`epsActual` null) | Filtered out — no premature row is ever written. |
| **Missed cron weeks** | Watermark window covers the gap up to 30 days (calendar's verified lookback limit); older gaps are recovered EPS-only by the reconcile/backfill flow. |
| **Backfilled quarters (older than 30 days)** | EPS-only by necessity (§0.1 V1): revenue, `report_date`, `report_hour` are `NULL` and stay `NULL` — rendered "—", never invented. |
| **Restatement after caching** | Populated values are immutable by design (fill-nulls-only). Revisit only if restatement tracking is ever a requirement. |
| **Ticker removed from watchlist** | Set `is_active = false` (keeps cache; leaderboard filters it out). Hard delete is blocked by the FK until earnings rows are explicitly removed first. |
| **Offset fiscal years** | Verified safe (§0.1 V2): both endpoints use fiscal labeling, so cross-source rows merge on the natural key instead of duplicating. |

---

## 6. Data-integrity guarantees ("nothing fake")

1. **Provenance:** every stored column maps 1:1 to a named Finnhub field or to `safePct` (§2.1 mapping table is exhaustive). `raw` retains the verbatim source payload as proof.
2. **No invention:** unobtainable values stay `NULL`, propagate as `null`, and render as "—". No defaults, placeholders, or sample rows are ever written to production tables.
3. **No silent guessing:** the three unverified Finnhub behaviors are explicit blocking tasks (§0.1) with fallbacks, not assumptions baked into code.
4. **Determinism:** the ranking engine is a pure function of cached rows + `RANKING_CONFIG`; identical inputs always produce identical leaderboards.
5. **Doc examples ≠ data:** JSON samples in this spec are shape illustrations and never seed anything.

---

## 7. Test plan

| Suite | What it pins |
|---|---|
| **Unit — ranking engine** | The six worked checks in §3.3 as fixtures (exact expected values); plus streak cases: all-beats → `streak_is_capped = true`; null in position 2 → streak 1; streak > 4 with a miss at position 7. |
| **Unit — `safePct`** | null actual, null estimate, zero estimate, negative estimate (`abs()` in denominator), normal case. |
| **Integration — pipeline** | Recorded real Finnhub responses (captured during V1–V3, checked into `backend/tests/fixtures/`) replayed against a test schema: correct rows land; run twice → identical state (idempotency); EPS-first-revenue-later sequence → revenue filled on second pass, `pulled_at` unchanged, `updated_at` bumped. |
| **Integration — API** | Sort order incl. null-last and tie-breakers; `min_quarters`/`limit`/`ticker` params; the §4 consistency invariants; error codes. |
| **Contract check (manual, pre-launch)** | One live pipeline run against 3 real tickers; spot-check stored numbers against the companies' actual reported EPS/revenue from their press releases. |

---

### Handoff summary

Primary source `/calendar/earnings` (only free endpoint with revenue); `/stock/earnings` optional enrichment gated on V2. Weekly cron (GitHub Actions, Sat 12:00 UTC) = 1 market-wide call + ≤1 supplemental call per new quarter, watermark-windowed, fill-nulls-idempotent, with retries and per-ticker isolation. Streak walks all cached history (`streak_is_capped` when it hits the cache edge); trailing averages and the recency-weighted 0.6/0.4 composite use the newest 4 quarters; nulls are never scored as 0 and never rendered as data. API is DB-only, cached 1 h, pre-sorted with deterministic tie-breakers, and reports `data_as_of` freshness. Three Finnhub behaviors must be verified (§0.1) before a line of pipeline code is written.
