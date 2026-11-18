import { buildSignalsSnapshot } from "../../../../backend/src/dividend/signals/snapshot";
import type { SignalDatasets } from "../../../../backend/src/dividend/signals/types";
import { createDb } from "../../../../backend/src/storage/db";
import { getStoredSignals, type SignalSourceState } from "../../../../backend/src/storage/signalRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads the archive only; sources are fetched by the daily cron, never on a page view. */
export async function GET() {
  let stored: { datasets: SignalDatasets; states: SignalSourceState[] } = { datasets: {}, states: [] };
  if (process.env.DATABASE_URL) {
    try { stored = await getStoredSignals(await createDb()); }
    catch { console.warn("AI Dividend signal archive could not be read"); }
  }
  const snapshot = buildSignalsSnapshot(stored.datasets, stored.states.map(state => ({ ...state, error: state.error ? "Latest source check failed" : null })));
  return Response.json(snapshot, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
