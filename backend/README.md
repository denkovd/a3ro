# Oil Tracker backend

Crude oil price ingestion for the A3RO Oil Tracker. Pulls from free APIs
now (EIA is live; FRED / yfinance / Alpha Vantage are templated), designed
so adding or swapping a source — including paid feeds later — touches
**one adapter file + one registry line + one DB row**, nothing else.

```
backend/
├── migrations/001_init.sql     schema + rationale (Postgres; see header comment)
├── docs/RULES.md               ★ normative spec: staleness / fallback / conflicts / alerts
├── scripts/run-ingest.ts       dev entrypoint: npm run ingest
└── src/
    ├── core/                   domain: NO I/O, NO provider knowledge
    │   ├── types.ts            canonical PriceRecord, SourceError taxonomy, descriptors
    │   ├── units.ts            anything → USD/bbl (negative prices are legal)
    │   └── time.ts             market-close instants, business days, staleness
    ├── sources/                one file per provider, nothing else
    │   ├── OilPriceSource.ts   the contract + BaseSource plumbing (read first)
    │   ├── eia.ts              ★ REFERENCE ADAPTER — copy this structure
    │   └── registry.ts         wiring + TODO table for remaining adapters
    ├── ingest/
    │   ├── rateGate.ts         DB-backed rate gate + circuit breaker
    │   ├── resolve.ts          many observations → one answer (ticker + daily close)
    │   └── pipeline.ts         the cycle: poll → store → resolve → alert
    ├── storage/
    │   ├── db.ts               Queryable interface (driver-agnostic) + pg wiring
    │   ├── priceRepo.ts        all price/health SQL
    │   └── alertRepo.ts        all alert SQL
    └── alerts/rules.ts         threshold logic (pure functions; no delivery)
```

Layering rule: `core` imports nothing. `sources` import core only.
`ingest`/`alerts` import core + storage interfaces. Only `storage` writes SQL.
Only `pipeline.ts` composes the layers. If a change crosses these lines,
it's in the wrong place.

## Run it

```bash
cp .env.example .env            # set DATABASE_URL + EIA_API_KEY (both free)
npm install
npm run migrate                 # or paste migrations/001_init.sql into your PG console
npm run ingest                  # one full cycle, prints a CycleReport
npm run typecheck
```

## Consuming from the Next.js app (App Router, verified)

The A3RO frontend is Next.js 14 App Router on Vercel — the examples below
assume exactly that. The package is import-ready from route handlers (add
`"@a3ro/oil-backend": ["./backend/src"]` to the root tsconfig `paths`, and
`pg` to the root deps):

```ts
// app/api/oil/latest/route.ts
import { createDb, getLatestQuotes } from "@a3ro/oil-backend";

// REQUIRED: `pg` speaks raw TCP, which Vercel's Edge runtime cannot do.
// Every route/cron handler that touches storage/ must pin the Node runtime.
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await getLatestQuotes(await createDb()));
}
```

If an Edge deployment is ever wanted, swap the driver inside
`storage/db.ts` for Neon's serverless driver (`@neondatabase/serverless`,
HTTP/WebSocket-based — note `@vercel/postgres` is deprecated, don't use it).
It satisfies the same `Queryable` interface, so nothing outside `db.ts`
changes.

### Cron schedule (plan-dependent — this is a deploy-time constraint)

Vercel **Hobby only allows daily cron**; any more frequent expression
fails the deployment itself, not at runtime. Daily is also all the current
sources deserve: EIA and FRED publish once per business day.

```jsonc
// vercel.json (repo root) — Hobby default
{
  "crons": [{ "path": "/api/cron/ingest", "schedule": "0 6 * * *" }]
}
```

(Hobby cron timing is best-effort within the hour, which is fine here.)

**Pro-tier upgrade path:** the 10–15 min schedule
(`"*/10 * * * *"`) becomes worthwhile only when an intraday source is live
(yfinance adapter, or a paid live feed) — until then it just burns invocations
re-reading yesterday's settlement. Upgrade trigger: intraday source ships, or
traction justifies $20/mo. The cron route itself is identical on both plans
(`export const runtime = "nodejs"` + one `runIngestionCycle(db)` call);
only the `vercel.json` schedule string changes.

## Adding an adapter (the deferred, mechanical work)

1. Read `sources/OilPriceSource.ts` (the contract) and `sources/eia.ts`
   (the worked example), plus the TODO table in `sources/registry.ts`
   (priority / role / limits are already decided there).
2. Create `sources/<provider>.ts`: extend `BaseSource`, fill the descriptor,
   implement `fetchLatest` + `fetchRange` using `this.getJson()` and
   `this.toRecord()`. All quirks stay inside the file.
3. Map provider failures onto `SourceErrorKind` honestly — the kind decides
   fallback behavior (RULES.md §2.2).
4. Register it in `registry.ts`. Its DB row is already seeded by the migration.
5. Add fixture-based tests for the parser (also deferred work).

Never: convert units inline, invent timestamps, compare live to settlement
prices, write SQL outside `storage/`, or catch-and-swallow errors in adapters.

## Deferred work checklist (from the handoff brief)

- [ ] `sources/fred.ts`, `sources/yfinance.ts`, `sources/alphavantage.ts`
- [ ] REST route handlers (read via `priceRepo` only; pin `runtime = "nodejs"`)
- [ ] Vercel cron wiring (`app/api/cron/ingest` + `vercel.json`, **daily** schedule — Hobby limit; see Cron schedule section)
- [ ] Alert delivery worker (consume `alert_events where delivered_at is null`)
- [ ] Parser fixture tests; Dockerfile if ever deployed standalone
