# Macro Horizon — Stage 1

Implemented 18 October 2026. Route: `/Projects/Macro-Horizon`.

## Delivered

- Homepage module card and module-switcher entry.
- Ten US indicators from direct BLS, BEA and Federal Reserve downloads.
- Productivity and real compensation indexed at their first shared quarter.
- Separate income- and wealth-distribution charts, preserving their different populations and frequencies.
- Five- and ten-year history windows, keyboard-inspectable charts, all source observation values, definitions and reference periods.
- Australian inflation/labour lens reusing Australia Watch and its ABS data.
- Explicit source health, estimated observation freshness, unavailable states and methodology limits.
- Content-addressed source vintages and fetch-run records, an isolated ingestion cycle and a migration with RLS enabled.

The baseline does not estimate AI's causal contribution, calculate household spending room from incompatible data, produce future scenarios, issue stress alerts or change allocation weights. Those remain subsequent stages.

## Sources

| Source | Indicators | Download |
|---|---|---|
| BLS | Output per hour, real hourly compensation, unemployment, electricity CPI | Batched public API; current ten-year inclusive window |
| BEA | Real median disposable income in 2017 dollars; bottom 40%, middle 40% and top 20% shares of disposable income | National distribution summary CSV |
| Federal Reserve | Top 1% and bottom 50% shares of net worth | DFA ZIP, net-worth-levels CSV |
| ABS | Existing Australia Watch inflation, unemployment and hours | Existing application snapshots |

BEA groups use equivalized disposable-income ranks. Bottom 40% adds the 0–20 and 20–40 quintile shares; middle 40% adds the 40–60 and 60–80 shares. Decile shares are not added a second time. Real median national-accounts disposable income includes noncash concepts and is not a household cash budget.

The Federal Reserve top 1% combines `TopPt1` and `RemainingTop1`, divided by total net worth across all five mutually exclusive wealth groups. Quarterly values are official estimates. Income and wealth group memberships are not interchangeable.

The BLS real compensation measure uses consumer prices, while output-per-hour uses a different output-price concept. The indexed difference is descriptive and cannot be interpreted as an amount captured by capital owners.

Annual changes require the exact same reference period one year earlier. Rates/shares use percentage points; positive level indexes and real-income levels use percentage changes. Missing comparison periods remain missing. BLS annual averages are excluded from monthly and quarterly histories.

## Refresh and archiving

`GET /api/horizon/latest` reads the revision archive when available. If the archive is absent, incomplete or overdue, it checks official sources through independent six-hour caches, appropriate to these monthly/quarterly/annual releases. Source errors do not erase the available readings from other providers. Failed cache computations can be retried. The public read route does not write database records.

The existing daily ingestion route includes `runHorizonCycle`, isolated from other modules. A retrieval stores a new full source vintage only when its content changes; repeated content advances verification time. Fetch records retain the content fingerprint, including when a source reverts to an earlier version. Readings are selected by latest verification, not first vintage creation.

Apply `supabase/migrations/20261018031814_macro_horizon_baseline.sql` through the project's normal migration process before enabling persistent archiving. The tables are accessible through the privileged server connection and have RLS enabled without public Data API policies. Deploying the source code does not itself apply the migration.

Source downloads do not establish historical publication timestamps. Archive timestamps mean first observed or last verified by this application, not original publication. Historical charts show the current retrieved revision; this release has no historical as-of/replay endpoint.

Freshness windows are documented heuristics from reference-period end: monthly current through 75 days, aging through 110; quarterly current through 170, aging through 230; annual current through 660, aging through 790. A source can be healthy while its observations are stale. A failed latest source check prevents a stored reading from counting as verified-current.

## Commands

From `backend/`:

```
npm run run:horizon
npm run run:horizon -- --archive
npm run verify:horizon
npx tsx --test tests/horizon.test.ts
npm run typecheck
```

The default refresh only checks sources. `--archive` persists observations and requires the migration and `DATABASE_URL`. `--output <path>` saves a local verification snapshot. Use a scratch/output location for that file.

`verify:horizon` creates session-only temporary tables using the migration, verifies revision behaviour and RLS, then disconnects. It leaves permanent database tables unchanged. Its temporary-table adapter rewrites the public schema to the current session's temporary schema.

On the development computer, Node HTTPS requires the Windows certificate store. For verification use `node --use-system-ca --import tsx scripts/run-horizon.ts` or `node --use-system-ca --import tsx scripts/verify-horizon.ts`. Certificate checking remains enabled; this is a local trust-store setting, not a production application change.

For an isolated application build, set `A3RO_BUILD_DIR=.next-horizon-review`. Start the resulting build on an unused local port. No production deployment is part of this stage.

## Verification completed

- All ten US series were fetched from their official sources and rendered through the real API.
- PostgreSQL verification passed using session-only temporary tables, including revision/reversion ordering, idempotency and RLS.
- All 505 backend tests passed, including 17 dedicated Horizon tests; application and backend TypeScript checks passed.
- Homepage sequence tests passed for six modules; browser checks confirmed the module card and switcher navigation.
- Browser checks passed for history windows, income/wealth switching, observation selection, keyboard chart inspection, source definitions, Australian data, unavailable data and HTTP error/retry.
- Widths 320, 390, 768 and desktop were checked; no horizontal overflow or uncaught browser errors were found. The Australian lens read 348 stored observations during verification.
- Production build passed. Homepage first-load JavaScript remained 146 kB; the new module was 106 kB on first load.

Persistent public-schema migration, production deployment and Stage 2 remain separate actions. The verified local preview uses current official source reads while the revision archive is unavailable.

## Next stage

Stage 2 adds explicit Broad gains, Uneven gains and Disruption scenarios anchored to these dated observations. The first scenario implementation should model household income transmission and essential-cost sensitivity with accounting checks, then add adoption, power delivery and policy responses. It must preserve the distinction between measured history and assumption-driven future paths.
