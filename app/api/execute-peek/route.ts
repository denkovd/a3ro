import { EXECUTE_STRATEGY_VERSION, type ExecutePeekPayload } from "../../../backend/src/execute/types";
import { createDb } from "../../../backend/src/storage/db";
import { listExecuteEvents } from "../../../backend/src/storage/executeRepo";

// Public: the FOMC/CPI calendar only (no prices, signals or results), for the free Execute peek.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  try {
    const upcoming = await listExecuteEvents(await createDb(), now, 45);
    const body: ExecutePeekPayload = { version: EXECUTE_STRATEGY_VERSION, generatedAt: now.toISOString(), upcoming };
    return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch {
    console.error("Execute calendar could not be read");
    return Response.json({ error: "Execute calendar is unavailable right now" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
