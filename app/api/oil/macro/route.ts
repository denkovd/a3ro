/* ────────────────────────────────────────────────────────────────
   Read-only macro endpoint — newest macro_snapshots row. Powers both
   P·06 (the GRID Regime Shift Finder card) and the Macro Override chip
   (#5), which read different fields off the same snapshot. Clone of the
   other oil read routes: node runtime, force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestMacroSnapshot, getLatestPositioning } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const [macro, positioning] = await Promise.all([
      getLatestMacroSnapshot(db),
      getLatestPositioning(db),
    ]);
    return Response.json({ macro, positioning });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
