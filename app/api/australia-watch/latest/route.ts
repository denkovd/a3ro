import { createDb, getAustraliaFetchStates, getAustraliaObservations } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const [observations, fetchStates] = await Promise.all([getAustraliaObservations(db), getAustraliaFetchStates(db)]);
    return Response.json({ observations, fetchStates });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
