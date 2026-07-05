// Read-only endpoint: returns the newest row per (corridor, metric).
// Writes (ingestion) happen via the cron job in app/api/cron/ingest.
import { createDb, getLatestCorridorMetrics } from "@a3ro/oil-backend";

// REQUIRED: `pg` speaks raw TCP, which Vercel's Edge runtime cannot do.
// Every route/cron handler that touches storage/ must pin the Node runtime.
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await createDb();
    const metrics = await getLatestCorridorMetrics(db);
    return Response.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
