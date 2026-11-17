import { createDb, getAustraliaObservations, isAustraliaIndicator } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const indicator = new URL(request.url).searchParams.get("indicator") ?? "";
  if (!isAustraliaIndicator(indicator)) return Response.json({ error: "valid indicator is required" }, { status: 400 });
  try { return Response.json({ indicator, observations: await getAustraliaObservations(await createDb(), indicator) }); }
  catch (err) { return Response.json({ error: "Request could not be completed" }, { status: 500 }); }
}
