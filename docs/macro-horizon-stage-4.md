# Macro Horizon — Stage 4

Implemented 18 October 2026. Open `/Projects/Macro-Horizon` → **Themes & expectations**, or **04 Themes**.

## Delivered scope

Stage 4 is an investment-theme **research workbench**, not a securities recommendation engine. It connects the module's macro question to business exposure, execution evidence, funding questions, historical ownership participation, separate market trend and illustrative valuation expectations. It never converts a narrative or proxy warning into a buy score, portfolio weight, order or registered prediction.

Five themes:

1. Grids and electrical equipment.
2. Firm power and energy services.
3. Nuclear supply chain and reactor options.
4. Cooling and compute efficiency.
5. Industrial automation and productivity.

Each exposes the transmission hypothesis, possible value capture, thesis-breaking conditions, evidence still needed and three qualitative scenario hypotheses. These are A3RO analytical hypotheses, not estimates of company earnings sensitivity to the macro model.

## Primary-source research pack

Version: `horizon-themes-1.0.0`. Financial evidence was manually checked on **2026-10-18**. The pack is explicitly dated research, not a live fundamentals feed or a comprehensive investment universe. Quarterly reports/releases may be unaudited; a GAAP label describes accounting basis, not an audit opinion. The examples are not ranked or endorsed.

