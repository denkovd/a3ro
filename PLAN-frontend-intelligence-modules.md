# PLAN — Frontend Intelligence Modules (fit-tested against the A3RO repo)

**Purpose:** feed this file to Claude Code. It is a plan, not an implementation. Each module section states fit verdict, surfacing location, data sources, scope, and the recommended Claude Code model + thinking level.

**Hard constraints (apply to every task):**

- Frontend-only: no new backend code, no new tables, no new migrations, no new cron/scan jobs. New modules may READ existing API routes (`/api/bull/latest`, `/api/bull/transitions`, `/api/regime/latest`, `/api/macro/latest`, `/api/btc|gold|oil/*`) and otherwise use browser-fetched public endpoints, static JSON in `public/`, or file upload.
- Deterministic scoring only (DECISIONS.md §1): no LLM calls, every number traces to a listed contribution, honest nulls, nothing modeled shown as live.
- Follow existing module conventions: route under `app/Projects/<Name>/` with `page.tsx` + `view.tsx`, shared logic in `app/components/projects/`, hand-rolled SVG/canvas charts (no charting library exists in package.json — do not add one without asking).
- Note: `/api/watchlist/rankings` is a deprecated alias for `/api/leaderboard/earnings-beats`. Do not build on it.

---

## Verdict summary

| Idea | Verdict | Why |
|---|---|---|
| Relative Strength Matrix | **BUILD — priority 1** | High value, all data already exists in `/api/bull/latest` (RS63, ATR%, tiers, strategy lenses). Pure frontend. |
| Macro Event Overlay | **BUILD — priority 2** | Small, cross-cutting, low risk. Static JSON events, shared overlay component. |
| Narrative Rotation Board | **BUILD — priority 3** (absorbs Trend Acceleration Scanner) | Differentiated, frontend-viable with structured inputs only. |
| Bagholder Risk Map | **BUILD — priority 4, reduced scope** | Full architecture doc exists but specs a backend; v1 ships only the chart-structure layer, which is frontend-computable. |
| Trend Acceleration Scanner | **REJECT as standalone** | Same object as Narrative Rotation Board (attention deltas over ranked ideas). Screenshot/RSS ingestion breaks determinism (needs OCR/LLM) and browser RSS fetch hits CORS. Its scoring concept (weighted signals, "most climbing") survives as the scoring engine inside the Narrative Rotation Board. |
| Regime Monitor | **REJECT as new module** | Redundant: the unified Bull Finder already classifies ~650 symbols (incl. BTC, oil, gold, equities, ETFs) into bull/bear/neutral verdicts per strategy lens, with tiers and transitions. Building a second cross-asset classifier duplicates the Money Line engine's job. Salvage: a small cross-asset "regime strip" summarizing per-tier verdict counts, embedded at the top of the Bull-Market-Finder view — one component, not a module (folded into Task 1 below). |

Recommended build order = priority order. Tasks 1–3 are independent; Task 4 benefits from Task 2 (event overlay reuse) but does not require it.

---

## Task 1 — Relative Strength Matrix

**Model:** `sonnet` · **Thinking:** `think` (well-specified math; effort goes to the visualization)

**Route:** `app/Projects/Relative-Strength/` (page.tsx + view.tsx). Logic in `app/components/projects/rs/`.

**Surfacing:**
- Full module at `/Projects/Relative-Strength`.
- A compact "leadership strip" (top-5 / bottom-5 by RS momentum) embedded in the Bull-Market-Finder view.
- The Regime-Monitor salvage: a per-tier verdict-count strip (e.g. "crypto 4/6 bull · macro 12/30 bull") at the top of both views, computed from the same `/api/bull/latest` payload.

**Data:** `/api/bull/latest` (per-symbol RS63, ATR%, strength, tier, verdict, `consensus` across lenses) + `/api/bull/transitions` (what turned recently). No new endpoints. CSV upload as optional secondary input for symbols outside the scan universe (parse client-side; `xlsx` is already a dependency).

**Scope:**
- Multi-timeframe RS: RS63 comes from the API; compute shorter/longer RS windows client-side only where bar series are available via existing series endpoints, otherwise show RS63 + rank-delta over scan history and label missing windows honestly (`no_data`, never zero).
- Heatmap: symbols × timeframe/lens grid, color = RS rank percentile, sortable by tier.
- Quadrant view (RRG-style): x = relative strength vs benchmark, y = RS momentum (delta over N scans); trails from recent scan history if the API exposes it, single points if not — do not fabricate trails.
- Leadership rotation: rank-change table fed by `/api/bull/transitions`.

**Verification step:** recompute RS percentiles for 3 symbols by hand from API payloads and assert in a small test or dev-mode assertion panel.

---

## Task 2 — Macro Event Overlay

**Model:** `sonnet` · **Thinking:** default/low (mechanically simple; the care point is fitting the existing hand-rolled SVG charts)

**Surfacing:** NOT a module. A shared component `app/components/projects/EventOverlay.tsx` + a small events lib, toggled on:
- BTC/Gold/Oil tracker series charts (Loci/series views),
- Regime-Shift view,
- later, Bagholder module charts (Task 4).

