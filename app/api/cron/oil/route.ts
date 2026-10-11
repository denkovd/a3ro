import { createDb, runIngestionCycle, runCorridorCycle } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";

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
    const report = (result: PromiseSettledResult<unknown>) => result.status === "fulfilled"
      ? result.value : { error: "Oil refresh cycle failed" };
    return Response.json({ prices: report(prices), physical: report(physical) }, {
      status: prices.status === "rejected" && physical.status === "rejected" ? 503 : 200,
    });
  } catch {
    return Response.json({ error: "Oil refresh unavailable" }, { status: 503 });
  }
}
