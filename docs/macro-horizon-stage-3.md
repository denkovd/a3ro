# Macro Horizon — Stage 3

Implemented 18 October 2026. Open `/Projects/Macro-Horizon` → **Stress & ledger**, or **03 Stress**.

## Delivered scope

- Eight dated domains: three computable **proxy** monitors and five explicit evidence gaps.
- Sortable/filterable cards with group/location scope, constraint, exact trigger, transmission, confirmation, relief, limits and inspectable source values.
- Editable bounded thresholds and one-at-a-time alternative classifications. Persistence rules remain fixed and visible.
- Scenario-only household budget-gap and energy-screen windows, sharing the actual assumptions edited in Stage 2.
- Frozen local evidence checkpoints, rule-change/retraction history, explicit prospective compensation predictions, later outcome reviews and a persistence benchmark.
- JSON exports of the stress evidence pack and the local ledger. No backend write, database migration, recurring automation or deployment is introduced.

## Screening contract

Rules are `horizon-stress-1.0.0`. All thresholds, verification windows and persistence choices are **A3RO design assumptions**, not official crisis definitions or calibrated probabilities. They do not establish a recession, a confirmed household cash squeeze, a regional grid shortage, AI causation or a trade signal.

| Proxy | Default rule | Required comparisons |
|---|---|---|
| Worker purchasing power | Real hourly compensation annual change < 0%; **and** unemployment annual rise ≥ 0.3 percentage points | Two consecutive compensation quarters; three consecutive unemployment months |
| Household electricity prices | Nominal electricity CPI annual change ≥ 4% | Three consecutive months |
| Wealth concentration drift | Top 1% wealth-share annual rise ≥ 0.5 pp; **and** bottom 50% annual change ≤ 0 pp | Both conditions in the same two consecutive quarters |

Every annual comparison uses the exact same quarter/month one year earlier. No nearest observation, annual-to-quarterly fill, interpolation or missing-period persistence is allowed. Index comparisons use percent changes; rates and wealth shares use percentage points. A tolerance of `1e-9` change units prevents floating-point arithmetic at a threshold from changing a classification. Source footnotes remain inspectable.

Worker compensation and unemployment have different populations and reference windows, shown explicitly. They are not paired household observations. Compensation includes benefits and is an average. Nominal electricity inflation is not a real bill or affordability measure; a lower inflation rate does not necessarily mean a lower price level. Wealth groups are net-worth-ranked groups whose membership changes; they are not income quintiles or cash-income groups.

### States and quality gates

- **Proxy watch:** every required condition persists and the evidence is verifiable.
- **Partial signal:** at least one sample in the complete current windows meets a condition, but the full joint/persistence rule does not.
- **No rule flag:** the complete verifiable windows contain no condition flags. This is **not** a declaration of safety or broad recovery.
- **Cannot verify:** missing comparisons, mismatched wealth quarters, unhealthy/unavailable providers, aging/stale observations or invalid/old verification prevent a current determination. Raw conditions never override this state.
- **Needs evidence:** a domain has no defensible connected measurement contract yet and is not evaluated.

Health must be healthy at both the series and provider levels. Observation freshness is recomputed at assessment time using Stage 1's windows, not trusted from a cached display field. A successful source verification must be no more than seven days old, not future-dated. The source snapshot cannot be future-dated relative to the assessment. Valid observation periods after the assessment cutoff, invalid periods, nonfinite values, nonpositive index levels, out-of-range percentages and incompatible frequencies/units are excluded.

The UI reevaluates its assessment clock once a minute. **Refresh evidence** retries the baseline API and respects its existing client/source caches; it is not a forced bypass of official-provider caching. API errors remain visible in the module's error banner; the prior snapshot can remain displayed as dated evidence rather than being silently replaced with zeros.

### Five gaps, deliberately not inferred

1. **Matched household purchasing power:** requires compatible cash income, essential expenditure and independent labour/distress confirmation. BEA median national-accounts income is not a cash-budget substitute.
2. **Regional power:** requires a named operator, dependable commissioned capacity, peak/committed load, local delivery constraints and that operator's threshold. Electricity CPI and annual energy proxies are not substitutes.
3. **Hydrocarbons:** requires separate oil/gas replacement, demand, outage, inventory and spare-capacity evidence. No geological wall date is manufactured.
4. **AI investment economics:** requires reconciled commitments, utilisation, paid revenue, debt, cash generation and project identity.
5. **Institutional delivery:** requires enacted funding, named delivery deadlines, actual delivery and beneficiary outcomes. An announcement or a modelled transfer is not delivered support.

