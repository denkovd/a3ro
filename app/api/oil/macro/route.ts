/* ────────────────────────────────────────────────────────────────
   Read-only macro endpoint — newest macro_snapshots row. Powers both
   P·06 (the GRID Regime Shift Finder card) and the Macro Override chip
   (#5), which read different fields off the same snapshot. Clone of the
   other oil read routes: node runtime, force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestMacroSnapshot, getLatestPositioning, publicMacroSnapshot } from "@a3ro/oil-backend";
import { withErrorLog } from "../../_lib/errorLog";
import { currentUserHasPremium } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLog("api:oil/macro", async function GET() {
  try {
    const db = await createDb();
    const [snapshot, positioning, premium] = await Promise.all([
      getLatestMacroSnapshot(db),
      getLatestPositioning(db),
      currentUserHasPremium(),
    ]);
    // Raw Yahoo-sourced numbers are premium-only until licensed (backend/src/macro/publicView.ts).
    const macro = snapshot && !premium ? publicMacroSnapshot(snapshot) : snapshot;
    return Response.json({ macro, positioning }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return Response.json(
      { error: "Request could not be completed" },
      { status: 500 },
    );
  }
});
