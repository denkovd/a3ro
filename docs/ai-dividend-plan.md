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
5. **Outlook to 2031**: three scenarios (dividend arrives, infrastructure
   bubble deflates, gains pool upstream), five or fewer drivers tied to stages
   1–5, replacing the 16-slider model in `scenarios.ts`. Generalise
   `ledger.ts` from one metric to the stage outputs.

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
