/* ────────────────────────────────────────────────────────────────
   Read-only tape endpoint — the composite headline stance (Flow Stress
   + Tightness + Macro Override → SUPPLY-TIGHT / SUPPLY-AMPLE /
   MACRO-DRIVEN / BALANCED). Newest snapshot only. Node runtime,
   force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestTapeSnapshot } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const tape = await getLatestTapeSnapshot(db);
    return Response.json({ tape });
  } catch (err) {
    return Response.json(
      { error: "Request could not be completed" },
      { status: 500 },
    );
  }
}
