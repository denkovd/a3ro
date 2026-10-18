# Macro Horizon: measurement, scenarios and stress

Design proposal, 16 October 2026. Horizon: 2026–2046.

> Can AI increase society's productive capacity faster than energy constraints, concentrated ownership and institutional adjustment undermine broadly shared living standards?

## Product decision

Build a structural outlook with three linked views: what is happening, what could happen under explicit assumptions, and where constraints are likely to bind. Keep a separate record of what markets appear to expect. A growing economy, deteriorating household finances and rising equities can all be valid readings at once.

Start with a US measurement core, an explicitly separate Australian household and power-system lens, and global energy context. Country-specific income, inflation, currency and electricity definitions remain separate. This is a proposed first scope, not a claim that US indicators describe the world.

The first release should answer four concrete questions:

1. Is productive capacity improving?
2. Are lower- and middle-income households receiving an improvement in living standards?
3. What physical, financial or institutional constraint could interrupt either improvement?
4. Which observations would change our preferred scenario?

Do not combine these into an unexplained salvation/collapse score. A useful headline is a descriptive state such as “productivity improving; household gains uneven; power constraints concentrated in selected regions,” with dated evidence behind each clause. It must not be generated before the necessary observations exist.

## 1. Measure outcomes and mechanisms separately

### Outcome: household purchasing power

Use published real, household-size-adjusted disposable income by income group as the first distributional anchor. Prefer bottom 40%, middle 40% and top 20% only when the source definitions permit aggregation. Aggregate underlying amounts with the correct weights; do not average medians. Income ranks describe changing groups, not a longitudinal panel of the same people.

Add real consumption, essential-cost burden, hours worked, unemployment/underemployment and financial distress. Income can rise while employment security deteriorates. Spending financed by borrowing is not equivalent to rising income. Wealth gains are separate from spendable cash income.

The most intuitive proposed household diagnostic is **spending room after essentials**:

```
nominal spending room = cash income after direct taxes and transfers
                       − essential cash expenses

real spending room = nominal spending room / chosen residual-consumption price index
```

Define essentials consistently: housing, utilities, basic food, necessary transport, out-of-pocket health and essential childcare, with geography and household composition recorded. Costs need category weights and price levels or expenditure levels, not just inflation rates.

Keep two distinct products:

- A living-standard measure using a documented consumption framework.
- A cash-flow stress measure including contractual debt payments. Mortgage principal reduces available cash but also builds equity, so it must not silently become a consumption cost. Prevent housing payments or interest from being subtracted twice.

Do not subtract nominal expenses from an already-deflated income series. Deflate after subtracting matched nominal amounts, or put all components in the same real units. Some national-accounts disposable income includes noncash items, so it cannot automatically serve as a cash-income numerator.

Directly observed household spending room requires compatible joint income/expenditure data. Until that exists, show published income and cost measures separately and label a synthetic budget as a modelled illustration. If baseline spending room is zero or negative, report currency amounts and burden ratios rather than a misleading percentage-growth index. Negative spending room must remain visible.

### Mechanisms: six measurement areas

| Area | Core observations | What the observations can tell us | Critical limitation |
|---|---|---|---|
| Productive capacity | Output per hour, multifactor productivity where available, output, hours, unit labour costs | Whether production becomes more efficient | Aggregate productivity gains cannot all be attributed to AI |
| AI adoption and economics | Surveyed business adoption by sector, paid usage where disclosed, company cash flow and capital expenditure | Whether deployment spreads and spending is supported by economic activity | Corporate capital expenditure is not all AI; announcements are not expenditure |
| Household distribution and ownership | Real disposable income by group, compensation, labour share, equity and wealth ownership | Whether income gains spread and who has exposure to capital gains | Wealth ranks, income ranks and AI-company ownership are different concepts |
| Energy and physical delivery | Regional load, accredited capacity, reliability assessments, generation, equipment/project schedules, fuel balances | Whether promised capacity can serve demand at the required place and time | Annual energy, peak capacity and transmission capability are separate constraints |
| Financial pressure | Household arrears, debt service, credit spreads, real rates, project financing, fiscal interest/revenue | Who becomes unable to finance the transition | Markets reflect expectations and risk preferences as well as underlying conditions |
| Institutional adjustment | Policy enacted/funded/delivered, retraining outcomes, housing and grid approvals, fiscal capacity | Whether institutions respond fast enough and who receives support | No universal institutional competence index can be inferred from these measures |

