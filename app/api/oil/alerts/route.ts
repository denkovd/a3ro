/* ────────────────────────────────────────────────────────────────
   Read-only alerts endpoint (roadmap P8) — recent fired alert_events,
   newest first, optionally filtered by benchmark. The rules engine
   (backend alerts/rules.ts) already evaluates + writes these each
   ingestion cycle; this just surfaces them. Node runtime, force-
   dynamic, never cached.

   GET /api/oil/alerts?benchmark=WTI&limit=12
   → { alerts: [ { id, ruleId, firedAt, delivered, benchmark, type, payload } ] }
──────────────────────────────────────────────────────────────── */

import { createDb, getRecentAlertEvents } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const benchmark = searchParams.get("benchmark") || undefined;
    const limit = Number(searchParams.get("limit")) || 12;
    const db = await createDb();
    const alerts = await getRecentAlertEvents(db, { benchmark, limit });
    return Response.json({ alerts });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
