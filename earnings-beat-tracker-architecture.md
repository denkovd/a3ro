# Earnings-Beat Tracker — Architecture Spec

Stack: TypeScript/Python · Supabase (Postgres) · Finnhub free tier (60 req/min, no daily cap).
Scope: EPS + revenue surprise tracking for a watchlist, pulled **once per quarter per ticker** right after each reports.

---

## 0. Important API-reality note (read first)

The brief assumes `/stock/earnings?symbol=X` returns **both EPS and revenue** actual/estimate/surprise. It does **not**. On the free tier:

| Endpoint | Returns | Revenue? | Fiscal-period-end date? | EPS surprise % pre-computed? |
|---|---|---|---|---|
| `/calendar/earnings?from=&to=[&symbol=]` | `date`, `hour`, `year`, `quarter`, `epsActual`, `epsEstimate`, `revenueActual`, `revenueEstimate`, `symbol` | **Yes** | No (only `year`+`quarter`) | No (compute it) |
| `/stock/earnings?symbol=X` | `period`, `year`, `quarter`, `actual`, `estimate`, `surprise`, `surprisePercent`, `symbol` | **No (EPS only)** | **Yes** (`period` = fiscal end date) | Yes (EPS only) |

**Consequence:** `/calendar/earnings` is the **primary** source because it is the only free endpoint carrying revenue. `/stock/earnings` becomes an **optional supplement** used only to fill `fiscal_date_ending` and cross-check the EPS surprise %. Every design decision below follows from this.

This also drives the schema's natural key (see §1): `(ticker, fiscal_year, fiscal_quarter)` instead of `(ticker, fiscalDateEnding)`, because `fiscalDateEnding` is not reliably available and a `UNIQUE` on a nullable column does **not** prevent duplicates in Postgres (NULLs compare as distinct).

---

## 1. Schema (SQL)

Verified: parses cleanly as PostgreSQL DDL.

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
                              on update cascade on delete cascade,
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
```

### Schema notes / decisions

- **Unique key changed from the brief.** Requested `(ticker, fiscalDateEnding)` → delivered `(ticker, fiscal_year, fiscal_quarter)`. Reason: `fiscalDateEnding` isn't returned by the free calendar endpoint, and a `UNIQUE` constraint over a nullable column silently fails to dedup (Postgres treats each NULL as distinct, so two NULL-dated rows for the same quarter would both insert). `(year, quarter)` is present in both endpoints and non-null, so it delivers the *goal* of the requested constraint — no duplicate pulls — robustly. `fiscal_date_ending` is kept as an enrichment column. If you insist on the literal requested key, you must make `/stock/earnings` a required (not optional) call and mark `fiscal_date_ending NOT NULL`.
- **`report_hour`** (`bmo`=before market open, `amc`=after close, `dmh`=during market hours) is stored because it disambiguates same-day reports and helps the "date shifted by a holiday" edge case.
- **`reported_revenue` / `estimated_revenue`** use `numeric(20,2)` (absolute dollars, e.g. `89498000000.00`) — ample headroom, exact (never float).
- **Surprise-percent columns are stored** even though the compute layer is on-read, because Finnhub's own `surprisePercent` (EPS) is worth persisting verbatim and revenue % must be derived at insert (calendar gives only actual+estimate). Storing them keeps the read path a pure sort with no per-row arithmetic.
- **FK `on delete cascade`**: deleting a watchlist row drops its cached earnings. Prefer setting `is_active = false` to retain the cache. Switch to `on delete restrict` if you want deletion blocked while history exists.
- **Immutability**: matches "a quarter's data never changes." Inserts use `ON CONFLICT DO NOTHING` (first write wins). If you ever want to absorb restatements, switch that single clause to `DO UPDATE`.

---

## 2. Pipeline design (weekly cron + one-time backfill)

Two flows share one insert routine. Both are fully idempotent, so overlapping runs and re-runs are safe.

### Shared insert routine — `upsertQuarter(row)`

Given one reported quarter, map + insert:

```
reported_eps             = calendar.epsActual
estimated_eps            = calendar.epsEstimate
reported_revenue         = calendar.revenueActual
estimated_revenue        = calendar.revenueEstimate
eps_surprise_percent     = /stock/earnings.surprisePercent   (if fetched)
                           else safePct(epsActual, epsEstimate)
