import { createDb } from "../../../../backend/src/storage/db";
import { runSignalCycle } from "../../../../backend/src/ingest/signalCycle";
import { CONSTRAINT_SOURCES } from "../../../../backend/src/dividend/signals/types";
import { requireCronAuth } from "../../_lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily: EIA and FRED update monthly, the Drought Monitor weekly, Epoch's data-centre list irregularly. */
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runSignalCycle(await createDb(), { sources: CONSTRAINT_SOURCES });
    return Response.json(report, { status: report.results.every(result => result.archived) ? 200 : 503 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
