# Macro Horizon — Stage 2

Implemented 18 October 2026. Open `/Projects/Macro-Horizon` and select **Future scenarios** (or **02 Scenarios**).

## Scope

Three deterministic, editable narratives: **Broad gains**, **Uneven gains**, **Disruption**. The middle narrative is initially selected for comparison, not assigned a higher probability. No preset is an estimated forecast. All sixteen assumptions are chosen design inputs; none is estimated from the observed productivity/compensation gap.

The latest valid shared BLS productivity/real-compensation quarter supplies the reference date and normalisation. Each source index starts at 100. The subsequent steps are at that same quarter annually, through 2046, with checkpoints in 2030/2035/2046. Missing anchor data disables scenarios rather than generating observations. Old/degraded anchor evidence remains usable with a caution and provenance.

The baseline API retains `stage: 1`: it describes the observational payload, not the highest UI stage. No new endpoint, provider dependency, database schema, permanent database write or deployment is required. The Stage 1 archive migration remains a separate operational step.

## Model version

`horizon-scenarios-1.0.0`, implemented by the shared pure TypeScript engine in `backend/src/horizon/scenarios.ts`. It runs locally in the browser, with the same validated computation callable from server-side code or tests. Changing equations, budgets or preset assumptions requires a model-version change. Annual calculations use unrounded values; display values round to one decimal.

### Additional diffusion and hourly capacity

With elapsed years `t`, productive-use delay `lag`, half-life `halfLife`:

```
diffusion = 1 - 0.5 ^ (max(0, t - lag) / halfLife)
desired energy index = 100 × ((1 + workload growth) × (1 - unit-energy reduction)) ^ t
delivery index = 100 × (1 + delivery growth) ^ max(0, t - delivery delay)
effective diffusion = diffusion × min(1, delivery index / desired energy index)
AI uplift = full-diffusion AI potential × effective diffusion
non-AI factor = (1 + non-AI real growth) ^ t
output-per-hour index = 100 × non-AI factor × (1 + AI uplift)
real-hourly-labour index = 100 × non-AI factor × (1 + AI uplift × labour transmission)
hours factor = 1 - full-diffusion hours loss × effective diffusion
```

Rates in equations are fractions; controls display percentages. Diffusion is additional productive use beyond the anchor, **not measured business adoption**. It is bounded and delayed, but not a fitted industry diffusion curve. Effective diffusion can decline if the selected desired-workload path outruns delivery. Energy constraints also reduce assumed AI-related hours displacement; hours loss is not an unemployment forecast. The counterfactual excludes additional modelled AI uptake, not all AI already present in the baseline economy.

The energy indices are deliberately **not TWh, MW, regional reserve margins, nuclear output, commissioned projects, or reliability estimates**. Desired workloads are an external scenario trajectory, not actual served demand; efficiency multiplies workloads and facility overhead is held constant. Demand-response, price-elastic workload adjustment, hourly dispatch and local deliverability are not solved. Delivery discounts AI gains rather than pretending all desired demand is served. This screening relationship and the household price response are uncalibrated assumptions, not estimates of a physical hydrocarbon depletion wall.

### Illustrative cash budgets

| Budget | Net labour | Net capital | Total disposable cash | Essentials | Energy included in essentials | Initial room |
|---|---:|---:|---:|---:|---:|---:|
| High essential burden | 95 | 5 | 100 | 80 | 10 | 20 |
| Lower essential burden | 70 | 30 | 100 | 50 | 5 | 50 |

These are two **equal-count synthetic households**, not observed income/wealth groups, matched survey households, actual dollars or population weights. Their initial income is deliberately identical so ownership exposure and essential burden can be inspected. BEA real median national-accounts income and separately ranked distribution shares are **not** used as cash inputs. Do not infer distributional breadth, a national median outcome or a population share from this model.

```
real labour cash = initial net labour × real-hourly-labour index / 100 × hours factor
additional AI capital cash = initial capital × non-AI factor × AI uplift × capital response
real capital cash = initial capital × non-AI factor + additional AI capital cash
```

Capital response is a chosen level multiplier, not a measured profit share or a mechanical allocation of the productivity/compensation gap. Household income equations do not sum to national output or identify causation. Existing tax/transfer structure is embedded in starting net cash flows and held unchanged.

After the policy delivery delay, a levy applies to each budget's **additional AI capital income only**. Every unit collected from the two equal-count budgets is transferred to the high-burden budget, including its own levy. Tax and transfer amounts balance every year; aggregate income is not created by redistribution. This closed toy financing system is not a national fiscal-cost estimate and includes no debt-funded support.

### Prices and spending room

```
annual additional energy-price rate = min(8%, chosen response × max(0, desired / delivery - 1))
energy relative-price factor = cumulative product of (1 + annual additional energy-price rate)
real energy expense = initial energy × energy relative-price factor
real non-energy essentials = (initial essentials - initial energy) × (1 + extra essential growth) ^ t
real essentials = real non-energy essentials + real energy expense
general price deflator = (1 + general inflation) ^ t
nominal disposable cash = (real labour + real capital - levy + transfer) × deflator
nominal essentials = real essentials × deflator
real spending room = (nominal disposable cash - nominal essentials) / deflator
essential burden = nominal essentials / nominal disposable cash × 100
```

