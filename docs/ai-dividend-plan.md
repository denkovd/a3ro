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
2. **Value-chain P&L** from SEC XBRL: revenue, operating margin, capex, free
   cash flow per layer. Entry-level jobs in AI-exposed occupations.
3. **Capability, adoption and the conversion gap**: Epoch AI / AI Index /
   Artificial Analysis, Census BTOS, BLS industry productivity (AI-exposed vs
   less-exposed industries).
4. **Constraint gauges**: each reads tailwind / neutral / headwind with a
   written rule for what flips it. Replaces the proxy flags in `stress.ts`.
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
