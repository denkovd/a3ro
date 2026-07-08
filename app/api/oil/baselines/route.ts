// Read-only endpoint: returns every (corridor, metric, win) baseline row.
// Writes (refresh) happen via the cron job in app/api/cron/ingest.
import { createDb, getBaselines } from "@a3ro/oil-backend";

// REQUIRED: `pg` speaks raw TCP, which Vercel's Edge runtime cannot do.
// Every route/cron handler that touches storage/ must pin the Node runtime.
export const runtime = "nodejs";
// Never statically pre-render at build time — hits the live DB. Runtime-only.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const baselines = await getBaselines(db);
    return Response.json(baselines);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
