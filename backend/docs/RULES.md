# Oil Tracker — data reliability rules

Normative spec for staleness, fallback, conflict resolution, and alerting.
The reference implementation lives in `src/core/time.ts`, `src/ingest/rateGate.ts`,
`src/ingest/resolve.ts`, `src/alerts/rules.ts`. If code and this document
disagree, fix one of them — never leave them diverged.

## §1 Staleness

Staleness is always **relative to what a source promises**, never a global
constant. Each source declares `expectedCadenceMs` (live sources) and
`publicationLagBusinessDays` (settlement sources) in its descriptor.

Tiers, as multiples of the allowed age (`STALENESS_TIERS`):

| tier  | ≤ multiple | usable for display | usable for alerts |
|-------|-----------|--------------------|-------------------|
| fresh | 1×        | yes                | yes               |
| aging | 2×        | yes                | yes               |
| stale | 5×        | yes, flagged       | **no**            |
| dead  | > 5×      | no                 | no                |

- **Settlement sources** (EIA, FRED): age = business days between the record's
  `period_date` and today. EIA publishes T+1…T+4, so its allowed age is 4
  business days; fresh ≤ 4, aging ≤ 8, stale ≤ 20, dead beyond. Weekends are
  excluded by business-day math; holidays are absorbed by the tier widths
  (we deliberately do not maintain a holiday calendar).
- **Live sources** (yfinance): age = wall-clock ms since `observed_at` vs
  `expectedCadenceMs`. On weekends the allowed age is multiplied ×3 —
  markets are closed, old data is expected and must not page anyone.
- The UI reads `latest_quotes.staleness` verbatim. Never re-derive staleness
  in the frontend.

## §2 Rate limits, retries, fallback

### §2.1 In-cycle retry
One retry per source per cycle, only for `network` and `upstream_error`,
after 1–3 s jitter. Never retry `rate_limited`, `auth`, `bad_payload`.

### §2.2 Error kind → consequence
The adapter's error mapping is the contract (`SourceErrorKind`):

| kind           | counts as failure | consequence                                              |
|----------------|-------------------|----------------------------------------------------------|
| rate_limited   | no                | cooldown until `Retry-After`, else +1 h                   |
| auth           | yes               | source **disabled**; human fixes key, re-enables in DB    |
| network        | yes               | breaker (below)                                           |
| upstream_error | yes               | breaker (below)                                           |
| bad_payload    | yes               | breaker; likely schema drift — expect this from yfinance  |
| no_data        | no                | success with empty result (weekend/holiday)               |

### §2.3 Circuit breaker
3 consecutive failures → cooldown 30 min, doubling each further failure,
capped at 6 h. State lives in `source_health` (DB, not memory — ingestion is
serverless). Any success resets the counter and clears cooldown.

### §2.4 Polling roles
- `backbone` (EIA, FRED) and `supplement` (yfinance): polled every cycle,
  subject to their own gates.
