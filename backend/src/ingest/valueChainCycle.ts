import { fetchValueChain } from "../dividend/valueChain/sec";
import { archiveValueChain } from "../storage/valueChainRepo";
import type { Queryable } from "../storage/db";

export interface ValueChainCycleReport {
  startedAt: string;
  loaded: number;
  failures: { ticker: string; error: string }[];
  archived: boolean;
}

export async function runValueChainCycle(db: Queryable, opts: Parameters<typeof fetchValueChain>[0] = {}): Promise<ValueChainCycleReport> {
  const dataset = await fetchValueChain(opts);
  // Never overwrite a good archive with an empty fetch (e.g. SEC outage or a bad User-Agent).
  const archived = dataset.companies.length > 0 ? (await archiveValueChain(db, dataset), true) : false;
  return { startedAt: dataset.retrievedAt, loaded: dataset.companies.length, failures: dataset.failures, archived };
}
