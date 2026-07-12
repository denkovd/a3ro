# REVIEW — autonomous session, 2026-07-12

Everything below was verified in an isolated build environment: `tsc --noEmit` clean, `next build` clean (all 29 routes), 23/23 new backend tests passing, and route smoke tests against a running `next start` (pages 200; APIs behave correctly with and without DB reachability). Nothing was committed and nothing was pushed — the working tree is yours to review.

## What changed

**New module — P·07 Thesis Lab** (`/Projects/Thesis-Lab`), one workflow in three stages:

- **Pressure Test** — thesis text in → explicit claims extracted per sentence + implied assumptions (vol-plausibility of your target/deadline, trend alignment, macro backdrop, positioning capacity) → each scored for assessed confidence and fragility with every contribution listed (`reasons[]`), cross-checked against the live tape / GRID macro / CFTC COT / Money Line trend, with a strongest counter-case and concrete kill-evidence per leg. Fake confidence (stated ≥70, evidence ≤35) is branded on the card. Assumptions render weakest-first. Overall strength = 50 + visible components, nothing hidden.
- **Scenarios** — bear tail / bear / base / bull / bull tail, downside first, priced at σ-multiples of the instrument's own realized vol over your horizon; probabilities are labeled empirical frequencies (suppressed under 30 windows); tail narratives instantiate from live context (crowded-long unwind, macro shock, supply melt-up). The assumption × scenario survival matrix traces every break back to the leg that failed — click any cell for the why.
- **Portfolio Risk** — positions entered in-UI (`portfolio_positions`, marked live: quotes → daily scan → manual → entry-fallback, each labeled), flags first (oversized-weak-thesis, no-thesis size, trend conflict, correlation stacks ≥40%, stale marks, unmodeled), book ranked by risk contribution (weight × vol) not size, pairwise ρ + crowding clusters, and scenario P&L totals for the whole book against the pinned thesis.

New backend domain: `backend/src/thesis/{types,lexicon,engine,scenarios,risk,marketContext}.ts`, repos `thesisRepo.ts` + `portfolioRepo.ts`, migration `012_thesis.sql`, tests `thesisEngine.test.ts` + `thesisScenarios.test.ts` (23 tests). New API: `POST /api/thesis/analyze`, `GET /api/thesis`, `GET|DELETE /api/thesis/[id]`, `GET|POST /api/portfolio/positions`, `PATCH|DELETE /api/portfolio/positions/[id]`, `GET /api/portfolio/risk`. New UI: `app/components/projects/thesis/*`, `ThesisLab.tsx` card, `app/Projects/Thesis-Lab/*`.

**Fixes to existing code (Phase 0):**

- `Work.tsx` — the traverse was broken for your 6th card: `TOTAL` still said 5 and travel was `-248vw`, so Regime Shift was miscounted and the corridor cropped. Rewritten with derived constants (`SURFACES`, `TRAVEL_VW = 248 + 68×(n−5)`, runway 840vh), heading now "Seven intelligence surfaces", Thesis Lab card seated last in both traverse and mobile stack.
- `api/oil/corridors/series/route.ts` — real type error (unvalidated `corridor` string vs the `CorridorId` union) that would have failed your next `next build`; now validates via `isCorridorId` → 400 on junk input (smoke-verified).
- `backend/src/storage/db.ts` — `createDb()` built a fresh pg Pool per request; now memoized per connection string on `globalThis` (connection churn against the Supabase pooler, gone).
- `/api/thesis/analyze` survives a dead DB: runs the engine against an empty context and says so (`contextError`), instead of a bare 500.

## Strongest

The engine layer: pure, deterministic, fixture-tested, and every number carries its receipt — the strength math literally sums on screen. The three stages genuinely chain (thesis → scenarios → book P&L pinned to that thesis). Honest-state discipline matches the rest of the site everywhere (loading/pending/error/setup, labeled fallbacks, suppressed-with-reason numbers).

## Still fragile / know before you rely on it

- **Claim extraction is lexicon-bound.** Sentences outside the marker vocabulary default to neutral direction claims. It will read your example theses well; exotic phrasing will score conservatively. The lexicon is the tuning knob.
- **Risk model is v1.** No futures multipliers (enter barrel/coin/share quantities), β needs ≥20 shared bar sessions, correlation only covers symbols in `market_bars` + WTI/BRENT. Unmodeled things are flagged, never guessed.
- **Live-context checks ran against an unreachable DB in my sandbox** (Supabase DNS is blocked here), so tape/macro/COT-lit outputs were verified via fixtures + the degradation path, not against your production rows. First run on your machine is the real test — coverage chips in the verdict header show exactly what lit up.
- **Two of your WIP files were left untouched and unverified by my build**: your local modifications to `OilTrackerCore.tsx` and `Bull-Market-Finder/view.tsx` (my build used their last-committed versions; their current on-disk state compiles independently of my changes but I could not verify it here).

## Inspect first, in order

1. `git status` — **important**: the sandbox's view of your git index was corrupted mid-session (stale lock + phantom staged deletions of `package.json`/`tsconfig.json`/etc. that do not exist in your real files). I made no commits. If your local `git status` shows staged deletions you didn't make, run `git reset` (unstages only; touches no files). If it's clean apart from the new/modified files below, all good.
2. Run the migration once: `cd backend && npm run migrate:thesis` (additive + idempotent: `theses`, `portfolio_positions`).
3. `npm run dev` → `/Projects/Thesis-Lab` → load the example thesis → Run. Check the verdict header's coverage chips light up against your live DB, expand an assumption's receipts, open Scenarios, then add one real position in Portfolio Risk.
4. Homepage: ride the modules corridor end to end — counter should read 07/07 and finish flush on the Thesis Lab card (both desktop traverse and mobile stack).
5. `cd backend && npm test` (your suite + the 23 new tests) and a local `next build`.
6. Skim `DECISIONS.md` for the modeling choices (σ legs, empirical frequencies, flag thresholds) before trusting the numbers with real size.

Housekeeping you may want before pushing: `testfile.tmp` in the repo root looks like debris; delete if unowned.
