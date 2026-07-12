/* ────────────────────────────────────────────────────────────────
   Read-only corridor-series endpoint (roadmap P3) — the accumulated
   history of ONE corridor metric, for the panel Spark. No new source:
   it just reads what corridor_metrics has been accumulating since the
   corridor cycle went live (getCorridorMetricSeries). Node runtime,
   force-dynamic, never cached.

   GET /api/oil/corridors/series?corridor=hormuz&metric=tanker_transits_7d&days=120
   → { corridor, metric, points: [ { date, value } ] }  (ascending)
──────────────────────────────────────────────────────────────── */

import { createDb, getCorridorMetricSeries, isCorridorId } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const corridor = searchParams.get("corridor");
    const metric = searchParams.get("metric");
    if (!corridor || !metric) {
      return Response.json({ error: "corridor and metric are required" }, { status: 400 });
    }
    if (!isCorridorId(corridor)) {
      return Response.json({ error: `unknown corridor "${corridor}"` }, { status: 400 });
    }
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 120, 7), 400);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const db = await createDb();
    const rows = await getCorridorMetricSeries(db, corridor, metric, from, to);
    return Response.json({
      corridor,
      metric,
      points: rows.map((r) => ({ date: r.periodDate, value: r.value })),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
