import { createDb, getAustraliaObservations } from "@a3ro/oil-backend";
import type { AustraliaIndicator } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDICATORS = new Set(["trimmed_mean_cpi_yoy", "headline_cpi_yoy", "unemployment_rate", "hours_worked"]);
export async function GET(request: Request) {
  const indicator = new URL(request.url).searchParams.get("indicator") ?? "";
  if (!INDICATORS.has(indicator)) return Response.json({ error: "valid indicator is required" }, { status: 400 });
  try { return Response.json({ indicator, observations: await getAustraliaObservations(await createDb(), indicator as AustraliaIndicator) }); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
