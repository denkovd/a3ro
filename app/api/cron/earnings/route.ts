/* ────────────────────────────────────────────────────────────────
   Vercel cron entrypoint: Earnings-Beat Tracker Flow A (architecture
   spec §2 "Flow A — Weekly incremental").

   Invoked by Vercel Cron per vercel.json schedule ("0 6 * * 6" —
   Saturday 06:00, a couple of days after the busiest report days so
   actuals have settled, per the spec). Fully idempotent; re-running
   any number of times converges to the same state (§2 "Idempotency
   guarantee").

   Also runs the nightly reconcile for under-4-quarter tickers (§2
   Flow B: "or as a nightly reconcile for tickers with < 4 cached
   quarters") in its own try/catch, so a backfill hiccup can never
   fail the weekly incremental pull.

   Auth: same CRON_SECRET guard as /api/cron/ingest.
──────────────────────────────────────────────────────────────── */

import {
  createDb, runWeeklyIncremental, reconcileUnderfilledTickers,
} from "@a3ro/oil-backend";
import type { WeeklyIncrementalReport, BackfillReconcileReport } from "@a3ro/oil-backend";

export const runtime = "nodejs";
// Never statically pre-render — runs a full pull against the live DB + Finnhub.
export const dynamic = "force-dynamic";
// One market-wide calendar call plus up to a few dozen per-ticker
// supplement calls (§2: "a heavy week is a few dozen calls"); 60s
// gives headroom over the 10s default.
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    // Auth guard: if CRON_SECRET is set, verify Authorization header.
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = request.headers.get("Authorization");
      const expected = `Bearer ${secret}`;
      if (auth !== expected) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const db = await createDb();
    const weekly: WeeklyIncrementalReport = await runWeeklyIncremental(db);

    // Nightly reconcile for freshly-added / under-backfilled tickers —
    // isolated so a Finnhub hiccup here never fails the weekly pull above.
    let reconcile: BackfillReconcileReport | { error: string };
    try {
      reconcile = await reconcileUnderfilledTickers(db);
    } catch (e) {
      reconcile = { error: e instanceof Error ? e.message : String(e) };
    }

    return Response.json({ weekly, reconcile });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
