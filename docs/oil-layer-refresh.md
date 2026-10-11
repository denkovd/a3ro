# Oil layer refresh

The oil tracker now keeps crude benchmark prices at the map's bottom-left and
uses the intelligence rail for the selected asset. Mobile uses a separate map
and scrollable intelligence sheet, so the price dock stays above the sheet.

## Delivered

- WTI and Brent price dock, observation timestamps, quote status, price history
  and changes against an explicitly identified prior daily close.
- Selection details for refineries, corridors, producers, routes and gates.
- Ten operator/government-sourced refinery references, clustered square markers, capacity
  sizing, a facility picker and an operating-event timeline.
- Confirmed Grangemouth and Phillips 66 Los Angeles closures, Benicia idling,
  and sourced Bapco group disruption/recovery reports. Other facilities have
  unverified operating status; published capacity never implies current throughput.
- US and PADD 3 refinery utilization, US gasoline/distillate inventories, crude
  inventories and exports, each with source periods and selectable histories.
- A matched-date EIA spot 3:2:1 margin proxy labelled as New York Harbor product
  prices against Cushing crude, rather than a Gulf facility margin.
- Composite stance and stress scores removed from the oil interface. The oil
  client no longer requests the composite tape or scores. Backend scoring and
  other market surfaces remain available.

## Data quality

Observation freshness uses source periods, with a 14-day allowance for weekly
measurements, 7 days for daily spot products, and 75 days for monthly port data.
Fetching an old observation does not renew its validity. Old physical readings
are retained as inspectable history, but cannot colour current map traffic or
support a present-tense margin signal. The all-stale overview collapses the old
readings. Quote refresh failures and physical refresh failures are independent.

Refinery references live in `lib/oil/refineries.ts`, reviewed
on 2026-10-10. Each record carries its operator source, capacity basis and review
date. Coordinates are approximate site/complex locations. Singapore combines
two sites; Jamnagar represents a complex. Capacity bases differ and should not
be aggregated into an estimate of currently available global capacity.

