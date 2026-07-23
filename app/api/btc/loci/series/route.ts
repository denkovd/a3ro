/* ────────────────────────────────────────────────────────────────
   Read-only BTC flow metric history for sparks.
   Query: ?locus=etf_us&metric=etf_flow_usd_mn
──────────────────────────────────────────────────────────────── */

import { createDb, getBtcFlowMetricSeries } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locus = url.searchParams.get("locus")?.trim() ?? "";
    const metric = url.searchParams.get("metric")?.trim() ?? "";
    if (!locus || !metric) {
      return Response.json(
        { error: "locus and metric query params are required" },
        { status: 400 },
      );
    }
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const db = await createDb();
    const series = await getBtcFlowMetricSeries(db, locus, metric, { from, to });
    return Response.json({ locus, metric, series });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
