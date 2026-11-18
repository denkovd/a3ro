import { unstable_cache } from "next/cache";
import { buildDividendSnapshot, dividendDatasetComplete } from "../../../../backend/src/dividend/engine";
import { DIVIDEND_SOURCES } from "../../../../backend/src/dividend/indicators";
import { fetchDividendDataset } from "../../../../backend/src/dividend/sources";
import type { DividendDataset, DividendSourceState } from "../../../../backend/src/dividend/types";
import { createDb } from "../../../../backend/src/storage/db";
import { getStoredDividend } from "../../../../backend/src/storage/dividendRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sourceReaders = DIVIDEND_SOURCES.map(source => ({ source, read: unstable_cache(() => fetchDividendDataset(source), ["dividend-baseline-v1", source], { revalidate: 21_600 }) }));

export async function GET() {
  const now = new Date();
  let stored: { datasets: DividendDataset[]; states: DividendSourceState[] } = { datasets: [], states: [] };
  let archive: "available" | "unavailable" = "unavailable";
  if (process.env.DATABASE_URL) {
    try {
      stored = await getStoredDividend(await createDb());
      archive = "available";
    } catch {
      console.warn("AI Dividend revision archive could not be read; checking official sources");
    }
  }
  const recent = DIVIDEND_SOURCES.every(source => {
    const state = stored.states.find(item => item.source === source);
    return stored.datasets.some(item => item.source === source) && state?.health === "healthy" && state.checkedAt && now.getTime() - Date.parse(state.checkedAt) < 26 * 3_600_000;
  });
  if (!recent) {
    try {
      const results = await Promise.allSettled(sourceReaders.map(reader => reader.read()));
      const current = {
        datasets: results.flatMap(result => result.status === "fulfilled" ? [result.value] : []),
        states: results.map((result, index): DividendSourceState => {
          const complete = result.status === "fulfilled" && dividendDatasetComplete(result.value);
          if (result.status === "rejected") console.warn("AI Dividend official source unavailable", sourceReaders[index].source);
          return { source: sourceReaders[index].source, health: result.status === "fulfilled" ? complete ? "healthy" : "degraded" : "unavailable", checkedAt: result.status === "fulfilled" ? result.value.retrievedAt : now.toISOString(), error: result.status === "rejected" ? "Official source could not be verified on this attempt" : complete ? null : "Some official series are missing" };
        }),
      };
      for (const source of DIVIDEND_SOURCES) {
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
      console.error("AI Dividend official source refresh failed");
    }
  }
  const publicStates = stored.states.map(state => ({
    ...state, error: state.error ? "Official source could not be verified on this attempt" : null,
  }));
  const snapshot = buildDividendSnapshot(stored.datasets, publicStates, now, archive);
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
