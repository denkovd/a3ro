import { createDb } from "@a3ro/oil-backend";
import { runRefineryCycle } from "../../../../backend/src/ingest/refineryCycle";
import { requireCronAuth } from "../../_lib/cronAuth";
import { summarizeRefresh } from "../../../../lib/oil/refreshReport";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runRefineryCycle(await createDb());
    const summary = summarizeRefresh(report);
    console.info(JSON.stringify({ job: "refineries", completedAt: new Date().toISOString(), ...summary }));
    return Response.json({ ...report, summary }, { status: summary.status === "failed" ? 503 : 200 });
  } catch {
    console.error(JSON.stringify({ job: "refineries", status: "failed", completedAt: new Date().toISOString() }));
    return Response.json({ error: "Refinery evidence refresh failed" }, { status: 500 });
  }
}
