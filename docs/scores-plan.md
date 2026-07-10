# A3RO Oil Tracker — Composite Scores Plan

Status date: 2026-07-09. Design spec for the layered signal scores that sit on
top of the existing price + corridor feeds. Free-tier data unless marked PRO.
No code written yet — this precedes the P4/P5-era build work in `roadmap.md` and
is the consumer those primitives should be built for.

Scores are **composites**, not raw feeds. They follow the Module 4 (Regime
Finder) precedent exactly: a pure engine (`regime/engine.ts`) → snapshot table
(`regime_snapshots`) → read-only route (`/api/regime/latest`) → hook → UI card.
Every score below copies that shape. Nothing here invents a new pattern.

## Principle — phased status, not four scores on day one

The four scores are **not** peers to ship together. They differ in how cheaply
they activate, how legible they are, and how easy they are to overfit. Build
them in the order their honesty and cost allow:

| Phase | Score(s) | Layer | Why here |
|---|---|---|---|
| 1 | **Throughput**, **Flow Stress** | Corridor product | Cheapest to activate (PortWatch adapter already exists) and gives the corridor UI its reason to exist. Throughput is a primitive; Flow Stress is the first score built on it. |
| 2 | **Tightness** | Benchmark / fundamentals | Needs a new EIA inventories pack + a seasonal baseline. Legible and hard to fake, but heavier than corridor work. |
| 3 | **Macro Override** | Cross-market context | Last on purpose: the easiest to overfit and the hardest to explain cleanly. Ships only once the corridor and fundamentals layers are trustworthy enough to contrast against. |

Rule of thumb: a score ships when its inputs are live, baselined, and
individually inspectable in the UI. No score is allowed to depend on another
score that has not yet shipped.

## Inputs — have vs. need

Verified against the source adapters on 2026-07-09. Today the system ingests
**only**: WTI/BRENT prices (EIA `RWTC`/`RBRTE`, FRED `DCOILWTICO`/`DCOILBRENTEU`),
two US-Gulf corridor metrics (`crude_exports` = `WCREXUS2`, `refinery_utilization`
= `W_NA_YUP_R30_PER`), and PortWatch tanker transits/volume for Hormuz + Malacca.
No inventories, no crack, no benchmark spread, no macro/USD series.

