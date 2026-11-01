/* ────────────────────────────────────────────────────────────────
   Read-only BTC Tracker stock/flow — latest metric per locus.
   Node runtime, force-dynamic (matches gold/oil read routes).
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestBtcFlowMetrics } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const metrics = await getLatestBtcFlowMetrics(db);
    return Response.json({
      metrics,
      asOf: metrics[0]?.observedAt ?? null,
      count: metrics.length,
    });
  } catch (err) {
    return Response.json(
      { error: "Request could not be completed" },
      { status: 500 },
    );
  }
}
