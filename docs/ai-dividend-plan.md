# AI Dividend — plan

Replaces Macro Horizon. The `docs/macro-horizon-*.md` files describe the old
module and are kept for history only.

## Question

As AI capability rises, how much of it turns into real output, who captures the
value, and what physical or financial limits could stop it?

The module is an experiment: it measures each link in that chain from published
data, then makes dated predictions and scores them.

## The chain

Defined in `backend/src/dividend/framework.ts`.

| # | Stage | Question | Lands in |
|---|---|---|---|
| 1 | Capability | How fast is AI getting more capable and cheaper? | Step 3 |
| 2 | Adoption | How many firms and workers use it? | Step 3 |
| 3 | Productivity | Is capability turning into output? (conversion gap) | Step 3 |
| 4 | Who benefits | Where does each AI dollar end up? (value-chain P&L) | Step 2 |
| 5 | Constraints | Energy, water, uranium, compute, financing limits | Step 4 |
| 6 | Outlook | Scenarios to 2031 and the prediction ledger | Step 5 |

Value-chain layers for stage 4: energy & materials, infrastructure,
hyperscalers, frontier labs (press-reported, lower confidence), apps &
adopters, workers & households.

## Build order

1. **Rename and restructure** — done. See below.
2. **Value-chain P&L** — done (entry-level jobs moved to step 3). See below. From SEC XBRL: revenue, operating margin, capex, free
   cash flow per layer. Entry-level jobs in AI-exposed occupations.
3. **Capability, adoption, the conversion gap and entry-level jobs** — done.
   See below.
4. **Constraint gauges** — done. See below. Replaces the proxy flags in
   `stress.ts` (still in the repo, unwired; remove in step 5).
5. **Outlook to 2031** — done. See below.

## Step 1 — what changed

- Route `/Projects/Macro-Horizon` → `/Projects/AI-Dividend` (permanent
  redirect in `next.config.mjs`); API `/api/horizon/latest` →
  `/api/dividend/latest`.
- `backend/src/horizon` → `backend/src/dividend`; repo, ingest cycle, scripts
  (`run:dividend`, `verify:dividend`), tests and UI components renamed to match.
- The page is now organised by the six-stage chain. The existing US baseline
  (BLS, BEA, Fed DFA) is placed where it belongs: productivity → stage 3,
  wages/jobs/income/wealth → stage 4 "Workers & households", household
  electricity prices → stage 5. Stages with no data show what they will
  measure and the planned sources, never placeholder numbers.
- Removed: Themes (stock-picking list with no data), and the scenario, stress
  and ledger UI. `scenarios.ts`, `stress.ts` and `ledger.ts` stay in the
  backend, unwired, as the base for steps 4 and 5.

### Kept on purpose

- Database tables keep their `horizon_*` names
  (`supabase/migrations/20261018031814_macro_horizon_baseline.sql`) so the
  revision archive carries over without a data migration.
- The ledger storage key `a3ro.horizon.ledger.v1` and the rule-version strings
  are unchanged so any saved ledgers still parse.

## Step 2 — what changed

The "Who benefits" stage now shows revenue, operating margin, capex and free
cash flow for each layer of the value chain, for the latest reported 12 months.

- **Companies:** 25 US-GAAP filers across energy & materials, infrastructure,
  hyperscalers and apps & adopters (`backend/src/dividend/valueChain/companies.ts`).
  IFRS filers (TSMC, ASML, Cameco) are left out rather than mixed in. Each
  fetch checks SEC's entity name against the expected company, so a wrong CIK
  fails loudly.
- **Maths** (`valueChain/metrics.ts`): last 12 months = latest fiscal year +
  year-to-date − same year-to-date a year earlier. Handles 52/53-week fiscal
  years and restatements. All of a company's metrics must cover the same 12
  months as its revenue or they are dropped. Companies whose latest period
  ended over 200 days ago are shown but left out of totals.
- **Frontier labs** (`valueChain/labs.ts`): entered by hand with a source and
  checked date, run through the same maths. Anthropic from its S-1 (filed
  26 Oct 2026); OpenAI from FT-verified 2025 accounts (marked "press report").
  Operating results only; the big non-cash charges below that line are
  excluded. When a lab starts filing 10-Qs, move it into `companies.ts`.