The cards document the confirmation and disconfirming/relief evidence needed to connect each gap later. No fake regions, projects, map points or severity probabilities are generated.

## Scenario pressure windows

The Stage 2 scenario equations and model version are unchanged. Scenario input state is lifted to the page and shared by the lazily loaded scenario/stress workspaces. Edits and resets are immediately reflected in both tabs; observed-rule sliders do not alter model assumptions.

Each of the three narratives evaluates:

- High-essential-burden synthetic budget: real spending room **below zero**.
- Lower-essential-burden synthetic budget: real spending room **below zero**.
- Desired-energy/delivery proxy **above 1.1**: an illustrative design threshold, not a regional reliability standard.

The table reports the first model sample crossing the threshold, the onset bracket of the first spell lasting two consecutive annual samples, and its second annual sample. If a lone breach occurs before a later persistent spell, the first breach and the later spell's own onset bracket remain distinct. Equality at zero room or ratio 1.1 is not a strict breach. No crossing through 2046 and no two-sample persistence are explicit outcomes. A bracket is annual sampling resolution, **not** a forecast onset date or a confidence interval. These rows cannot promote an observed watch.

## Evidence checkpoints and revision history

Storage key: `a3ro.horizon.ledger.v1`. Storage is local to the browser origin (including port), not the database or a server-signed journal. The UI is append-only for checkpoints, original predictions and outcome reviews except for an explicitly confirmed whole-ledger reset. Device clock and local-storage content remain user-controlled; this is not tamper-proof research preregistration.

**Save watch checkpoint** freezes:

- Local recording time and stable ID.
- Exact source snapshot, including observation values/footnotes, retrieval metadata, provider health and archive availability.
- Assessment timestamp, rule version, selected thresholds, full rule evidence and classifications.

Unchanged evidence/settings/classifications do not consume a duplicate checkpoint. Comparisons look back to the latest **verifiable** saved state for each proxy. An intervening unverified checkpoint does not erase an earlier watch. A verifiable watch-to-partial/no-flag transition under the same relevant settings is recorded as a **rule retraction**. Changes to the relevant thresholds are labelled rule-setting changes, not evidence-driven retractions. Earlier states and their evidence remain intact. A stale/degraded state cannot retract a watch.

Schema/version, bounds, identities, chronology, frozen observation shapes and assessment reproducibility are checked when restoring and saving. Invalid saved data is not silently cleared: writes are disabled, a raw backup can be exported, and reset requires an explicit checkbox. Records are limited to 30 checkpoints, 20 predictions, 20 reviews per prediction and 3 MB; reaching a limit rejects the write rather than deleting history. Successful storage writes precede UI success claims. Browser Web Locks serialize application writes; stale-tab storage comparisons reject conflicting updates, and storage events synchronize open tabs. If safe local locking/storage is unavailable, the UI reports the failure instead of claiming persistence.

This version supports **export, not import**. Clearing origin storage, changing origin/port or using another device will not carry the ledger automatically. Export backups before an intentional reset. A reset removes only this local ledger and resets its scorecard, not other module data.

## Prospective prediction contract

Predictions are explicitly registered by the user, not inferred from merely viewing a proxy watch or scenario. The target is deliberately narrow and observable:

> BLS real hourly compensation's year-on-year change in the quarter exactly four quarters after the latest verified compensation observation will be **below zero** or **at least zero**.

