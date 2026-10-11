import { createDb, runIngestionCycle, runCorridorCycle } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";
import { summarizeRefresh } from "../../../../lib/oil/refreshReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Independent oil refresh: physical feeds start alongside prices, so unrelated
 * market cycles and price-resolution latency cannot starve refining readings. */
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const db = await createDb();
    const [prices, physical] = await Promise.allSettled([
      runIngestionCycle(db), runCorridorCycle(db),
    ]);
    const summary = {
      prices: summarizeRefresh(prices.status === "fulfilled" ? prices.value : null),
      physical: summarizeRefresh(physical.status === "fulfilled" ? physical.value : null),
    };
    const status = Object.values(summary).every(s => s.status === "failed") ? "failed"
      : Object.values(summary).some(s => ["failed", "degraded"].includes(s.status)) ? "degraded" : "healthy";
    console.info(JSON.stringify({ job: "oil", status, completedAt: new Date().toISOString(), ...summary }));
    const report = (result: PromiseSettledResult<unknown>) => result.status === "fulfilled"
      ? result.value : { error: "Oil refresh cycle failed" };
    return Response.json({ status, summary, prices: report(prices), physical: report(physical) }, {
      status: status === "failed" ? 503 : 200,
    });
  } catch {
    console.error(JSON.stringify({ job: "oil", status: "failed", completedAt: new Date().toISOString() }));
    return Response.json({ error: "Oil refresh unavailable" }, { status: 503 });
  }
}
