// Read-only endpoint: returns current price per benchmark.
// Writes (ingestion) happen via the cron job in app/api/cron/ingest.
import {
  createDb, getLatestQuotes, classifyStaleness, buildSources, getDailySeries, computeQuoteChanges,
} from "@a3ro/oil-backend";
import { withErrorLog } from "../../_lib/errorLog";

// REQUIRED: `pg` speaks raw TCP, which Vercel's Edge runtime cannot do.
// Every route/cron handler that touches storage/ must pin the Node runtime.
export const runtime = "nodejs";
// Never statically pre-render at build time — hits the live DB. Runtime-only.
export const dynamic = "force-dynamic";

export const GET = withErrorLog("api:oil/latest", async function GET() {
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
    // Reference closes for the 1D/1W change: the last ~3 weeks covers a
    // 7-day lookback plus holidays and publication lag.
    const from = new Date(now.getTime() - 21 * 86_400_000).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const closesByBenchmark = new Map<string, Awaited<ReturnType<typeof getDailySeries>>>(
      await Promise.all(
        quotes.map(async (q): Promise<[string, Awaited<ReturnType<typeof getDailySeries>>]> => {
          try {
            return [q.benchmark, await getDailySeries(db, q.benchmark, from, to)];
          } catch {
            return [q.benchmark, []]; // changes read null; price still served
          }
        }),
      ),
    );
    const fresh = quotes.map((q) => ({
      ...q,
      ...computeQuoteChanges(q.price, q.observedAt, closesByBenchmark.get(q.benchmark) ?? []),
      // latest_quotes has no periodDate; classifyStaleness falls back to
      // observedAt for settlement kinds — fine, observedAt IS the
      // market-close instant.
      staleness: classifyStaleness({ kind: q.kind, observedAt: q.observedAt }, lookup(q.source), now),
    }));

    return Response.json(fresh);
  } catch (error) {
    const message = "Request could not be completed";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
});
