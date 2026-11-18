import { fetchSignals } from "../dividend/signals/fetch";
import { archiveSignal, recordSignalRun } from "../storage/signalRepo";
import type { Queryable } from "../storage/db";
import type { SignalSource } from "../dividend/signals/types";

export interface SignalCycleReport {
  startedAt: string;
  results: { source: SignalSource; archived: boolean; error: string | null }[];
}

export async function runSignalCycle(db: Queryable, opts: Parameters<typeof fetchSignals>[0] = {}): Promise<SignalCycleReport> {
  const now = opts.now ?? new Date();
  const fetched = await fetchSignals({ ...opts, now });
  const results = await Promise.all(fetched.map(async ({ source, dataset, error }) => {
    let hash: string | null = null;
    let failure = error;
    try {
      if (dataset) hash = await archiveSignal(db, dataset);
      await recordSignalRun(db, { source, health: hash ? "healthy" : "unavailable", checkedAt: now.toISOString(), error: failure }, hash);
    } catch {
      failure = failure ?? "Archiving failed";
    }
    return { source, archived: hash !== null, error: failure };
  }));
  return { startedAt: now.toISOString(), results };
}