- **Pipeline:** weekly cron `/api/cron/value-chain` (Tuesdays 07:40 UTC) →
  `value_chain_vintages` table → `/api/dividend/value-chain`. Page views never
  call SEC. An empty fetch never overwrites a good archive.
- **Caveats shown on the page:** whole-company figures (AI isn't reported
  separately); capex is cash spent on property and equipment, so finance
  leases are excluded; lab periods differ.

### Setup needed before data appears

1. Apply `supabase/migrations/20261118050000_ai_dividend_value_chain.sql`.
2. Set `SEC_USER_AGENT` in Vercel (and `backend/.env` for local runs) to a
   name and contact email, e.g. `A3RO research you@example.com`. SEC rejects
   requests without one.
3. Load the first dataset without waiting for Tuesday:
   `npm --prefix backend run run:value-chain` to preview, then
   `npm --prefix backend run run:value-chain -- --archive` to store it.

## Step 3 — what changed

Four stages gained data: Capability, Adoption, Productivity and the
entry-level part of Who benefits.

| Measure | Source | Refresh |
|---|---|---|
| Frontier capability, open-weights gap | Epoch AI Capabilities Index (`benchmark_data.zip` → `epoch_capabilities_index.csv`) | Daily check |
| Businesses using AI now / expecting to within 6 months | Census BTOS `National.xlsx`, questions found by wording | Fortnightly |
| Job postings, AI-exposed vs hands-on occupations | Indeed Hiring Lab sector CSV on GitHub | Daily |
| Unemployment ages 20–24 vs 25–54 | BLS CPS `LNS14000036`, `LNS14000060` (added to the baseline) | Monthly |
| Conversion gap | Computed: productivity growth since 2022-Q4 minus the 2016-Q4→2019-Q4 trend | With BLS |

- Code: `backend/src/dividend/signals/` (parsers, fetch, snapshot); daily
  cron `/api/cron/dividend-signals` → `dividend_signal_vintages` and
  `dividend_signal_runs` → `/api/dividend/signals`. Sources fail independently.
- Parsers were tested against real copies of each file
  (`backend/tests/fixtures/dividend/`). Each one checks headers or question
  wording and fails loudly if the source changes format.
- Occupation groups (`EXPOSURE_GROUPS`) are our judgement, guided by research
  on which tasks language models can do (Eloundou et al., 2023). Every
  occupation is also listed on its own.
- Census broadened its AI question in November 2025, so the adoption series
  starts there; earlier figures aren't comparable.

### Dropped or deferred, and why

- **Industry productivity, AI-exposed vs less-exposed:** BLS publishes it
  once a year for selected industries (latest: 2025). Revisit when the 2026
  data lands; job postings are the faster split for now.
- **Cost per task at fixed capability:** no reliable machine-readable
  source found. Worth adding if Epoch or Artificial Analysis publish one.

### Setup needed before data appears

1. Apply `supabase/migrations/20261118060000_ai_dividend_signals.sql`.
2. Run `npm --prefix backend run run:signals` to preview, then with
   `-- --archive` to store. The daily cron keeps it current after that.
3. The baseline's BLS request now includes the two age-group series; the next
   baseline refresh picks them up automatically.

## Step 4 — what changed

The Constraints stage now shows eight gauges. Each reads the pressure on the
AI build-out as **easy** (not holding it back), **watch** or **tight** (likely
to slow it or raise its cost), with the threshold written on the card and a
note on who gains when it's tight.

| Gauge | Measure | Source | Easy / watch / tight |
|---|---|---|---|
| Electricity demand | US 12-month sales growth (Virginia commercial shown alongside) | EIA retail sales API | <1% / 1–2.5% / ≥2.5% |
| Electricity prices | US commercial price, 12-month average vs year before | EIA | <2.5% / 2.5–5% / ≥5% |
| Build-out | Power drawn by tracked frontier AI data centres; annualised growth between snapshots ≥90 days apart | Epoch AI data centres | <20% / 20–50% / ≥50% a year |
| Water | Share of tracked US data-centre power in states with ≥25% of land in severe drought or worse | US Drought Monitor + Epoch | <10% / 10–30% / ≥30% |
| Uranium | Price vs 5-year average | IMF via FRED `PURANUSDM` | <1.15× / 1.15–1.5× / ≥1.5× |
| Copper | Price vs 5-year average | IMF via FRED `PCOPPUSDM` | same |
| Financing | Hyperscaler capex as a share of operating cash flow | Value chain (step 2) | <65% / 65–85% / ≥85% |
| Chips and memory | Not scored: no public lead-time data | — | — |