The energy-price response is a contemporaneous assumed screening coefficient, capped at 8% extra annual energy-price growth. It is not estimated from electricity CPI. No additional household contract/regulated-tariff lag is modelled. General inflation converts both sides of the budget and cancels from real room: changing it alone must not manufacture an inflation effect. Only relative essential-price changes affect real expenses. Energy is already part of essentials and is not added twice. Negative room, negative room indices and burdens above 100% are retained. No automatic borrowing, consumption cut or default response fills a budget gap.

## Interface and reproducibility

- Compare all three 2046 outcomes, edit each preset independently, and reset the selected preset. Edits survive switching module tabs within the page; reload restores defaults.
- Four primary controls expose diffusion, labour transmission, lost hours and relative essentials. An expanded panel exposes the other twelve assumptions and their bounded ranges.
- Dashed, labelled scenario charts are separate from observed history. Native keyboard sliders inspect every annual point. The checkpoint table exposes both synthetic budgets.
- Six local sensitivity tests perturb labour transmission by ±10 percentage points, relative essentials by ±0.5 percentage points/year, energy delivery by ±2 percentage points/year, diffusion half-life by ±2 years, hours loss by ±5 percentage points and the levy by ±5 percentage points. Bounds clip tests. Sort order uses the absolute 2046 high-burden room spread. Unequal perturbation sizes mean this is **not** statistical importance, a confidence interval or a probability.
- JSON export contains schema version, model version, export timestamp, selected narrative, exact source snapshot, actual shared-quarter anchors/provenance, synthetic budgets, all three sets of assumptions, modified flags and full computed paths. Export creates a local browser download, not a database record.

To reproduce a scenario from its exported record, call `runHorizonScenario(record.anchor, record.assumptions)` with the matching model version. The core run has no clock, random numbers, network calls or mutable input state. JSON round-tripping must reproduce identical numerical paths. Keep exported files for later comparisons; there is not yet a stored-run import/history UI.

## Validation

- Nineteen dedicated tests cover shared-quarter selection, stale/missing/future anchors, strict parameter types/bounds, integer delays, all-min/all-max finite outputs, neutral identities, diffusion half-life, multiplicative efficiency, delayed delivery, constrained AI, capped energy prices, hours-versus-hourly-income separation, funded redistribution, inflation invariance, negative room, deterministic exports, immutability and bounded sensitivity ranking.
- Root/backend TypeScript checks, full backend tests, landing/optimisation tests and production build are run alongside browser checks.
- Browser verification checks official-source API → evidence anchor → scenario paths, changed controls, distinct narratives, tab-state retention, reset, downloaded JSON, keyboard chart inspection, responsive layouts, unavailable data and request-failure recovery. Results are recorded after execution, not assumed from compilation.

### Executed results

All 524 backend tests pass, including the 19 scenario tests. Root/backend TypeScript checks, 11 landing tests, six optimisation tests and the production build pass. Homepage first-load JS remains 146 kB; Macro Horizon is 107 kB, with the scenario workspace dynamically loaded when first opened.

Headless Edge verifies the real local API supplies all ten series, with all three providers healthy, and selects the actual `2026-Q2` shared anchor. Changing labour transmission updates computed room; changing general inflation alone leaves real room unchanged. Exported JSON reproduces all three paths exactly in the shared engine. Controls retain independent edits across scenario and module-tab changes; reset restores the preset. The Disruption preset's negative budget gap is retained. Empty anchors disable the engine, degraded sources show a caution, and an initial HTTP failure recovers on retry. Scenario charts support keyboard annual inspection. At 320, 390 and 768 px the page has no horizontal overflow; no browser page errors occur.

The complete Stage 1 browser regression also passes: history windows, income/wealth toggles, indicator/source inspection, Australia view (348 observations), module navigation, six homepage cards, missing data and retry. Source revision archiving is still unavailable in this preview; no permanent migration was applied during Stage 2. Verification artifacts and downloaded test runs are in the task's local visualizations folder, outside the application repository.

## Deliberately deferred

This stage is a transparent household-transmission experiment, **not a calibrated twenty-year macro forecast**. Sector weights and empirically estimated AI adoption, matched household microdata, regional commissioned capacity, hydrocarbon replacement/decline curves, endogenous financing and workload reactions, household tariff lags, monetary-policy responses, forecast probabilities and investment valuations remain unimplemented. Quarterly near-term nowcasts would require compatible inputs; this first engine uses annual steps throughout. Australia stays a separate observed-data lens; US-referenced toy scenarios are not relabelled Australian projections.

Stage 3 should connect observed stress evidence to explicit trigger/confirmation/disconfirmation rules. It must distinguish a synthetic scenario budget gap from a confirmed current household or regional power watch.
