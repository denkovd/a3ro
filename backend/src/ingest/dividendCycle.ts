import { DIVIDEND_INDICATORS } from "../dividend/indicators";
import { fetchDividendBaseline } from "../dividend/sources";
import { archiveDividendDataset, recordDividendFetch } from "../storage/dividendRepo";
import type { Queryable } from "../storage/db";
import type { DividendSource, DividendSourceState } from "../dividend/types";

export interface DividendCycleReport {
  startedAt: string;
  results: { source: DividendSource; archived: boolean; health: DividendSourceState["health"]; error: string | null }[];
}

export async function runDividendCycle(db: Queryable, opts: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<DividendCycleReport> {
  const now = opts.now ?? new Date();
  const { datasets, states } = await fetchDividendBaseline({ ...opts, now });
  const results = await Promise.all(states.map(async state => {
    const dataset = datasets.find(item => item.source === state.source);
    let hash: string | null = null;
    let error = state.error;
    let health = state.health;
    try {
      if (dataset) {
        hash = await archiveDividendDataset(db, dataset);
        const expected = DIVIDEND_INDICATORS.filter(indicator => indicator.source === state.source).length;
        if (dataset.series.filter(series => series.points.length > 0).length < expected) health = "degraded";
      }
      await recordDividendFetch(db, { ...state, health }, hash);
    } catch {
      error = "Source retrieval or revision archiving failed";
      health = "degraded";
    }
    return { source: state.source, archived: hash !== null, health, error };
  }));
  return { startedAt: now.toISOString(), results };
}
