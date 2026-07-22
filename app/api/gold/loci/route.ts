/* ────────────────────────────────────────────────────────────────
   Read-only Gold Tracker stock/flow — latest metric per locus.
   Node runtime, force-dynamic (matches other oil/gold read routes).
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestGoldFlowMetrics } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const metrics = await getLatestGoldFlowMetrics(db);
    return Response.json({
      metrics,
      asOf: metrics[0]?.observedAt ?? null,
      count: metrics.length,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
