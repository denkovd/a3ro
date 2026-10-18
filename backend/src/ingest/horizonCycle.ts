import { HORIZON_INDICATORS } from "../horizon/indicators";
import { fetchHorizonBaseline } from "../horizon/sources";
import { archiveHorizonDataset, recordHorizonFetch } from "../storage/horizonRepo";
import type { Queryable } from "../storage/db";
import type { HorizonSource, HorizonSourceState } from "../horizon/types";

export interface HorizonCycleReport {
  startedAt: string;
  results: { source: HorizonSource; archived: boolean; health: HorizonSourceState["health"]; error: string | null }[];
}

export async function runHorizonCycle(db: Queryable, opts: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<HorizonCycleReport> {
  const now = opts.now ?? new Date();
  const { datasets, states } = await fetchHorizonBaseline({ ...opts, now });
  const results = await Promise.all(states.map(async state => {
    const dataset = datasets.find(item => item.source === state.source);
    let hash: string | null = null;
    let error = state.error;
    let health = state.health;
    try {
      if (dataset) {
        hash = await archiveHorizonDataset(db, dataset);
        const expected = HORIZON_INDICATORS.filter(indicator => indicator.source === state.source).length;
        if (dataset.series.filter(series => series.points.length > 0).length < expected) health = "degraded";
      }
      await recordHorizonFetch(db, { ...state, health }, hash);
    } catch {
      error = "Source retrieval or revision archiving failed";
      health = "degraded";
    }
    return { source: state.source, archived: hash !== null, health, error };
  }));
  return { startedAt: now.toISOString(), results };
}
