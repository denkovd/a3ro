import { buildConstraintsSnapshot } from "../../../../backend/src/dividend/constraints/gauges";
import { buildValueChainSnapshot } from "../../../../backend/src/dividend/valueChain/metrics";
import type { SignalDatasets, SignalSource } from "../../../../backend/src/dividend/signals/types";
import type { ValueChainSnapshot } from "../../../../backend/src/dividend/valueChain/types";
import { createDb } from "../../../../backend/src/storage/db";
import { getEarlierSignal, getStoredSignals } from "../../../../backend/src/storage/signalRepo";
import { getStoredValueChain } from "../../../../backend/src/storage/valueChainRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads the archives only; sources are fetched by the daily cron, never on a page view. */
export async function GET() {
  let datasets: SignalDatasets = {};
  let previousCentres: SignalDatasets["datacentres"];
  let valueChain: ValueChainSnapshot | null = null;
  let states: { source: SignalSource; health: "healthy" | "unavailable"; checkedAt: string | null }[] = [];
  if (process.env.DATABASE_URL) {
    try {
      const db = await createDb();
      const [signals, stored] = await Promise.all([getStoredSignals(db), getStoredValueChain(db)]);
      datasets = signals.datasets;
      states = signals.states.map(({ source, health, checkedAt }) => ({ source, health, checkedAt }));
      valueChain = stored ? buildValueChainSnapshot(stored) : null;
      if (datasets.datacentres) previousCentres = await getEarlierSignal(db, "datacentres", datasets.datacentres.retrievedAt);
    } catch {
      console.warn("AI Dividend constraint archives could not be read");
    }
  }
  return Response.json(buildConstraintsSnapshot(datasets, previousCentres, valueChain, new Date(), states), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
