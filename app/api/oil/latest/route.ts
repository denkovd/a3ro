// Read-only endpoint: returns current price per benchmark.
// Writes (ingestion) happen via the cron job in app/api/cron/ingest.
import { createDb, getLatestQuotes, classifyStaleness, buildSources } from "@a3ro/oil-backend";

// REQUIRED: `pg` speaks raw TCP, which Vercel's Edge runtime cannot do.
// Every route/cron handler that touches storage/ must pin the Node runtime.
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await createDb();
    const quotes = await getLatestQuotes(db);

    // staleness is recomputed at read time — the stored value is a snapshot
    // from the last resolve and goes stale between crons.
    const allSources = buildSources();
    const lookup = (sourceId: string) => {
      const s = allSources.find((x) => x.descriptor.id === sourceId);
      // Unknown source (e.g. adapter removed but history remains):
      // deprioritize hard, treat as slow daily publisher.
      return s
        ? s.descriptor
        : { priority: 99, expectedCadenceMs: 86_400_000, publicationLagBusinessDays: 4 };
    };

    const now = new Date();
    const fresh = quotes.map((q) => ({
      ...q,
      // latest_quotes has no periodDate; classifyStaleness falls back to
      // observedAt for settlement kinds — fine, observedAt IS the
      // market-close instant.
      staleness: classifyStaleness({ kind: q.kind, observedAt: q.observedAt }, lookup(q.source), now),
    }));

    return Response.json(fresh);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