- Code: `backend/src/dividend/constraints/` (parsers, gauges). The four new
  sources share the signal archive (`dividend_signal_vintages` / `_runs`) and
  fetch code; daily cron `/api/cron/dividend-constraints` →
  `/api/dividend/constraints`.
- The build-out growth rate needs history: it shows "not scored" until the
  archive holds two data-centre snapshots at least 90 days apart.
- Thresholds are judgement calls, written in `gauges.ts` and on the page.

### Setup needed before data appears

1. Apply `supabase/migrations/20261118070000_ai_dividend_constraints.sql`.
2. `EIA_API_KEY` must be set in Vercel (other modules already use it).
3. `npm --prefix backend run run:signals -- --constraints` to preview, then add
   `--archive` to store.

### Verified vs assumed

- Epoch data-centre CSV: tested on a real copy (April 2026).
- EIA route and parameters: from EIA's API documentation.
- FRED CSV: same endpoint and parser as the existing macro module.
- Drought Monitor: URL and field names taken from public code using it;
  not called from here. The parser accepts either field-name case and both date
  formats, and the fetch fails if fewer than 40 states return.

## Step 5 — what changed

The Outlook stage answers "what could the economy look like by 2031?" in three
parts, all computed in the browser from the four live snapshots
(`backend/src/dividend/outlook/outlook.ts`). No new endpoint, table or cron.

1. **Signposts.** Seven readings, each with a written rule saying which
   scenario it supports: capability gain, adoption pace, conversion gap, wage
   pass-through (vs the pre-pandemic share), the entry-level postings gap,
   where profit pools (infrastructure margin vs lab losses) and financing
   (capex vs operating cash flow). The "lean" is a count, not a probability.
2. **Scenarios to 2031.** Each sets two numbers, productivity growth above the
   pre-pandemic trend and the share of it reaching real hourly pay, and
   compounds today's readings to 2031-Q4. A "try your own" pair of sliders
   uses the same maths.

   | Scenario | Over trend | Share to pay |
   |---|---|---|
   | The dividend arrives | +1.0 pts/yr | 75% |
   | The build-out deflates | 0.0 | 65% |
   | Gains pool upstream | +0.8 | 35% |
3. **Prediction ledger.** Seven dated calls in `PREDICTIONS`, scored on the
   first reading at or after their date. Committed to git so the history proves
   when they were made: add new calls with a new date, never edit old ones.

Removed: `scenarios.ts`, `stress.ts`, `ledger.ts` and their tests (the old
16-slider 2046 model, proxy stress flags and browser-only ledger).

### Live reading on 19 Nov 2026

With production data the signposts lean **gains pool upstream** (6 of 7):
productivity is +0.69 pts/yr over trend, but only 0.58 of it reaches pay (0.74
before the pandemic); the exposed-vs-hands-on postings gap widened by 14
points; infrastructure margins are ~55% while the labs lose money. Financing
(95% of cash flow on capex) is the one signpost pointing to a deflating
build-out.

### Known gaps found while checking production

Fixed in code:
- Monthly annual change: a missing year-earlier month (Oct 2025, shutdown) is
  now interpolated from its neighbours and labelled as estimated.
- Renamed XBRL capex concepts are joined when their shared periods agree within
  0.5% (fixes ANET). EQIX split its capex into two concepts, so the join refuses.
- The constraints API now reports which sources have never loaded.
- The baseline archive failure now logs the database error code.

Still open (needs data or ops, not code):
- Constraint sources (EIA, FRED, data centres, drought) not loaded in production:
  run `npm --prefix backend run run:signals -- --constraints --archive` or check
  the `/api/cron/dividend-constraints` cron.
- Baseline archive `unavailable`: the `horizon_*` tables are likely missing;
  apply `20261018031814_macro_horizon_baseline.sql`.
- Genuine SEC gaps: DLR filings end March 2026 (stale), FCX capex ends March
  2026, EQIX capex split, ETN reports no operating income.
