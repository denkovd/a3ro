import { LABS_CHECKED_ON, readLabs, type ValueChainResponse } from "../../../../backend/src/dividend/valueChain/labs";
import { buildValueChainSnapshot } from "../../../../backend/src/dividend/valueChain/metrics";
import { createDb } from "../../../../backend/src/storage/db";
import { getStoredValueChain } from "../../../../backend/src/storage/valueChainRepo";
import type { ValueChainDataset } from "../../../../backend/src/dividend/valueChain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads the archived filings only; SEC is fetched by the weekly cron, never on a page view. */
export async function GET() {
  let dataset: ValueChainDataset | null = null;
  if (process.env.DATABASE_URL) {
    try { dataset = await getStoredValueChain(await createDb()); }
    catch { console.warn("AI Dividend value-chain archive could not be read"); }
  }
  const snapshot = buildValueChainSnapshot(dataset);
  const body: ValueChainResponse = {
    ...snapshot,
    failures: snapshot.failures.map(failure => ({ ticker: failure.ticker, error: "Latest filings could not be read" })),
    labs: readLabs(),
    labsCheckedOn: LABS_CHECKED_ON,
  };
  return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
