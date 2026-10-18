import { unstable_cache } from "next/cache";
import { buildHorizonSnapshot, horizonDatasetComplete } from "../../../../backend/src/horizon/engine";
import { HORIZON_SOURCES } from "../../../../backend/src/horizon/indicators";
import { fetchHorizonDataset } from "../../../../backend/src/horizon/sources";
import type { HorizonDataset, HorizonSourceState } from "../../../../backend/src/horizon/types";
import { createDb } from "../../../../backend/src/storage/db";
import { getStoredHorizon } from "../../../../backend/src/storage/horizonRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sourceReaders = HORIZON_SOURCES.map(source => ({ source, read: unstable_cache(() => fetchHorizonDataset(source), ["horizon-baseline-v1", source], { revalidate: 21_600 }) }));

export async function GET() {
  const now = new Date();
  let stored: { datasets: HorizonDataset[]; states: HorizonSourceState[] } = { datasets: [], states: [] };
  let archive: "available" | "unavailable" = "unavailable";
  if (process.env.DATABASE_URL) {
    try {
      stored = await getStoredHorizon(await createDb());
      archive = "available";
    } catch {
      console.warn("Macro Horizon revision archive could not be read; checking official sources");
    }
  }
  const recent = HORIZON_SOURCES.every(source => {
    const state = stored.states.find(item => item.source === source);
    return stored.datasets.some(item => item.source === source) && state?.health === "healthy" && state.checkedAt && now.getTime() - Date.parse(state.checkedAt) < 26 * 3_600_000;
  });
  if (!recent) {
    try {
      const results = await Promise.allSettled(sourceReaders.map(reader => reader.read()));
      const current = {
        datasets: results.flatMap(result => result.status === "fulfilled" ? [result.value] : []),
        states: results.map((result, index): HorizonSourceState => {
          const complete = result.status === "fulfilled" && horizonDatasetComplete(result.value);
          if (result.status === "rejected") console.warn("Macro Horizon official source unavailable", sourceReaders[index].source);
          return { source: sourceReaders[index].source, health: result.status === "fulfilled" ? complete ? "healthy" : "degraded" : "unavailable", checkedAt: result.status === "fulfilled" ? result.value.retrievedAt : now.toISOString(), error: result.status === "rejected" ? "Official source could not be verified on this attempt" : complete ? null : "Some official series are missing" };
        }),
      };
      for (const source of HORIZON_SOURCES) {
        const incoming = current.datasets.find(dataset => dataset.source === source);
        const existing = stored.datasets.find(dataset => dataset.source === source);
        const state = current.states.find(item => item.source === source)!;
        const existingState = stored.states.find(item => item.source === source);
        if (incoming && (!existing || incoming.retrievedAt >= existing.retrievedAt)) {
          stored.datasets = [...stored.datasets.filter(item => item.source !== source), incoming];
        }
        if (!existingState?.checkedAt || (state.checkedAt && state.checkedAt >= existingState.checkedAt)) {
          stored.states = [...stored.states.filter(item => item.source !== source), { ...state, health: state.health === "unavailable" && existing ? "degraded" : state.health }];
        }
      }
    } catch {
      console.error("Macro Horizon official source refresh failed");
    }
  }
  const snapshot = buildHorizonSnapshot(stored.datasets, stored.states, now, archive);
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
