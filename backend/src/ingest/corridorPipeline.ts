/* ────────────────────────────────────────────────────────────────
   Corridor ingestion cycle — sibling to ingest/pipeline.ts for the
   corridor-metrics domain. Per-source isolation identical in spirit
   to pipeline.ts's pollSources: one source failing must never take
   down the others (or price ingestion — see the cron route, which
   wraps runCorridorCycle in its own try/catch).

   v1 SCOPE NOTE: no rate gate, no sources-table dependency. Corridor
   sources aren't (yet) rows in the `sources` catalog table and don't
   go through checkGate/noteSuccess/noteFailure (ingest/rateGate.ts) —
   weekly-cadence sources polled by a daily cron have nothing to gate
   against, and v1 has exactly one corridor source. Both pieces of
   plumbing (catalog row + rate gate) are the natural next step once
   a higher-cadence or quota-sensitive corridor source appears.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { CorridorSource } from "../sources/CorridorSource";
import { buildCorridorSources } from "../sources/corridorRegistry";
import { Queryable } from "../storage/db";
import { insertCorridorMetrics } from "../storage/corridorRepo";

export interface CorridorCycleReport {
  startedAt: string;
  polled: { sourceId: string; ok: boolean; records: number; error?: string }[];
}

export async function runCorridorCycle(
  db: Queryable,
  opts: { sources?: CorridorSource[]; now?: () => Date } = {},
): Promise<CorridorCycleReport> {
  const sources = opts.sources ?? buildCorridorSources();
  const now = opts.now ?? (() => new Date());

  const report: CorridorCycleReport = {
    startedAt: now().toISOString(),
    polled: [],
  };

  await Promise.all(
    sources.map(async (source) => {
      const d = source.descriptor;
      try {
        const records = await source.fetchLatest();
        const written = await insertCorridorMetrics(db, records);
        report.polled.push({ sourceId: d.id, ok: true, records: written });
      } catch (e) {
        if (e instanceof SourceError) {
          report.polled.push({
            sourceId: d.id, ok: false, records: 0,
            error: `${e.kind}: ${e.message}`,
          });
        } else {
          // Unknown throw = adapter bug. Wrap it the same way pipeline.ts does.
          const err = new SourceError(d.id, "bad_payload", String(e), { cause: e });
          report.polled.push({ sourceId: d.id, ok: false, records: 0, error: err.message });
        }
      }
    }),
  );

  return report;
}