- `reserve` (Alpha Vantage, 25 req/**day**): polled **only** when, after the
  eager pass, a benchmark has no alert-grade (fresh/aging) observation from
  any source. Reserve quota is for outages, not routine.
- A source down ≠ tracker down: resolution (§3) uses whatever usable records
  exist. Total absence of usable data is surfaced by the `stale_benchmark`
  alert, not by errors.

### §2.5 Self-imposed spacing
Between successful calls to a source, wait the strictest of its advertised
caps and its `minIntervalMs` floor (`minSpacingMs()`; persisted as
`source_health.next_allowed_at`). We always stay far under advertised limits;
free keys that get suspended are worse than slightly older data.

### §2.6 Cycle cadence (scheduler, not code)
The ingestion cycle is idempotent — cadence is a deployment choice, and on
Vercel a **plan constraint**: Hobby permits daily cron only (faster
schedules fail at deploy time). Rules per phase:

- **Settlement-only phase (now: EIA/FRED)** → daily cycle. Sources publish
  once per business day; staleness math (§1) is business-day based and does
  not assume frequent polling.
- **Intraday phase (yfinance or paid live feed live)** → 10–15 min cycle,
  which requires Vercel Pro (or a standalone scheduler). A live source on a
  daily cycle would classify itself `dead` between runs — do not ship an
  intraday adapter without also moving the schedule.
- Alert latency equals cycle cadence (§4 rules evaluate per cycle): on a
  daily schedule, level_cross/pct_move are end-of-day checks. That is
  acceptable for settlement data and NOT acceptable for intraday alerting —
  another reason the intraday adapter and the faster schedule ship together.

## §3 Conflict resolution

Two resolved products; **never conflate them**:

### §3.1 `latest_quotes` — the ticker
Freshest usable record of any kind, ranked by: kind (live > delayed >
settlement > historical) → staleness tier → source priority (1 = EIA best).
Sanity check: a live/delayed winner deviating **> 10 %** from the latest
resolved close is marked `suspect = true` (feed glitch until proven
otherwise). Suspect quotes still display (flagged) but never trigger price
alerts and never overwrite the daily series.

### §3.2 `daily_prices` — the canonical series
Settlement/historical records only, same benchmark + `period_date`
(comparing a live tick to a settlement price is a category error — they
are different quantities and their disagreement is expected):

- 1 source → take it.
- 2 sources → take the higher-priority one; if relative spread > **0.5 %**,
  set `disagreement = true` and record `spread_pct`.
- 3+ sources → discard outliers (further than 0.5 % from the median), then
  take the **highest-priority survivor**; same 0.5 % disagreement flag on
  total spread. The median rejects outliers — it does not pick the winner.
  Among agreeing values, confidence wins (an unofficial source must never
  beat EIA merely by sitting closest to the median).
- Re-resolving a period later (a source published late or revised) upserts
  the row — the log of raw values stays in `price_observations` forever.

Priorities are confidence-based, not freshness-based: EIA (1, official) >
FRED (2, official mirror) > yfinance (3, unofficial) > Alpha Vantage
(4, aggregator). Paid feeds later slot in at 1–2 by editing only their
descriptors.

## §4 Alerts (rules, not delivery)

Every rule is a DB-persisted latch: `armed → fired` on the trigger edge,
back to `armed` only when its re-arm condition clears. One `alert_events`
row is appended per armed→fired edge; delivery is someone else's job.

| rule                | fires when                                             | re-arms when                              |
|---------------------|--------------------------------------------------------|-------------------------------------------|
| level_cross         | alert-grade quote ≥ / ≤ level                          | price exits a 0.5 % band on the far side  |
| pct_move            | \|move\| ≥ threshold over window (same-basis, §G3)     | move vs rolling reference < ½ threshold   |
| stale_benchmark     | latest quote older than `maxAgeHours` (×3 weekends), or no quote at all | fresh-enough quote appears |
| source_disagreement | newest `daily_prices` row has `disagreement = true`    | newest row is back in agreement           |

Guards (implemented in `alerts/rules.ts`, tested against, non-negotiable):

- **G1** Missing data is never zero. No quote → price rules hold state, skip.
- **G2** Price rules evaluate only alert-grade (§1), non-suspect quotes.
  Data quality problems alert through `stale_benchmark` / `source_disagreement`,
  not through price rules firing on garbage.
- **G3** `pct_move` never compares across kinds. `daily_close` basis compares
  resolved closes; `intraday` basis compares live/delayed observations.
  If the reference point sits across a data gap (> 2× window + 3 calendar
  days for daily; < 25 % of window covered for intraday) → skip.
- **G4** Hysteresis on level_cross re-arm (band, default 0.5 % of level)
  so a price oscillating on the threshold fires once, not per cycle.
- **G5** Latches persist in `alert_state`; restarts and redeploys must not
  re-fire an already-fired rule.

Recommended starter rules (insert into `alert_rules`):

```sql
insert into alert_rules (id, benchmark, type, params) values
  ('wti-above-100',    'WTI',   'level_cross',         '{"direction":"above","level":100}'),
  ('wti-below-50',     'WTI',   'level_cross',         '{"direction":"below","level":50}'),
  ('wti-daily-5pct',   'WTI',   'pct_move',            '{"basis":"daily_close","windowDays":1,"thresholdPct":5}'),
  ('wti-stale-7d',     'WTI',   'stale_benchmark',     '{"maxAgeHours":168}'),
  ('wti-src-disagree', 'WTI',   'source_disagreement', '{}'),
  ('brent-stale-7d',   'BRENT', 'stale_benchmark',     '{"maxAgeHours":168}'),
  ('brent-src-disagree','BRENT','source_disagreement', '{}');
```

`maxAgeHours` must respect the current phase (§2.6): in the settlement-only
phase the freshest possible quote is already 1–4 business days old (EIA
publication lag) — 168 h (7 d) means "a full publication window has been
missed", which is a real outage. Tighten to ~48 h only once an intraday
source ships; a 48 h rule against settlement-only data fires permanently.

## §5 Known constants (change deliberately)

| constant                | value  | where                      |
|-------------------------|--------|----------------------------|
| disagreement tolerance  | 0.5 %  | `resolve.ts`               |
| suspect deviation       | 10 %   | `resolve.ts`               |
| staleness tiers         | 1/2/5× | `core/time.ts`             |
| breaker threshold       | 3      | `rateGate.ts`              |
| breaker cooldown        | 30 min ×2 → 6 h cap | `rateGate.ts` |
| rate-limit fallback     | 1 h    | `rateGate.ts`              |
| price sanity bounds     | −200…2000 $/bbl (negative prices are real: WTI −$37.63, 2020-04-20) | `core/units.ts` |
