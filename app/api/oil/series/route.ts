// Read-only endpoint: returns historical daily closes for a benchmark over a date range.
// Writes (ingestion) happen via the cron job in app/api/cron/ingest.
import { createDb, getDailySeries, isBenchmark } from "@a3ro/oil-backend";

// REQUIRED: `pg` speaks raw TCP, which Vercel's Edge runtime cannot do.
// Every route/cron handler that touches storage/ must pin the Node runtime.
export const runtime = "nodejs";
// Never statically pre-render at build time — hits the live DB. Runtime-only.
export const dynamic = "force-dynamic";

/** Basic YYYY-MM-DD format validation. */
function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const benchmark = url.searchParams.get("benchmark");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // Validate required parameters
    if (!benchmark) {
      return Response.json(
        { error: "Missing required query parameter: benchmark" },
        { status: 400 }
      );
    }

    if (!from) {
      return Response.json(
        { error: "Missing required query parameter: from" },
        { status: 400 }
      );
    }

    if (!to) {
      return Response.json(
        { error: "Missing required query parameter: to" },
        { status: 400 }
      );
    }

    // Validate benchmark is a known value
    if (!isBenchmark(benchmark)) {
      return Response.json(
        { error: `Invalid benchmark: "${benchmark}". Must be one of: WTI, BRENT` },
        { status: 400 }
      );
    }

    // Validate date format
    if (!isValidDateString(from)) {
      return Response.json(
        { error: `Invalid from date format: "${from}". Expected YYYY-MM-DD` },
        { status: 400 }
      );
    }

    if (!isValidDateString(to)) {
      return Response.json(
        { error: `Invalid to date format: "${to}". Expected YYYY-MM-DD` },
        { status: 400 }
      );
    }

    const db = await createDb();
    const series = await getDailySeries(db, benchmark, from, to);
    return Response.json(series);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