**Data:** static JSON files in `public/events/` (e.g. `fomc.json`, `cpi.json`, `earnings-windows.json`, `commodity.json`) with a documented schema: `{ id, date, label, category, importance, source_url }`. User-uploaded JSON/CSV in the same schema merges client-side. No custom backend, no scraping. Seed files are hand-curated with source URLs — dates must be verifiable, not invented.

**Scope:** vertical markers + hover tooltips on time axes; category toggles persisted in `localStorage`; a small "upcoming events" list component reusable in any view. Each chart integration is a separate small edit — keep diffs per-view minimal.

**Verification step:** render every chart that gained the overlay with events off and confirm zero visual/behavioral diff.

---

## Task 3 — Narrative Rotation Board (absorbs Trend Acceleration Scanner)

**Model:** `sonnet` · **Thinking:** `think hard` (the schema + deterministic scoring design is the real work; get it wrong and the module is a vibes board)

**Route:** `app/Projects/Narrative-Rotation/`. Logic in `app/components/projects/narrative/`.

**Surfacing:** full module; plus each narrative links out to its member symbols' rows in Relative-Strength and Bull-Market-Finder (narrative → tickers mapping lives in the narrative definition).

**Data — structured inputs only (this is the fit-critical decision):**
- Curated narrative definitions in `public/narratives/narratives.json`: `{ id, label, symbols[], keywords[], notes }` for AI, energy, L2s, memes, uranium, gold miners, etc.
- Attention inputs the user feeds: Google Trends CSV export upload, manually entered datapoints, curated JSON feeds. Each datapoint carries `{ narrative_id, date, metric, value, source }`.
- Market corroboration computed from `/api/bull/latest`: median RS63 and % bullish among the narrative's member symbols — so "attention" is always shown next to "is price confirming".
- Explicitly OUT of v1: RSS ingestion, social screenshots, autonomous crawling. The UI labels itself assisted intelligence: scores update when the user feeds it, and every score shows its input count and staleness.

**Scoring (deterministic, from the Trend Acceleration concept):** per narrative, weighted sum of z-scored input deltas over 1d/1w/1m windows; weights are named constants; score panel lists every contribution (mirror Thesis Lab's `reasons[]` pattern). Below a minimum input count, show `insufficient_data` — never a score.

**Views:** board of narrative cards sorted by delta; 1d/1w/1m delta chips; gaining/losing lanes; per-narrative detail with input log and market-corroboration panel.

**Verification step:** golden-file test on a fixture inputs file — recompute expected scores by hand once, assert exactly.

---

## Task 4 — Bagholder Risk Map (v1, chart-structure layer only)

**Model:** `opus` · **Thinking:** `think harder` (must reconcile an existing backend-oriented architecture doc with the frontend-only constraint without corrupting the doc's intent)

**Route:** `/Projects/Bagholder-Trigger-Trade` (matches `bagholder-trigger-trade-architecture.md`). Logic in `app/components/projects/bagholder/`.

**Required reading before any code:** `bagholder-trigger-trade-architecture.md` and `DECISIONS.md` in full.

**The scope cut (state this in the module UI and in code comments):** the architecture doc's five-layer design needs positioning corpora, reply-corpus analysis, and narrative feeds that require a backend. v1 implements only what is frontend-computable and labels the rest as absent layers — honest nulls, per house style:
- **IN (computed from bars/snapshots via existing APIs):** failed-breakout detection (breakout above N-bar high that closes back inside within M bars), weak-bounce structure (bounce magnitude vs preceding leg, vol-normalized via ATR% from `/api/bull/latest`), distribution-style behavior (down-day volume dominance where volume exists in series endpoints; label `no_volume_data` otherwise), crowding proxy (RS63 rank + verdict streak length as "how consensus is this name").
- **IN (manual):** user-entered sentiment/positioning observations (structured form: source, date, direction, note) that adjust a clearly-separated "manual evidence" sub-score — never blended invisibly into the price-structure score.
- **OUT of v1:** L2 narrative-shock scoring, trigger/invalidator state machine, automated sentiment. The UI shows these as defined-but-unpopulated layers so v1 visibly maps onto the full architecture rather than pretending to be complete.

**Views:** risk map grid (symbols × structure flags, severity-colored), per-symbol detail with flagged patterns drawn on the price chart (reuse Task 2's overlay plumbing for annotations), manual-evidence log.

**Verification step:** unit tests for each structure detector against hand-constructed bar fixtures (known failed breakout, known clean breakout, known weak bounce); detectors must be pure functions.

---

## Suggested Claude Code invocation order

1. Task 1 (`sonnet`, think) — highest value/effort ratio, exercises the API-reading pattern the others reuse.
2. Task 2 (`sonnet`, default) — small; ship between larger tasks.
3. Task 3 (`sonnet`, think hard) — schema design first, views second; consider a planning pass before code.
4. Task 4 (`opus`, think harder) — plan mode first: have it produce a reconciliation summary of arch-doc-vs-v1-scope for your approval before writing code.

Each task: separate session/branch, keep diffs reviewable, update `DECISIONS.md` with any assumption that deviates from this plan.
