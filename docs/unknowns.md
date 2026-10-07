# A3RO unknowns register

Assessed October 7, 2026 from the local repository. This is an evidence-based
list of decisions and measurements still needed, not a claim that production
is broken. Production configuration, deployed versions, records, traffic,
billing, and scheduled-job logs were not inspected. The web tool could not
access the public homepage; that does not establish an outage.

## Resolve first

### 1. Are saved positions and theses intended to be public?

**Confirmed:** `app/api/portfolio/positions/route.ts` protects POST but its GET
has no auth guard. The GET handlers in `app/api/portfolio/risk/route.ts`,
`app/api/thesis/route.ts`, and `app/api/thesis/[id]/route.ts` also have no auth
guard. `writeAuth.ts` describes a single-operator dashboard and shared write
secret, rather than individual accounts. Hiding Thesis Lab on the homepage
does not remove its routes.

**Unknown:** Whether production contains private holdings, notes, or theses;
whether deployment-level access protection exists; whether this is intended
as a personal tool, public demo, or multi-user service.

**Resolution:** Decide the visibility contract, verify deployment protection
without retrieving private records anonymously, and protect private reads.
If multiple users are planned, design ownership and authorization before
collecting their data. This is the highest-priority product/security decision.

### 2. Which dependency versions are actually running?

**Confirmed:** Both the root manifest and lockfile select Next.js 14.2.35
(`^14.2.35` in the manifest), while the installed local package and builds
report 14.2.5. Local dependencies are out of sync with the lockfile. The
[official December 2025 advisory](https://nextjs.org/blog/security-update-2025-12-11)
lists an App Router denial-of-service fix in 14.2.35.

**Unknown:** The deployed package version and whether other installed
dependencies differ from their lockfiles. This local mismatch alone does not
prove that production uses the older version.

**Resolution:** Reconcile local dependencies with the lockfile using a clean
install, rebuild, and verify the deployed build's resolved versions and
current advisories. The earlier 173 → 146 kB comparison used the same local
14.2.5 installation; repeat measurements after reconciliation.

### 3. Can a missing or stale feed appear as a valid live number?

**Confirmed:** Gold's client normalizer turns absent/non-finite prices into
zero and absent changes into zero. Both Gold and BTC HTTP providers force
`source: "live"` on a successful response. Both snapshot endpoints label the
newest stored row as live. Source timestamps are passed through, but HTTP
success and provenance alone do not establish freshness or completeness.

**Unknown:** Frequency of partial/old snapshots in production and whether
every view clearly distinguishes fresh, stale, missing, and baseline data.

**Resolution:** Test partial responses, null prices, old timestamps, missing
tables, and provider failures at the API-to-UI boundary. Preserve missing
values rather than substituting financial zeroes. Set freshness budgets per
source and check the oldest/latest observation against those budgets.

### 4. Do the signals have demonstrated predictive value?

**Confirmed:** `backend/src/macro/regimeAffinity.generated.ts` exports an
empty derived table. `vams.ts` therefore falls back to hand-written affinities
for entries absent from the generated table. Allocation regime scores are
hand-written; `docs/regime-macro-refresh.md` calls them reasoned rather than
backtested and documents revised macro data as a bias in the affinity study.
Backtest code and fixture tests exist, which is different from having
validated results with real data.

**Unknown:** Whether the current deployed signals outperform relevant
benchmarks outside their development sample, and what their failure modes
are across different market conditions.

**Resolution:** Specify each signal's intended outcome and evaluation period,
then run time-separated evaluation with point-in-time data, explicit costs,
appropriate benchmarks, and reported uncertainty. Record sample sizes,
drawdowns, and failures. Do not present regime association as a forecast.

## Measure next

### 5. Are all refresh jobs finishing successfully and on time?

**Confirmed:** The ingest route sets a 60-second duration and sequentially
awaits many cycles, including price, corridor, baseline, seasonal, macro,
positioning, score, gold, gold-flow, BTC, BTC-flow, and Australia Watch work.
Separate try/catch blocks isolate thrown errors but do not reserve time for
later work if the function's overall deadline is exhausted. Scheduled jobs
are split between Vercel configuration and GitHub Actions.

**Unknown:** Per-stage production duration, deadline headroom, last successful
refresh by module, scheduler failures, and whether a healthy overall HTTP
response contains failed subcycles.

**Resolution:** Build a per-module freshness and job-health inventory using
existing logs: latest successful run, observation age, stage duration, failed
sources, next expected update. Split work only after identifying the stages
that actually exhaust the budget. Avoid triggering ingestion just to audit it.

### 6. Is the deployed experience fast enough for real visitors?

**Confirmed:** The local bundle comparison reduced homepage first-load JS
from 173 kB to 146 kB. No application performance or usage instrumentation
was found in the inspected source/package configuration. The build could not
download the existing Google Fonts stylesheet in this environment.

**Unknown:** Real-user loading, responsiveness, layout stability, slow-device
animation costs, API latency, and module-to-module differences. Deployment
analytics may exist outside this repository.

**Resolution:** Verify any existing analytics before adding another system.
Measure LCP, INP, and CLS per route and device, plus API latency. Use the
[Web Vitals field-measurement guidance](https://web.dev/articles/vitals).
Bundle size is evidence about bytes, not a measurement of user experience.

### 7. Will the next change be tested before reaching users?

**Confirmed:** The repo contains 44 backend `.test.ts` files and six recent
optimization tests. Its five checked-in GitHub workflows are scheduled or
manual data jobs; none is a build/test workflow for pull requests or pushes.
The current checkout is on `main`. Some data workflows commit cache updates
back to the repository. Earlier mission notes claiming no tests are obsolete.

**Unknown:** External branch protections/checks, rollback readiness, and the
current full backend test result. Running `npm test` in `backend/` failed
before test execution: tsx's `os.userInfo()` call returned
`uv_os_get_passwd` / `ENOMEM` in this environment. This is a runner failure,
not evidence of failing assertions.

**Resolution:** Restore a working test environment, establish a clean-install
build/test CI gate, verify branch rules, and rehearse reverting one coherent
change. Include the API-to-UI freshness/auth cases, not only engine tests.

## Decisions that code cannot answer

### 8. Which user and measurable outcome should drive development?

The owner clarified the direction after this audit: eventual monetization,
with substantial development first. The priorities are ease of use,
informative market intelligence, and alpha supported by demonstrated results
from established techniques. Thesis Lab is unwanted; the current state must
be pushed as a checkpoint before removing it. No feature removal is part of
this checkpoint.

The specific primary user, market, time horizon, and success measure still
need definition. A personal research tool, public lead generator, and paid
multi-user product require different navigation, permissions, reliability,
and data coverage. An established technique is a candidate for evaluation,
not proof that its implementation generates alpha.

Resolve this with one primary user and one primary outcome. Then measure
time to that outcome, useful module usage, repeat visits, and where people
leave. Also establish cost per active user/module from actual hosting,
database, and data-provider usage; no cost totals were available in this audit.

## Recommended order

1. Decide private-data visibility and verify actual deployed versions.
2. Verify data freshness and signal-validation claims.
3. Establish job-health evidence and the build/test gate.
4. Measure visitor performance and product usage against a defined outcome.

This audit changed no application behavior and ran no ingestion, migration,
or production data mutation.
