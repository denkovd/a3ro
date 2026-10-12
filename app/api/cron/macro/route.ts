import { createDb, runMacroCycle } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Independent daily refresh: other ingestion feeds cannot exhaust its budget. */
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runMacroCycle(await createDb());
    const { panel: _panel, ...publicReport } = report;
    return Response.json(publicReport, { status: report.error || report.written === 0 ? 503 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
