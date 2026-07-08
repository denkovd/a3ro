/* ────────────────────────────────────────────────────────────────
   Module 4 — Regime Shift Finder: read-only endpoint.
   Returns the newest scan (one row per watchlist symbol, already
   rank-ordered by the engine: newly bullish → bullish → conflicted
   → bearish → warm-up). Writes happen in the daily cron
   (app/api/cron/ingest) via runRegimeCycle.
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestRegimeSnapshots } from "@a3ro/oil-backend";

// `pg` speaks raw TCP → Node runtime required (see storage/db.ts).
export const runtime = "nodejs";
// Never statically pre-render at build time — hits the live DB. Runtime-only.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const rows = await getLatestRegimeSnapshots(db);
    return Response.json({
      runDate: rows.length > 0 ? rows[0].runDate : null,
      count: rows.length,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
