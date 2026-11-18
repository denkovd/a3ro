import { buildConstraintsSnapshot } from "../../../../backend/src/dividend/constraints/gauges";
import { buildValueChainSnapshot } from "../../../../backend/src/dividend/valueChain/metrics";
import type { SignalDatasets } from "../../../../backend/src/dividend/signals/types";
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
  if (process.env.DATABASE_URL) {
    try {
      const db = await createDb();
      const [signals, stored] = await Promise.all([getStoredSignals(db), getStoredValueChain(db)]);
      datasets = signals.datasets;
      valueChain = stored ? buildValueChainSnapshot(stored) : null;
      if (datasets.datacentres) previousCentres = await getEarlierSignal(db, "datacentres", datasets.datacentres.retrievedAt);
    } catch {
      console.warn("AI Dividend constraint archives could not be read");
    }
  }
  return Response.json(buildConstraintsSnapshot(datasets, previousCentres, valueChain), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