The full target quarter must still be in the future relative to registration. Exact prior-year anchor data and fresh healthy compensation evidence are required. Registration preserves the original call, evidence checkpoint, anchor annual change and a **persistence benchmark** (the anchor's decline/non-decline state). Only one call per target quarter is allowed, preventing duplicate records or alternative calls from inflating the scorecard. Calls are not silently edited after registration.

**Review saved predictions** uses fresh healthy compensation evidence and exact target/prior-year observations. Outcomes before their reference-period end, absent target observations, stale/failed sources or missing comparisons do not become scored failures. An unchanged outcome is not appended again. A change in target value, comparison value or source footnote appends a dated review while preserving previous reviews; a revision can turn an earlier hit into a false alarm. Retrieval timestamps are not claimed to be original publication timestamps.

Metrics count each scored target once using its latest saved review:

- Decline hit: predicted decline and target declined.
- False alarm: predicted decline and target did not decline.
- Missed decline: predicted non-decline and target declined.
- Correct non-decline: predicted non-decline and target did not decline.
- Accuracy: correct calls / scored calls; unscored calls are excluded, not assumed correct or wrong.
- Persistence accuracy: the saved anchor-state forecast scored against the same outcome.
- Mean calendar lead: registration to target-quarter end. This is **not** warning lead to a crisis or to an observed stress onset.

No scored targets means **Not yet scored**, not 0% or a fabricated success rate. These metrics evaluate explicit compensation calls—not calibration of the three proxy monitors, twenty-year scenarios, household cash-stress forecasts or investment returns. A small local sample cannot establish forecasting skill. There is no calibrated probability or alert false-positive-rate claim.

## Retrospective diagnostics and point-in-time limits

The last eight available compensation quarters can be inspected using today's revised histories with reference periods restricted to each cutoff. This is labelled **retrospective**, not a point-in-time backtest: original publication dates, release lags and historical vintages are not reconstructed. Raw historical conditions are shown without treating today's provider-verification status as historical health. There are no performance statistics from this diagnostic table.

The Stage 1 permanent revision archive remains a separate, unapplied migration in this preview. Local checkpoints begin preserving evidence when the user records them; they do not reconstruct what was knowable before that. Prospective calls and their frozen evidence provide the basis for later honest evaluation, but original-vintage historical replay and independent confirmed household/grid outcomes are still needed before claiming calibrated alert performance.

## Verification

Dedicated domain tests cover persistence, exact periods, threshold equality, scope/population separation, missing/future/stale/degraded evidence, wealth-period alignment, settings validation, deterministic diagnostic cutoffs, frozen checkpoints, retraction versus unverified/settings changes, future registration, duplicate calls, pending targets, scored outcomes, revisions, false alarms/misses, persistence benchmarking, schema corruption, bounded storage and annual model-window semantics.

Browser checks follow the actual flow: module → baseline API → rule engine → source evidence → shared scenario windows → local checkpoint/prediction writes → reload/export → outcome/revision reviews. Empty/degraded sources and corrupt/failed storage are tested separately. Stage 1 and Stage 2 browser checks remain regression gates. Executed results are recorded after verification below.

### Executed results

- All **549 backend tests pass**, including 25 Stage 3 tests. Root/backend TypeScript checks, 11 landing tests, six optimisation tests and the production build pass.
- The real local API supplies all ten baseline series with three healthy providers. At the recorded check, default rules produce one wealth-concentration proxy watch, two partial proxy signals and five evidence gaps. These classifications are a dated rule result, not a claim of confirmed household or physical-energy stress.
- Headless Edge verifies rule/evidence-pack reproduction, sort/filter controls, threshold reset, shared Stage 2 edits, all nine model pressure windows, local checkpoint/prediction persistence through reload, duplicate-call rejection, pending outcomes, cross-tab synchronization, backup export, corrupt-storage preservation and explicit reset, and quota-failure handling.
- An isolated browser-test fixture registers a past compensation call, scores an available target and then changes its outcome evidence: the new review retracts the earlier hit into a false alarm without erasing the earlier review. This is a **test fixture**, not claimed historical preregistration or actual forecast performance. All test-ledger writes occur in isolated headless browser profiles, not the user's regular browser ledger or database.
- At 320, 390 and 768 px the tested page has no horizontal overflow; final browser checks report no page errors. Desktop/mobile screenshots and exported verification JSON are in the task's visualizations directory outside the application repository.
- Final-build edge-case checks also pass: an isolated proxy-watch fixture retracts on verified contrary evidence and preserves both checkpoints; conflicting writes leave externally changed storage intact; denied storage is handled without a page error; and fully expanded source tables, settings, predictions and long checkpoint IDs fit 320/390 px layouts. Prediction registration works without first saving a manual checkpoint.
- The complete Stage 1 and Stage 2 browser suites also pass, including live API/source views, Australia (348 observations), navigation, six homepage cards, scenario controls, export reproducibility, missing/degraded data and HTTP retry.
- Macro Horizon's initial JS remains **107 kB**; the homepage remains **146 kB**. Stress/scenario workspaces load dynamically. Source revision archiving is still unavailable in this preview; no permanent migration, production allocation change or deployment was performed.