| Example | Exposure distinction | Primary source | Publication |
|---|---|---|---|
| ETN · Eaton | Diversified power management, not pure AI | [SEC Q2 release](https://www.sec.gov/Archives/edgar/data/1551182/000155118226000027/etn06302026exhibit99.htm) | 2026-07-31 |
| GEV · GE Vernova | Power/electrification/wind equipment and services, not commissioned local grid capacity | [SEC Q2 release](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000147/gevpressrelease2q26.htm) | 2026-07-22 |
| VRT · Vertiv | Digital-infrastructure power and thermal management | [SEC Q2 release](https://www.sec.gov/Archives/edgar/data/1674101/000162828026050323/q22026exhibit991vrt07292026.htm) | 2026-07-29 |
| BWXT · BWX Technologies | Government/commercial nuclear supplier, not a developer's first reactor | [Issuer Q2 results](https://investors.bwxt.com/news-releases/news-release-details/bwx-technologies-reports-second-quarter-2026-results) | 2026-08-03 |
| OKLO · Oklo | Development-stage reactor/fuel option, distinct from operating suppliers | [SEC Q2 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1849056/000162828026054571/oklo-20260630.htm) | 2026-08-07 |
| ROK · Rockwell Automation | Industrial automation, software and controls | [Issuer fiscal Q3 results](https://www.rockwellautomation.com/en-se/company/news/press-releases/Rockwell-Automation-Reports-Third-Quarter-2026-Results.html) | 2026-08-04 |

All six reference a June 2026 quarter end, but Rockwell calls it fiscal Q3. Oklo's cash-flow metrics are explicitly **six-month** figures, not a single quarter. Every displayed metric retains its units, flow start/end or balance-sheet date, and GAAP versus company-defined/non-GAAP basis. Financial inputs are curated in `backend/src/horizon/themes.ts` and shown with direct primary-source links.

### Accounting safeguards

- USD thousands in BWXT's detailed backlog table are converted once into USD millions; all financial display values retain their stated units and source precision.
- Company-defined segment/adjusted measures are not relabelled consolidated GAAP margins. Derived margins use the explicitly named numerator and denominator, so a net margin, operating margin and pre-tax margin are not interchangeable or ranked against each other.
- Historical weighted-average share counts compare matching prior-year quarters. They are not period-end outstanding shares or future dilution estimates. Missing share data remains unreviewed, not zero dilution. In a loss period, basic/diluted share equality can exclude anti-dilutive securities and is not a fully diluted future ownership estimate.
- Restricted cash is not folded into the stated unrestricted cash/equivalent line. Marketable-securities purchases are not presented as operating/project burn. A cash balance and historical cash use do not establish fully financed construction or a guaranteed runway.
- Company backlog, orders and remaining performance obligations are not independently verified customer-project financing. **Financed backlog remains explicitly unverified for all six examples**, with company-specific research questions rather than a fabricated funded percentage.
- Quarterly cash flow is not automatically annualised. No spot price is divided by quarterly EPS, and no current P/E or target price is invented.

### Milestones and review dates

Commercial milestones have one of three types: **reported**, **management target**, **research required**. A reported event must have a date no later than the source publication; invalid/future reported dates require verification. A management deadline passing never proves completion. For example, the source's gas-turbine manufacturing target is tracked as a target whose achievement is unverified, not as commissioned generation. Acquisition closes after quarter end remain dated subsequent events, not Q2 operating achievements.

Research availability requires publication and checking dates not to be future-dated and checking not to precede publication. The UI marks a review due after **120 days from publication or 90 days from checking**. These are design heuristics, not release calendars. Old values remain visibly historical; unavailable future evidence is not presented as knowable at an earlier research date. This does not reconstruct historical publication vintages or create a point-in-time investment backtest.

## Connections to Stages 1–3

- Related Stage 3 cards are evaluated from the loaded baseline using the **default** Stage 3 settings, which are explicitly shown in exports and labelled in the UI. Custom stress-tab thresholds are not silently inherited. Physical, household and policy gaps remain gaps; electricity CPI cannot confirm a local power shortage.
- A failed/missing macro snapshot does not erase separately sourced company research. It removes the related rule/model quantities rather than implying that a constraint is cleared.
- Scenario quantities use the same lifted Stage 2 input state. Edits and resets change the theme's contextual output-per-hour, high-burden spending-room and normalised energy ratio. Qualitative narrative selection is separate from selecting an issuer. No macro number is multiplied into company revenue or a stock return.
- Operating suppliers and development options can be filtered separately. An empty filter says no curated example matches, not that the sector has no opportunities.

## Separate market context

The workbench reuses the existing read-only `/api/bull/latest?strategy=ml-dw` endpoint, shared snapshot transport and Bull Market Finder normalisation. It does not trigger a scan, write database rows or change the tactical engine. Only after this tab is opened is the trend read requested.

Per-symbol context requires exactly one matching row, valid non-future scan and close dates, positive finite close, both dates no more than **five calendar days** old, and formed daily/weekly directions (`+1` or `-1`). A close more than one day after the scan timestamp is rejected. The five-day window is a conservative design heuristic, not an exchange calendar. Invalid calendar dates, duplicate symbols, missing coverage, errors, stale rows and warming signals cannot become a bullish/bearish investment verdict.

The UI shows actual direction arrows, original scan/close dates, price basis (adjusted/unadjusted) and the last scan close—not an intraday quote. Trend is never merged with the fundamental story or valuation into a buy score. On refresh failure, retained old data is not treated as current valid context. Refresh respects the application's existing snapshot cache rather than triggering new provider/scan work. Direct links lead to the trend, earnings-evidence and US-regime modules; none is represented as a valuation model.

## Illustrative valuation lab

This is a generic **positive-earnings per-share identity**, not an actual valuation of the selected issuer. All six inputs are assumptions and remain independent of the selected company's price, quarterly EPS, historical share change or analyst estimates. The lab is unavailable for the development-option example rather than assigning a meaningful positive P/E to a loss-making issuer.

Inputs: entry P/E, assumed exit P/E, **aggregate common earnings** growth, separate share-count growth/dilution, whole holding years, and a required annual price-change hurdle. Bounds reject nonfinite/coerced values, missing/unknown/inherited keys and fractional holding years. Shares and earnings must not both be described as per-share growth: dilution is applied exactly once.

With rates as fractions:

```
earnings factor = (1 + aggregate earnings growth) ^ years
share factor = (1 + share-count growth) ^ years
multiple factor = exit P/E / entry P/E
terminal price / entry price = earnings factor / share factor × multiple factor
annual price change = (terminal / entry) ^ (1 / years) - 1

aggregate earnings growth required for price hurdle
  = (1 + required annual price change) × (1 + share-count growth)
    × (entry P/E / exit P/E) ^ (1 / years) - 1
```

The earnings basis must be consistent at entry and exit. No dividends, buyback costs, financing feedback, taxes, FX or transaction costs are modelled. Assumed earnings growth must already incorporate whatever funding effects the user intends; the tool does not solve the sources and uses of capital. It is not a DCF, total-return forecast, capital plan, current market multiple or price target.

Positive aggregate earnings growth can coexist with a negative conditional price outcome when multiples compress or ownership is diluted. Negative outcomes are retained. A favourable calculation or meeting the selected hurdle is never a buy recommendation. A bounded three-by-three sensitivity grid perturbs earnings growth by ±5 percentage points and exit P/E by ±5 turns, deduplicating/clipping at bounds; other inputs stay fixed. The grid is not a confidence interval or probability distribution.

## Export and boundaries

The research-pack JSON records schema/model version, export/check dates, selected theme and example, exact company facts and sources, derived arithmetic, milestone classifications, dated macro snapshot and default-rule settings, selected scenario and its exact assumptions/path, illustrative valuation assumptions/output/sensitivity (or null when inapplicable), loaded trend rows/context/status and `allocationChanges: false`.

Selection and lab edits persist while switching tabs within this page; reload restores defaults. Export creates a local browser download. Stage 4 does not write local storage, alter Stage 3's prediction ledger, store new permanent database records, schedule an automation, submit orders or change portfolio weights. No migration or deployment is required.

## Validation

Twenty domain tests cover registry provenance and period/units, manual-review aging, unavailable future evidence, milestone types/deadlines, backlog units, six-month negative cash flow, missing/future dilution, margin definitions, strict valuation inputs, neutral and growth identities, one-time dilution, negative price outcomes, algebraic hurdle reproduction, monotonic sensitivities, finite corners, immutable JSON reproduction, independent trend directions, missing coverage, stale/future/invalid dates, malformed prices, warming signals and duplicate scan identity.

Browser verification follows: module → baseline context + existing trend API → primary company cards → shared scenarios → assumption lab → reproducible research download. It checks issuer/theme/stage controls, source links, milestone states, no meaningful P/E for the development option, missing baseline independence, missing/stale/failed trend isolation, keyboard controls, desktop/mobile layouts and retention of previous-stage behavior. Executed results are recorded after the checks, not assumed from compilation.

### Executed results

- All **569 backend tests pass**, including the 20 Stage 4 tests. Root/backend TypeScript checks, 11 landing tests, six optimisation tests, diff whitespace checks and the production build pass.
- The actual baseline API provides all ten series. The existing trend endpoint returns a dated 2026-10-16 scan; four of the six curated examples are covered and two are honestly marked as absent from that scan, not assigned synthetic signals.
- Headless Edge verifies all five themes and six source-linked company cards, milestone deadline handling, operating/development filtering, the loss-making option's positive-P/E block, and explicit missing funded-backlog evidence.
- Keyboard changes to entry multiple and dilution reduce the conditional result as expected, including negative price outcomes; the required-price hurdle changes required earnings, not the already specified price path. Reset and cross-tab-view state retention work. Exported valuation and company arithmetic reproduce exactly; default-rule macro context is also reproducible.
- Stage 2 edits flow into theme scenario quantities but do not change the illustrative issuer-independent valuation assumptions. Custom Stage 3 thresholds are not silently inherited. No non-GET module API requests or prediction-ledger writes occur in the theme flow.
- Missing baseline evidence leaves company research available without modelled macro quantities. A failed trend request recovers on retry without erasing research; stale scan data is not presented as current. An isolated future-clock check marks expired manual research as historical/review due.
- At **320, 390 and 768 px**, including expanded company milestone and valuation-sensitivity content, there is no page-level horizontal overflow. Desktop/mobile screenshots are inspected and the final browser report has zero page errors. Test exports and reports are saved in the task's local visualizations directory, outside the application repository.
- All Stage 1, Stage 2 and Stage 3 browser suites also pass on the final build, including source/baseline controls, scenario accounting/export, local prediction persistence, corruption/quota handling and outcome revisions.
- Initial JS remains **107 kB** for Macro Horizon and **146 kB** for the homepage. The theme workbench and its additional trend request load only on first opening its tab. No permanent database migration, production deployment, scan trigger or allocation change is performed. The separate Stage 1 revision archive is still unavailable in this preview.

## Deliberately not claimed

This first theme layer is not a continuously refreshed company financial warehouse, an independently financed-project registry, a fully diluted capitalisation model, a matched live valuation feed, a security-selection backtest or a calibrated recommendation system. No region is assigned commissioned power from company manufacturing/shipment figures. No reactor is assumed commercially licensed, fully fuelled, financed or capable of using waste merely because a nuclear narrative is attractive. Those remain design/project-specific research gates.
