import { createDb } from "../../../../backend/src/storage/db";
import { runValueChainCycle } from "../../../../backend/src/ingest/valueChainCycle";
import { requireCronAuth } from "../../_lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Weekly: company filings change quarterly, so a weekly check catches new 10-Qs within days. */
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runValueChainCycle(await createDb());
    return Response.json(report, { status: report.archived ? 200 : 503 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