revenue_surprise_percent = safePct(revenueActual, revenueEstimate)
fiscal_year              = calendar.year
fiscal_quarter           = calendar.quarter
report_date              = calendar.date
report_hour              = calendar.hour
fiscal_date_ending       = /stock/earnings.period            (if fetched, else NULL)

INSERT ... ON CONFLICT (ticker, fiscal_year, fiscal_quarter) DO NOTHING
```

`safePct(actual, estimate)`:
- `estimate` is `null` or `0` → return `null` (no estimate / undefined surprise; see Edge Cases).
- else → `((actual - estimate) / abs(estimate)) * 100`.

### Flow A — Weekly incremental (the cron)

Schedule: weekly, a couple of days after the busiest report days (e.g. **Saturday 06:00**) so actuals have settled. Runs regardless; work is gated by data, not by the calendar.

1. **Detect who reported.** One call for the whole watchlist:
   `GET /calendar/earnings?from={today-8d}&to={today}` (no `symbol` → whole-market list).
   Use an **8-day** window (1-day overlap vs. the 7-day cadence) so a report that slips across the run boundary is never missed; idempotency absorbs the overlap. Filter the response to `symbol ∈ active watchlist` **and** `epsActual !== null` (a non-null actual is the definitive "it has reported" signal — scheduled date alone is unreliable).
   → *Cost: 1 call/week regardless of watchlist size.*

2. **Skip what's cached, insert what's new.** For each reported ticker, check existence by `(ticker, fiscal_year, fiscal_quarter)`. If a row exists → skip (no API call). If not:
   - *(optional, recommended)* `GET /stock/earnings?symbol=X` → take `period` (fills `fiscal_date_ending`) and `surprisePercent` (authoritative EPS %). One call per **newly reported** ticker only.
   - `upsertQuarter(...)`.
   → *Cost: 0 calls for already-cached tickers; ≤1 supplemental call per genuinely new quarter. A watchlist of 100 names in a heavy week is a few dozen calls — far under 60/min.*

3. **Idempotency guarantee.** Existence check (step 2) skips before any per-ticker call, so cached quarters cost nothing; `ON CONFLICT DO NOTHING` is the backstop for races and the window overlap. Re-running the cron any number of times converges to the same state with near-zero extra calls.

**Reasoning:** revenue only exists on the calendar payload, so step 1's single market-wide call already carries every number needed for the surprises row. `/stock/earnings` is demoted to an optional enrichment for `fiscal_date_ending` + EPS %, not the primary fetch the brief imagined.

### Flow B — Backfill on watchlist-add (needed for the compute layer)

Streaks and trailing-4Q averages are impossible for a freshly added ticker if you only ever capture one quarter going forward. On add (or as a nightly reconcile for tickers with `< 4` cached quarters), backfill history:

1. `GET /calendar/earnings?from={today-460d}&to={today}&symbol=X` → ~5 trailing quarters with EPS **and** revenue actual/estimate. Keep rows where `epsActual !== null`.
2. *(optional)* `GET /stock/earnings?symbol=X` → last 4 quarters of `period` + EPS `surprisePercent`; left-join onto step 1 by `(year, quarter)` to fill `fiscal_date_ending`.
3. `upsertQuarter(...)` for each quarter (`ON CONFLICT DO NOTHING`).
   → *Cost: 1–2 calls per newly added ticker, one time.*

Rate-limit note: at 60/min, add a ~1.1s spacing (or a small token-bucket) if backfilling many tickers at once; normal weekly load never approaches the limit.

---

## 3. Compute layer (on-read, not stored)

Input: the cached quarters for a ticker, ordered most-recent-first by `(fiscal_year desc, fiscal_quarter desc)`. Let the newest `N = min(4, available)` quarters be `q₁ … q_N` (`q₁` = latest).

### 3.1 Beat streak
Walk from `q₁`; count consecutive quarters with `eps_surprise_percent > 0`; stop at the first value `≤ 0` **or** `null` (an unknown surprise breaks the streak).

### 3.2 Trailing-4Q averages
- `eps_surprise_avg` = mean of non-null `eps_surprise_percent` across `q₁…q_N`.
- `revenue_surprise_avg` = mean of non-null `revenue_surprise_percent` across `q₁…q_N` (quarters with no revenue estimate are excluded from the mean, not counted as 0).
- Always expose `quarters_available = N` so the frontend can flag low-confidence rows (`N < 4`).

### 3.3 Composite rank score (recency-weighted, EPS-tilted)
Deterministic; verified numerically.

```
winsor(x) = max(-50, min(50, x))    -- clamp outliers so one blowout can't dominate

