// Read-only endpoint: returns current price per benchmark.
// Writes (ingestion) happen via the cron job in app/api/cron/ingest.
import { createDb, getLatestQuotes } from "@a3ro/oil-backend";

// REQUIRED: `pg` speaks raw TCP, which Vercel's Edge runtime cannot do.
// Every route/cron handler that touches storage/ must pin the Node runtime.
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await createDb();
    const quotes = await getLatestQuotes(db);
    return Response.json(quotes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