Sources: [Reliance](https://www.ril.com/businesses/energy/refining-marketing),
[KNPC Mina Al-Ahmadi](https://www.knpc.com/en/our-business/oil-refining/mina-al-ahmadi-refinery),
[KNPC overview](https://www.knpc.com/en/about-us/who-we-are),
[ExxonMobil Singapore](https://corporate.exxonmobil.com/locations/singapore/our-operations),
[Marathon Galveston Bay](https://www.marathonpetroleum.com/Operations/Refining/Galveston-Bay-Refinery/),
[Petroineos Grangemouth](https://www.petroineos.com/refining/grangemouth/).

## Event ingestion and storage

Refinery evidence is stored in `public.oil_refinery_events`, with source checks in
`public.oil_refinery_source_checks`. Migration:
`supabase/migrations/20261010054008_oil_refinery_events.sql`, followed by
`20261010060751_oil_refinery_publication_dates.sql` for nullable publication dates
(generated with the Supabase CLI). Undated operator pages retain the event month
without inventing a publication date. Both tables enable RLS and revoke browser-role privileges; the
public Next.js read endpoint uses the server database connection. Role-access
checks passed against the configured database.

The ingestion verifies explicit interpretation rules for five known official
statements. Bapco index discovery finds related operator updates and records them
as notices, without inferring an outage or available capacity from a headline.
The Bapco website sometimes redirects automated requests to a bot-verification
page. Those attempts are reported as failures and never renew prior evidence.

Facility, unit and group scopes remain distinct. Temporary conditions expire
using the publication/event date and verification age. Closures/idling persist
until a later applicable facility event supersedes them. Planned changes do not
replace existing operating conditions. Repeated evidence IDs are upserted;
incident IDs link related reports. No unavailable-capacity total is inferred.

Additional sources:
[Valero Benicia](https://www.valero.com/about/locations/benicia-refinery),
[California Energy Commission refinery references](https://www.energy.ca.gov/data-reports/energy-almanac/californias-petroleum-market/californias-oil-refineries/california-oil),
[Phillips 66 results](https://investor.phillips66.com/financial-information/news-releases/news-release-details/2026/Phillips-66-Delivers-Strong-4Q-Operating-Results-While-Enhancing-Portfolio/default.aspx),
[Bapco disruption](https://www.bapcoenergies.com/media-centre/press-releases/bapco-energies-declares-force-majeure-situation-on-the-groups-operations),
[Bapco recovery](https://www.bapcoenergies.com/media-centre/press-releases/bapco-energies-board-reviews-business-recovery-and-group-performance),
[ADNOC Ruwais](https://www.adnoc.ae/en/adnoc-refining/about-us/locations).

## Feed repair

Database source-health records showed no successful oil polls after 29 July
2026. Production variable-name inspection confirmed `EIA_API_KEY` exists but
`CRON_SECRET` is absent. The production cron guard returns 503 when that secret
is missing. Production secret-value retrieval was rejected by automatic approval
review and was not performed.

Official EIA workbook downloads now provide a fallback when the local API key is
absent. The parser verifies the workbook source key and decodes serial dates in
UTC, rather than allowing local-time shifts. The focused refresh restored October
prices, physical observations, shipping data and port statistics in the existing
database. Futures quotes are labelled separately from daily physical-spot history;
cross-basis price changes are suppressed.

The dedicated oil cron runs at 06:05 UTC daily, with price and physical pipelines
started independently in parallel. The dedicated refinery cron runs at 06:15 UTC
daily. Both are isolated from unrelated asset ingestion. The existing shared
ingestion route has a 300-second budget; its manual production check timed out
after successful price polls. The dedicated oil job prevents the shared job's
remaining market cycles from consuming the oil refresh budget.
Production activation completed on 2026-10-10 after user approval. A generated
`CRON_SECRET` is stored as a sensitive Production variable. Deployment
`dpl_8zznwCjWGNhUeEwAezav7pYJDHTU` is READY and serving `a3ro.com.au`.
The remote production build passed using Next.js 14.2.35. Public oil read APIs
returned 200, unauthenticated ingestion/refinery cron requests returned 401,
and an authenticated refinery refresh on the initial release returned 200 with independent source
checks. Production EIA and market-price polls recorded fresh successes.
The temporary local verification copy of the generated cron secret was removed.
The final isolated oil route was checked locally; its unauthenticated production
request returned 401. A new authenticated production invocation of that route
was not performed: automatic approval review rejected a proposed credential
rotation for verification because it could disrupt live authentication. The
original configured production secret remains unchanged.
The subsequent normal-network pipeline check succeeded for both price sources
and all five physical adapters: 582 physical records were upserted, and both
benchmarks re-resolved 12 daily closes. Its nonzero exit reflected only Bapco
verification-page failures. The final deployment error scan returned no records.

Protected staged checks were rejected by automatic approval review because
Vercel CLI could create/use a deployment-protection bypass token. Verification
continued through the public production domain. No protection settings were
weakened. `.vercelignore` excludes local credentials, build caches and old worktrees.

## Verification

- `npm run test:oil`: price basis, quote semantics, stale metrics, matched margins.
- `cd backend; npx tsx --test tests/refineries.test.ts tests/eia.test.ts tests/eiaCorridor.test.ts tests/eiaInventory.test.ts tests/eiaSpotProducts.test.ts`: evidence expiry, scope, chronology, provider isolation and public EIA downloads.
- `cd backend; npx tsx scripts/verify-refineries.ts`: live table/RLS/client-role checks.
- `npx tsc --noEmit` and `npm run build`: compilation.
- Browser: current physical observations, closure filter, sourced Bapco chronology,
  benchmark basis labels, desktop and mobile selection.

Global coverage remains partial. The next layers are product export flows and
terminals, broader regional throughput, processing-unit/crude compatibility, and
pipeline/bypass capacity.

## Continuation · 11 October 2026

The prior implementation is preserved in commit `569d6f0`. A public check found
that a later production deployment (`dpl_9CTdQ9X8v4WYDDZo9FNECDgxPNEH`) had
replaced the oil release: `/api/oil/refineries`, `/api/cron/oil` and
`/api/cron/refineries` returned 404. The domain was reachable, but the isolated
jobs could not run from that deployment. Existing database checks were last
updated by the 10 October manual refresh; they do not prove scheduled execution.
The user authorized publication of the validated continuation build.

Coverage expands to 15 references with Al-Zour, YASREF, Dangote, Sarroch and Haifa
Bazan. New references were reviewed on 11 October. Sources:
[KIPIC February 2025 magazine](https://kipic.com.kw/wp-content/uploads/2025/02/Kipic-2025-Feb-eng.pdf),
[YASREF](https://www.yasref.com/about-us),
[Dangote](https://www.refinery-dangote.com/),
[Saras](https://www.saras.it/en/what-we-do/refining), and
[Bazan 2025 annual report](https://media.bazan.co.il/bazan/media/qlhn0z05/bazan-q4-2025.pdf).

Bazan history covers Q1 2025 unit maintenance, the June conflict shutdown, and a
March 2026 group disruption/recovery statement. Publication dates remain null:
the report's approval date is not asserted as its publication date. The Q1
maintenance month marks the start of the reported quarter. Unit nameplate
references are separate from reported unavailable capacity; conversion and
distillation capacities overlap and must not be added. Product impacts and
restart dates remain unconfirmed where the source does not quantify them.
These PDF entries are manually reviewed history, excluded from automated HTML
verification rules. `seed-reviewed-refineries.ts` stores them with their original
review date, without recording a successful live source poll.

Oil and refinery cron responses and logs now report provider counts, skipped
polls and healthy/degraded/failed outcomes. A resolved cycle with failed providers
is degraded; all failed providers return 503. Operational logs omit raw upstream
errors and credentials. `verify-oil-refresh.ts` queries existing database health
read-only. New source periods remain separate from fetch timestamps.

Local build repair: `baseUrl` is explicitly set to the project root so Next.js
resolves the existing backend path alias. Dependencies use the existing lockfile
(Next.js 14.2.35). Regional throughput beyond the US, product export/terminal
feeds, crude compatibility and pipeline/bypass capacities remain next stages.
