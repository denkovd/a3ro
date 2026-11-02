import { createDb, runAustraliaWatchCycle } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Independent budget: slow oil/market feeds must not prevent ABS refreshes. */
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runAustraliaWatchCycle(await createDb());
    const failed = Object.values(report.results).some(result => result.error);
    if (failed) console.error("Australia Watch: one or more ABS series failed to refresh");
    return Response.json(report, { status: failed ? 502 : 200 });
  } catch {
    console.error("Australia Watch refresh failed");
    return Response.json({ error: "Australia Watch refresh failed" }, { status: 500 });
  }
}