| Score | Input | Status | Source |
|---|---|---|---|
| Throughput | Chokepoint transit calls + tanker volume | ✅ partial | PortWatch — live for Hormuz/Malacca; extend to Suez, Bab el-Mandeb, Cape, Panama (ids already verified in P2) |
| Flow Stress | Export strength | ✅ have | `crude_exports` vs baseline |
| | Regional stock draw | ❌ new | EIA regional/PADD + Cushing weekly stocks |
| | Widening benchmark spread | ⚠️ derivable | Brent–WTI — both legs already in `daily_prices` |
| | Throughput deviation | ⇢ from Phase 1 | Feeds in once Throughput is live |
| Tightness | Inventories vs 5-yr seasonal range | ❌ new | EIA weekly stocks (crude/Cushing/gasoline/distillate) |
| | Refinery utilization | ✅ have | `refinery_utilization` (PADD 3); add US total |
| | Crack proxy | ❌ new (derive) | RBOB/HO vs WTI, gasoil vs Brent — existing yfinance/AlphaVantage adapters, no new vendor |
| Macro Override → Macro pressure | USD strength | ❌ new | FRED broad dollar index (or reuse regime's `DX-Y.NYB`) |
| | Rates / growth proxies | ❌ new | FRED: `INDPRO`, `DGS10`, `T10Y2Y`, HY OAS |
| Macro Override → Positioning pressure | Managed-money net length | ❌ new, later | CFTC COT (P7) — separate data family |

The FRED adapter today pulls only two oil-price series. The macro layer needs it
extended (or a `fredMacro.ts` sibling, mirroring how `eiaCorridor.ts` siblings
`eia.ts`).

## Common architecture (all scores)

Every score touches the same layers, each following an existing file as its
template:

1. **Sources — `backend/src/sources/`.** New `eiaInventory.ts` (clone
   `eiaCorridor.ts`) and `fredMacro.ts` (clone `fred.ts`). Crack and spread need
   **no new source** — they are derived in the compute step from data already in
   the DB. Register new adapters in `registry.ts` / `corridorRegistry.ts` (the
   only place adapters are wired in).
2. **Scoring — new `backend/src/scores/` module (sibling to `regime/`).**
   `scores/engine.ts` holds pure, deterministic `compute*()` functions — no IO,
   fixture-testable. `core/scoreTypes.ts` defines a canonical `ScoreSnapshot`.
3. **Seasonal baseline.** A **week-of-year** norm (5-yr mean/min/max per ISO
   week) computed in a refresh cycle modeled on `baselineCycle.ts`. This *is* the
   "5-year seasonal range." Store it like `corridor_baselines`, not derived from
   the weekly table.
4. **Storage — additive migrations**, applied via the Supabase SQL editor:
   `006_inventories.sql`, `007_macro.sql`, `008_scores.sql`. `score_snapshots`
   mirrors `regime_snapshots` (one row per `run_date` × score, `latest_idx` on
   `run_date desc`).
5. **Compute cycle — `backend/src/ingest/` + cron.** A `runScoreCycle()` (shaped
   like `corridorPipeline.ts`) reads fresh inputs from the DB and writes
   snapshots. Add it to `app/api/cron/ingest/route.ts` **after** all ingestion,
   in its own try/catch — scores must never be able to fail price ingestion (same
   isolation posture as the regime and baseline cycles).
6. **API — `app/api/oil/scores/route.ts`.** Read-only, newest snapshot per score.
   Clone `app/api/oil/corridors/route.ts` (node runtime, `force-dynamic`).
7. **Hook — `useOilData.ts`.** Add a `scores` field fetched in the existing
   60-min slow cycle alongside corridors/baselines; extend the `OilData`
   interface and the `Promise.all`.
8. **UI — `OilTrackerCore.tsx`.** Reuse the `LiveRow {k,v,bar,warm}` row shape and
   `buildCorridorPanel()`. A shared **Signals rail** group (roadmap P4) is the
   right home rather than scattering chips across panels.

---

## Phase 1 — Corridor product

### Throughput (primitive + standalone metric)

**Answers:** is oil physically moving through the chokepoints, and how does that
compare to normal? **Inputs:** PortWatch transit calls + tanker volume, already
ingested for Hormuz/Malacca. **Work:** extend `portwatch.ts` coverage to Suez,
Bab el-Mandeb, Cape, Panama (chokepoint ids live-verified per P2); add a `1y`/`5y`
throughput baseline so every gate can render "vs norm." **Renders:** a first-class
row on every chokepoint panel, plus weight/pulse input to the globe flow-routes
(P2). **Why first:** the adapter exists — this is mostly coverage expansion, the
lowest-risk activation in the whole plan, and it is the primitive Flow Stress
consumes.

### Flow Stress (first score)

**Answers:** is this corridor under supply-side strain right now? **Inputs:**
export strength (`crude_exports` vs baseline, have) + regional stock draw (new
EIA weekly stocks) + widening Brent–WTI spread (derive; both legs in
`daily_prices`) + throughput deviation (from the primitive above). **Compute:**
`computeFlowStress()` in `scores/engine.ts` — normalize each leg to a 0–1
deviation-from-norm, weight, combine. **Renders:** a per-corridor gauge on each
hotspot panel and in the corridor index rail (`railText`). This is the score that
**justifies the corridor UI** — it turns a set of feeds into a reason to look.
**Caution:** keep each leg individually visible in the panel; the composite is a
convenience, not a replacement for the rows underneath it.

## Phase 2 — Benchmark / fundamentals

### Tightness (second score)

**Answers:** is the physical barrel scarce vs. its own seasonal history?
**Inputs:** inventories vs 5-yr seasonal range (new EIA stocks + seasonal
baseline) + refinery utilization (have; add US-total alongside PADD 3) + crack
proxy (derive from existing futures adapters — RBOB/HO vs WTI, gasoil vs Brent).
**Compute:** `computeTightness()`. The seasonal comparison reuses the existing
"vs 1-year norm" ratio pattern in `buildCorridorPanel()` (the row at ~L278),
swapped to a week-of-year 5-yr band. **Renders:** the US-Gulf / fundamentals
panel, then a chip in the Signals rail. **Why second:** legible and hard to fake,
but it needs the inventories pack + seasonal baseline built and backfilled first.

## Phase 3 — Cross-market context (last)

### Macro Override — one chip, two internal components

Ships last because it is the easiest to overfit and the hardest to explain. To
stop it becoming an incoherent bucket for "everything we can't otherwise
classify," it is **computed as two named sub-scores even though the UI shows one
chip**:

- **Macro pressure** — from dollar / rates / growth proxies. FRED cleanly
  supports this half with public series: a broad dollar index, `DGS10`, `T10Y2Y`,
  HY OAS, and `INDPRO`. This half can ship on its own.
- **Positioning pressure** — from CFTC-style managed-money net-length inputs
  (P7). A separate data family with a different cadence and different failure
  modes; it arrives later and must never be silently folded into the macro half.

**Fires** only when oil momentum **diverges** from these — oil rising while growth
proxies weaken or the dollar strengthens signals a move that may be
positioning- or supply-risk-led rather than demand-led. Because the two
components stay named end-to-end, the chip can **attribute which half is driving**
(`macro` vs `positioning`) — the explainability that a single blended number
would destroy. **Renders:** a global amber flag chip (align with the existing
override-amber concept at ~L1272), not a gauge — it is a state, not a level.

---

## Additional metrics worth adding

Grounded in what the current adapters already reach:

- **Term structure (contango/backwardation)** — front vs back-month WTI
  (yfinance). Strongest single confirmation of Tightness; near-free. (P4)
- **Brent–WTI spread, standalone** — already computed for Flow Stress; surfacing
  it alone reads US export economics.
- **Days of supply / stock cover** — crude stocks ÷ refinery runs. One derived,
  legible number.
- **SPR trajectory** — release vs refill posture (EIA weekly).
- **WPSR surprise chip** — actual vs expected weekly stock change; pairs with the
  P5 "next release" countdown.
- **CFTC managed-money net-length percentile** (P7) — is the Positioning-pressure
  half of Macro Override; build it there, surface it here too.
- **Composite "tape" stance** — roll Flow Stress + Tightness + Macro Override into
  one headline verdict (e.g. SUPPLY-TIGHT / DEMAND-SOFT / MACRO-DRIVEN), mirroring
  how Regime Finder ranks to a single verdict. Only after all three ship.

## Sequencing (cheapest-first, all free-tier)

1. **Throughput expansion + Brent–WTI spread** — no new vendor; extends an
   adapter you have and derives from data you have.
2. **Flow Stress** — combine the above with a regional-stocks leg → first score,
   corridor product.
3. **EIA inventories pack + seasonal baseline** → unlocks Tightness and deepens
   Flow Stress's stock-draw leg.
4. **Crack + term structure** from futures adapters → completes Tightness, adds
   two standalone signals.
5. **FRED macro layer → Macro pressure** half of Macro Override.
6. **CFTC positioning → Positioning pressure** half; then the composite tape.

## Build discipline

Same rules as the rest of the system. **Probe every new EIA/FRED/CFTC series id
live before speccing** — `eiaCorridor.ts`'s header documents the `seriesid` 404
that discipline caught; the candidate ids above are unverified and must be
confirmed at build. Spec exactly; implement with fixture tests; typecheck + full
suite + diff review gate each phase; migrations are additive and applied via the
Supabase SQL editor. Every score's legs must stay individually inspectable in the
UI — a composite that hides its inputs is not shippable.

## Sources

- [EIA Open Data / API v2](https://www.eia.gov/opendata/) — weekly stocks,
  refinery utilization, exports, SPR.
- [EIA API technical documentation](https://www.eia.gov/opendata/documentation.php)
- [FRED API](https://fred.stlouisfed.org/docs/api/fred/) — `INDPRO`, dollar
  indexes, `DGS10`, `T10Y2Y`, HY OAS.
- [IMF PortWatch — Daily Chokepoint Transit Calls](https://portwatch.imf.org/datasets/42132aa4e2fc4d41bdaf9a445f688931_0/about)
- [CFTC Commitments of Traders](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm) — managed-money positioning (P7).
- Internal: `docs/roadmap.md` (P4/P5/P7), `docs/corridor-data-sources.md`,
  `backend/src/regime/engine.ts` (score precedent).
