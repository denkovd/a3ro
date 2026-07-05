/* ────────────────────────────────────────────────────────────────
   Vercel cron entrypoint: scheduled daily ingestion cycle.

   Invoked by Vercel Cron per vercel.json schedule ("0 6 * * *").
   The ingestion cycle is idempotent — re-running it is safe.

   Auth: If CRON_SECRET env var is set, verifies Authorization header
   to prevent unauthorized calls. Vercel's own cron feature automatically
   sends this header when CRON_SECRET is configured. Local dev without
   CRON_SECRET is not guarded (allows iterating locally).
──────────────────────────────────────────────────────────────── */

import { createDb, runIngestionCycle, runCorridorCycle } from "@a3ro/oil-backend";
import type { CorridorCycleReport } from "@a3ro/oil-backend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    // Auth guard: if CRON_SECRET is set, verify Authorization header.
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = request.headers.get("Authorization");
      const expected = `Bearer ${secret}`;
      if (auth !== expected) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const db = await createDb();
    const report = await runIngestionCycle(db);

    // Corridor ingestion runs in its own try/catch so it can NEVER
    // fail price ingestion — price data is the load-bearing feed.
    let corridors: CorridorCycleReport | { error: string };
    try {
      corridors = await runCorridorCycle(db);
    } catch (e) {
      corridors = { error: e instanceof Error ? e.message : String(e) };
    }

    return Response.json({ ...report, corridors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