Productivity and household-income indexes can be displayed with a common base year to compare trajectories. Their difference is a diagnostic, not a national-accounting measure of wealth diverted to owners: denominators, population coverage, deflators, transfers and work hours differ. Use matched BLS productivity/compensation/labour-share concepts for decomposition and identify the price-index effect explicitly.

## 2. Source plan and what is genuinely available

The sources below were inspected as candidate datasets or documentation. This design review did not ingest their full histories, validate every endpoint or establish redistribution rights. Connector acceptance requires a real payload, metadata check and licensing review.

| Need | Primary source | Expected cadence | First-release treatment |
|---|---|---|---|
| US productivity and compensation | [BLS Productivity and Costs](https://www.bls.gov/news.release/prod2.htm), with FRED distribution where suitable | Quarterly, revised | Ingest matched series; retain vintages |
| US AI adoption | [Census BTOS downloads and questionnaires](https://www.census.gov/hfp/btos/data_downloads) | Core survey releases and separate supplements | Store exact question and population; break the series when wording changes |
| US distributional income | [BEA Distribution of Personal Income](https://www.bea.gov/data/special-topics/distribution-of-personal-income) | Annual; provisional and nowcast products differ | Preserve product type and household-size adjustment |
| Group-specific prices and spending | [New York Fed Economic Heterogeneity Indicators](https://www.newyorkfed.org/research/economic-heterogeneity-indicators) | Component-dependent | Use source group definitions and methodology |
| US wealth ownership | [Federal Reserve Distributional Financial Accounts](https://www.federalreserve.gov/releases/z1/dataviz/dfa/) | Quarterly estimates | Display wealth groups separately from income groups |
| US household spending weights | [BLS Consumer Expenditure Surveys](https://www.bls.gov/cex/) | Annual tables and survey products | Confirm group compatibility before building budget measures |
| US grid constraints | [NERC reliability assessments](https://www.nerc.com/our-work/assessments), regional system operators | Annual/seasonal, operator-dependent | Curated, sourced regional assessments initially |
| Generation project delivery | [Berkeley Lab Queued Up](https://eta.lbl.gov/publications/queued-2026-edition-characteristics) | Annual edition | Generation interconnection projects; not a national database of data-centre load connections |
| Oil and gas replacement burden | [IEA field-decline study](https://www.iea.org/reports/the-implications-of-oil-and-gas-field-decline-rates/executive-summary), EIA production/inventories | Study vintage plus weekly/monthly series | Keep field-decline assumptions and current observations distinct |
| Australian household pressure | [ABS Selected Living Cost Indexes](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/selected-living-cost-indexes-australia), ABS wages/labour/income | Series-dependent | Household types are not income quintiles; show the published categories |
| Australian electricity scenarios | [AEMO 2026 ISP](https://www.aemo.com.au/energy-systems/major-publications/integrated-system-plan-isp/2026-integrated-system-plan-isp) and regional operational publications | Report vintages plus operational releases | NEM scope explicitly labelled; other systems need separate data |
| SMR delivery and project economics | Developer disclosures, regulator/DOE records, customer filings | Event-driven | Curated milestone register, preserving the distinction between claimed and independently confirmed milestones |

BEA is particularly relevant: its portal provides distributional income, income-stratified price indexes, and a research joint distribution of income and consumption. Those products have different date coverage and preliminary status. Do not turn their published/nowcast distinction into an apparently live monthly series. [BEA documentation](https://www.bea.gov/data/special-topics/distribution-of-personal-income).

Every observation needs the reference period, publication time if available, retrieval time, revision/vintage, geography, population/cohort, units, deflator, seasonal adjustment, source and status. A forecast additionally needs its author, publication date, scenario and target period. Store prior vintages rather than overwriting history.

Display separate labels for published observations, official estimates/nowcasts, A3RO estimates, external projections and user scenario assumptions. A recent fetch does not make an old observation current. Missing or stale data cannot count as evidence that pressure has eased.

## 3. Build a linked scenario model

Use three user-facing families: **Broad gains**, **Uneven gains** and **Disruption**. Each family can contain several energy, policy and adoption variants. The middle family is the initial working hypothesis from the discussion, not a measured probability or an automatic midpoint between extremes.

### Time resolution

- Next 0–3 years: quarterly indicators and dated project milestones, with short-horizon forecasts only where validated.
- Years 4–10: annual conditional paths, sector adoption and capacity additions/retirements.
- Years 11–20: broad structural envelopes, transition alternatives and sensitivity analysis. Avoid exact recession or shortage dates.

Anchor scenarios to a common latest usable observation period. Show historical observations before that point and visually distinct projected paths after it. Do not imply observations extend through October 2026 merely because that is the review date.

### A. Adoption and productivity

Model adoption by industry with bounded diffusion, a delay between adoption and productive use, and sector weights. Separate a non-AI baseline from an assumed incremental AI effect. Track displacement, new tasks, retraining and total hours independently from output per hour.

The counterfactual path without additional AI adoption is uncertain. Present the difference as modelled incremental output, not as measured AI causation. Later research can use matched sector comparisons, controls and out-of-sample evaluation; the first release should not pretend to have identified a causal effect from correlated time series.

### B. Power demand and deliverable supply

```
data-centre annual energy = workloads × energy per workload × facility overhead

available dependable capacity next period
  = existing accredited capacity − retirements/deratings
    + newly commissioned accredited capacity

capacity shortfall = peak demand + required operating/reserve allowance
                    − available dependable capacity
```

Use consistent MW for capacity and TWh for annual energy. A source demand forecast that already includes data centres must not have them added again. A workload estimate of IT energy needs a facility overhead factor; a meter-level energy estimate already includes that overhead.

Track projects through announced, permitted, financed, under construction, commissioned and operational stages. Model delays using observed stage-specific completion experience or explicitly labelled assumptions. Developer announcements do not become delivered capacity. Avoid simply adding company forecasts that refer to the same facility.

Do not treat nameplate solar/wind capacity as continuously available, or fossil/nuclear capacity as perfectly reliable. Use local accreditation and operator reliability measures; track storage MW, MWh and duration separately. A screening model is not a full hourly grid-dispatch or reliability model. Annual energy sufficiency does not establish peak adequacy or local deliverability.

### C. Oil and gas

```
production next period = surviving production after decline
                         + additions − outages
```

Compare oil and gas separately against demand, storage, spare capacity and transport constraints. Use different field types and region-specific decline rates where available. Build high/low investment and substitution assumptions. Compute a supply shortfall or replacement requirement; do not derive a geological depletion date from a reserves ratio.

### D. Household transmission

For compatible household groups, model labour income, employment/hours, capital income, taxes/transfers and essential expenditure separately. Ownership affects exposure to capital income and asset valuation; it does not mechanically allocate every productivity improvement.

Use matched nominal cash flows before calculating purchasing power. Explicitly state how the energy shock reaches household bills, transport, food or rent, and its lag. Do not apply the same energy increase once directly and again through a full price index. Consumer price regulation, fixed contracts and fiscal transfers can change both timing and incidence.

The main scenario output is a range of household purchasing-power and burden outcomes, alongside aggregate production. Report distributional breadth as the population share in groups with improving outcomes when valid weights exist. That is group coverage, not proof that every household within those groups improves.

### E. Policy and feedback

Make institutional response observable where possible: trigger, announcement, enactment, financing, delivery and measured uptake. Project transfers, retraining and capacity support using explicit response delays and fiscal assumptions. Fiscal support must appear as a financing requirement; it cannot be free purchasing power indefinitely.

Preserve plausible feedbacks: stronger adoption raises demand for power; higher delivered costs can delay adoption; weaker labour income can trigger support; higher financing costs can delay energy supply; efficiency can reduce unit energy use while cheaper service expands usage. Parameters must not be sampled independently when the narrative requires them to move together.

Version one should expose this chain as transparent linked assumptions. Add estimated behavioural relationships only after a historical or empirical basis exists. Do not label it a solved general-equilibrium model.

## 4. Find stress through physical and household thresholds

Use a consistent record: **location/group → constraint → trigger → timing range → consequences → disconfirming evidence**. A global average cannot locate a grid bottleneck or identify households with high essential spending.

| Stress | Leading evidence | Confirmation | What would ease it |
|---|---|---|---|
| Regional power | Load commitments outpace deliverable additions; completion dates slip | Local reserve/reliability concern, connection delays, sustained delivered-price pressure | Energised capacity, verified demand response, slower actual load |
| Household purchasing power | Income growth falls behind the relevant essential basket | Shrinking real spending room plus employment/hours or arrears deterioration | Higher real income, lower essential burden, delivered support |
| AI investment economics | Spending commitments and debt rise faster than disclosed revenues/cash generation | Lower utilisation, cancellations, impairment or financing distress | Paid demand, improving cash generation, sustainable financing |
| Hydrocarbon supply | Replacement additions/investment weaken; outages or route constraints rise | Inventory depletion, spare-capacity pressure or sustained regional shortages | New supply, restored routes, substitution or lower demand |
| Ownership/distribution | Capital-income and wealth gains diverge from labour incomes | Persistent weak lower/middle household outcomes | Broader income gains, ownership participation or effective redistribution |
| Institutional response | Committed action remains unfunded or delivery dates slip | Pressure persists after the stated response window | Actual delivery and measured beneficiary outcomes |

For v1, expose observed quantities and operator thresholds. If a threshold is an A3RO design choice, name it as such and show sensitivity to alternatives. Do not label a percentile a crisis probability.

Suggested pilot alert rule: a **household pressure watch** requires falling real purchasing power in the available comparable periods plus deterioration in an independent employment or distress measure. Specify frequency and required persistence per source before evaluation. An annual distributional release cannot satisfy a supposed two-quarter rule without a separately validated nowcast. A revision must be capable of retracting a prior watch while preserving its history.

Measure lead time, false alerts and misses. Align thresholds to the use case instead of choosing parameters that make COVID or another known episode look perfectly predictable.

## 5. Quantify uncertainty without inventing precision

Launch with deterministic scenarios and sensitivity ranges. A scenario envelope is the range of chosen assumptions; it is not a 90% confidence interval. Do not show numerical scenario probabilities until a defensible estimation and calibration process exists.

Rank which assumptions change outcomes most: productivity diffusion, labour-income transmission, essential-cost growth, power delivery delays, refinancing costs and policy response. Show threshold-crossing windows across scenario paths, including “no crossing in this scenario.” If simulation is later introduced, report results conditional on the specified parameter distributions and correlations; simulation counts are not automatically real-world probabilities.

Use small, adverse combinations as well as one-variable tests: delayed generation plus high workload growth; productivity gains plus weak income transmission; an investment bust plus fiscal restraint. Preserve coherent demand feedback when prices rise or financing tightens.

## 6. User interface

Proposed route: `/Projects/Macro-Horizon`.

1. **Now:** productive capacity, household outcomes, binding constraints and data coverage. Headline statements link to evidence.
2. **Who benefits:** income groups, wages versus capital income, household-type and tenure views where data supports them. No fabricated cross-tabulation of separately published marginals.
3. **Future paths:** three scenario families, target years 2030/2035/2046, visible assumptions and sensitivity controls. Historical data and projections remain visually distinct.
4. **Stress points:** regional/sector/group watchlist with driver, trigger, timing window, exposure and relief conditions. Start with a sortable list; add maps only when reliable geographic coverage exists.
5. **Themes and expectations:** power equipment, grids, nuclear/fuel cycle, efficiency, automation and relevant commodity exposures. Separate fundamental exposure, execution milestones, market trend and valuation. A beneficial macro theme is not automatically a buy signal.
6. **Evidence and revisions:** source, vintage, methodology, prior scenario and the reason the view changed.

Example stress-card content is a template rather than a current assertion: “Region A: commissioned power additions trail committed load; trigger is reserve adequacy below the local operator's requirement; stress window shifts if Project B slips; confirmation requires updated operator data.”

The main value is showing how the state changes when an assumption changes, and which evidence would justify changing that assumption.

## 7. Fit with the existing codebase

Confirmed reusable foundations:

- `backend/src/sources/fredMacro.ts`: existing macro source adapter and series metadata. Reuse transport/parsing patterns; do not make the tactical ingest depend on every new structural source succeeding.
- `backend/src/sources/abs.ts` and `backend/src/australia/watch.ts`: official ABS ingestion patterns. Current configured Australia Watch indicators are headline/trimmed-mean inflation, unemployment and hours worked; distributional income and household-cost measures are additions.
- `backend/src/sources/eiaPublic.ts`: existing official EIA petroleum download parser. Electricity-system coverage requires separate series/adapters; it is not already supplied by that petroleum adapter.
- `app/components/projects/macro/macroData.ts`: snapshot normalisation and explicit loading/missing/error states.
- Existing Regime, Australia Watch and Commodity Watch pages: contextual links, with their different horizons retained.

Suggested additive modules:

```
backend/src/horizon/
  types.ts
  indicators.ts
  households.ts
  energy.ts
  scenarios.ts
  stress.ts
  evidence.ts

backend/src/ingest/horizonCycle.ts
backend/src/storage/horizonRepo.ts
app/api/horizon/latest/route.ts
app/api/horizon/scenarios/route.ts
app/Projects/Macro-Horizon/page.tsx
app/components/projects/horizon/
backend/tests/horizon*.test.ts
```

These paths are proposed, not implemented. Use the existing Next.js/backend architecture. Source retrieval and scheduled calculations run separately from page rendering; the page reads a dated snapshot. Small deterministic scenario calculations can run locally for responsive controls; validated shared domain code should produce the same result server-side. Bound user inputs and execution costs for any server scenario endpoint.

Keep observations, source projections, project milestones, scenario assumptions/runs and alert revisions separately identifiable. A scenario run records model version, exact input vintages, parameters and outputs. Preserve original source evidence where redistribution permits. Reports or corporate text may supply attributed facts, but must not silently rewrite calculation rules or thresholds.

No new database, deployment, recurring job or production allocation rule is required for this design phase.

## 8. Build order and acceptance gates

### Phase 1: measured baseline

Deliver a source registry, latest snapshots and historical charts. Initial automated candidates: productivity, real compensation, labour hours, inflation/essential categories, credit stress, real rates, published distributional income and wealth. Use a small curated power/project register until feeds are verified.

Acceptance: each displayed value has provenance, units, population and reference date; missing sources degrade independently; published, provisional and estimated values are distinguishable; US/Australian definitions stay separate; no present-day narrative is generated from stale indicators.

### Phase 2: inspectable scenario calculator

Deliver the three scenario families, household and power pathways, and sensitivity controls. Every assumption is editable or documented, and every headline can be traced to inputs.

Acceptance: dimensional checks; accounting consistency; no double-counted energy loads or household expenses; bounded adoption; negative household buffers preserved; reproducible saved runs; uncertainty labels match what was computed.

### Phase 3: stress watchlist and prediction ledger

Deliver dated triggers, locations/groups, transmission channels and revisions. Record forecasts before outcomes become available.

Acceptance: historical replay uses information available at the decision date; current revised history is labelled retrospective where original vintages do not exist; alerts are evaluated for misses, false alarms and lead time against simple alternatives.

### Phase 4: investment-theme layer

Connect observable constraints to firms and sectors, then to market trend and valuation. Track financed backlog, realised margins, funding needs, dilution and commercial milestones where data exists. Use existing tactical tools as context. No structural narrative automatically changes portfolio weights.

## 9. Validation

Test economic invariants and material failure cases, not decorative UI details:

- Zero growth and zero price change preserve initial household purchasing power.
- Higher matched income improves spending room; higher essential costs reduce it, all else equal.
- Increasing a source forecast that already embeds data-centre load cannot add that load twice.
- Delayed commissioning cannot increase available capacity before delivery.
- MW, MWh and TWh never mix without explicit conversions and duration.
- No observation published after a replay date enters that run.
- Missing or stale evidence cannot turn a stress state into a confirmed improvement.
- Higher income-group coverage requires valid population weights, not a count of differently sized groups.

Use rolling out-of-sample comparisons for any estimated forecast, with simple persistence/trend baselines. Test multiple episodes, including energy shocks, credit contraction and technology investment cycles. Historical analogue episodes evaluate mechanisms and robustness; they do not prove that a twenty-year AI forecast is accurate. Evaluate probabilistic calibration only if the product actually generates calibrated predictive probabilities.

## 10. Accompanying sensitivity demonstration

The conversation illustration is deliberately small and synthetic. It uses 2026=100, an illustrative starting household income of 100 units, essential budgets of 70 or 50 units, constant real productivity growth, an assumed income pass-through fraction and real essential-cost growth. Real units are measured against a fixed nonessential-consumption numeraire.

```
productivity index in year t = 100 × (1 + productivity growth)^t
household income in year t = 100 × (1 + productivity growth × pass-through)^t
essential cost in year t = initial essential cost × (1 + essential-cost growth)^t
spending-room index = 100 × (income − essential cost) / initial spending room
```

The two budgets are illustrative household types, not estimated income quintiles. The pass-through parameter is a sensitivity assumption, not an estimated causal coefficient. The presets demonstrate broad gains, uneven gains and stress; they have no probabilities. The tool omits employment dynamics, transfers, demographics, energy-system feedback and changing expenditure behaviour. It explains why productive capacity can improve while constrained households lose spending room. It does not supply the full production forecast or current economic readings.