per-quarter blend sᵢ — renormalize the 0.6/0.4 EPS/revenue split over whichever
components are non-null (symmetric: same treatment whether EPS or revenue is missing):
  eᵢ = winsor(eps_surprise_percentᵢ)  ;  vᵢ = winsor(revenue_surprise_percentᵢ)
  EPS & revenue present     →  sᵢ = 0.6·eᵢ + 0.4·vᵢ
  revenue null              →  sᵢ = eᵢ                 (EPS-only)
  EPS null, revenue present →  sᵢ = vᵢ                 (revenue-only)
  both null                 →  no signal: DROP quarter qᵢ

recency weights: give each of the up-to-4 newest quarters its positional weight
  r = [0.4, 0.3, 0.2, 0.1] (most-recent-first); drop no-signal quarters; then
  renormalize the retained weights to sum to 1  →  wᵢ = rᵢ / Σ r_retained

rank_score = Σ wᵢ · sᵢ            over retained quarters
  if NO quarter has signal  →  rank_score = null   (render "—", sort last; never 0)
```

Sort watchlist by `rank_score` desc (higher = stronger, more-recent beats).

Worked checks (verified in-sandbox):
- 4Q, `eps=[5,3,-2,8]`, `rev=[2,null,1,4]` → `rank_score = 2.90`, `beat_streak = 2`.
- 2Q only, `eps=[10,4]`, `rev=[5,null]` → weights renormalize to `[0.571,0.429]` → `rank_score = 6.29`.
- Outlier `eps=[900,…]` → 900 clamped to 50 by `winsor` (no single quarter dominates).
- EPS null, revenue present → quarter scored on revenue only (`sᵢ = vᵢ`).
- Interior both-null quarter → dropped; retained weights renormalize (positions 1 & 3 → `[0.667,0.333]`).
- Ticker with no signal in any quarter → `rank_score = null` (sorts last), never `0`.

Design choices: EPS weighted 0.6 vs revenue 0.4 (EPS is the headline surprise markets react to); ±50% winsorization tames small-cap blowouts; renormalization makes `N<4` and missing-revenue tickers directly comparable to full-history ones. **Null handling is symmetric across all three outputs:** the streak stops on a null, and the trailing average and composite both *exclude* null quarters rather than scoring them `0`. A fully-unknown quarter is dropped (not weighted toward 0), and a fully-unknown ticker gets `rank_score = null` — so a data gap can never outrank a genuine negative surprise. All constants (`0.6/0.4`, `±50`, recency vector) are tunable knobs — surface them as config, not literals.

---

## 4. API contract

Single read endpoint; the compute layer runs inside it and returns render-ready, pre-sorted rows.

### Request
```
GET /api/watchlist/rankings
```
| Query param | Type | Default | Meaning |
|---|---|---|---|
| `active` | boolean | `true` | Only tickers with `is_active = true`. |
| `min_quarters` | integer | `0` | Drop tickers with fewer than this many cached quarters. |
| `limit` | integer | `100` | Max rows. |
| `order` | `asc`\|`desc` | `desc` | Sort direction on `rank_score`. |

### Response `200 application/json`
```json
{
  "generated_at": "2026-07-13T06:00:12Z",
  "count": 2,
  "params": { "active": true, "min_quarters": 0, "limit": 100, "order": "desc" },
  "results": [
    {
      "ticker": "NVDA",
      "company_name": "NVIDIA Corp",
      "is_active": true,
      "rank_score": 34.72,
      "beat_streak": 6,
      "eps_surprise_avg": 8.41,
      "revenue_surprise_avg": 4.10,
      "quarters_available": 4,
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
        "pulled_at": "2026-05-31T06:00:04Z"
      },
      "quarters": [
        { "fiscal_year": 2026, "fiscal_quarter": 1, "eps_surprise_percent": 9.09,  "revenue_surprise_percent": 1.73 },
        { "fiscal_year": 2025, "fiscal_quarter": 4, "eps_surprise_percent": 7.80,  "revenue_surprise_percent": 5.20 },
        { "fiscal_year": 2025, "fiscal_quarter": 3, "eps_surprise_percent": 8.10,  "revenue_surprise_percent": 4.90 },
        { "fiscal_year": 2025, "fiscal_quarter": 2, "eps_surprise_percent": 8.65,  "revenue_surprise_percent": 4.55 }
      ]
    },
    {
      "ticker": "ACME",
      "company_name": "Acme Inc",
      "is_active": true,
      "rank_score": 3.10,
      "beat_streak": 1,
      "eps_surprise_avg": 2.20,
      "revenue_surprise_avg": null,
      "quarters_available": 2,
      "latest": { "...": "same shape as above" },
      "quarters": [ "..." ]
    }
  ]
}
```

Field contract notes:
- `revenue_surprise_avg` / `..._percent` are `null` when no revenue estimate exists — the frontend renders "—", never `0`.
- `quarters_available < 4` signals low confidence (`rank_score` computed over renormalized weights).
- `rank_score` is `null` when no quarter has a usable surprise; null scores always sort last, regardless of `order`.
- `quarters` is newest-first; `latest` is a convenience copy of `quarters[0]`.
- All monetary values are absolute USD; all `*_percent` are percentages (e.g. `9.09` = +9.09%).

### Errors
```json
{ "error": { "code": "UPSTREAM_UNAVAILABLE", "message": "..." } }
```
| HTTP | `code` | When |
|---|---|---|
| `400` | `INVALID_PARAM` | Bad query param (e.g. non-int `limit`). |
| `500` | `INTERNAL` | Unhandled server error. |
| `503` | `UPSTREAM_UNAVAILABLE` | DB unreachable. (Reads are DB-only — Finnhub is not called on this path.) |

The read path never calls Finnhub; it serves from `earnings_surprises`, so it stays fast and rate-limit-free.

---

## 5. Edge cases

| Case | Handling |
|---|---|
| **< 4 quarters of history** | Compute over `N = available`; renormalize recency weights; return `quarters_available` for the UI. Backfill (Flow B) seeds up to ~5 quarters on add. |
| **No revenue estimate** (`revenueEstimate` null) | `safePct` → `revenue_surprise_percent = null`; excluded from `revenue_surprise_avg`; composite uses EPS-only fallback for that quarter. Never treated as 0. |
| **Estimate = 0** | `safePct` returns `null` (avoids divide-by-zero and a meaningless ±∞ surprise). |
| **Duplicate calendar entries** | `(ticker, fiscal_year, fiscal_quarter)` unique key + `ON CONFLICT DO NOTHING`. Also dedup within a batch before insert, preferring the row with non-null `epsActual`. |
| **Weekend/holiday date shift** | Never key off the scheduled date. Detect via `epsActual !== null`; use an 8-day overlapping window; idempotency makes overlap free. `report_hour` distinguishes bmo/amc. |
| **Not yet reported** (estimate present, `epsActual` null) | Filtered out in step 1 (`epsActual !== null`), so no premature/empty row is written. |
| **Restatement after caching** | Ignored by design (`DO NOTHING`, data treated immutable). Flip to `DO UPDATE` if corrections are ever wanted. |
| **Ticker removed from watchlist** | Prefer `is_active = false` (keeps cache). Hard delete cascades earnings rows per the FK. |

---

### Handoff summary for implementation
Primary source is `/calendar/earnings` (only free endpoint with revenue); `/stock/earnings` is an optional supplement for `fiscal_date_ending` + EPS `surprisePercent`. Weekly cron = 1 market-wide calendar call + ≤1 supplemental call per new quarter, fully idempotent. Surprise %s stored at insert; streak / averages / `rank_score` computed on read; the API serves DB-only, pre-sorted JSON.
