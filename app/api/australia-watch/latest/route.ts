import { createDb, getAustraliaFetchStates, getAustraliaObservations } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const [observations, fetchStates] = await Promise.all([getAustraliaObservations(db), getAustraliaFetchStates(db)]);
    const publicFetchStates = Object.fromEntries(Object.entries(fetchStates).map(([indicator, state]) => [
      indicator, { ...state, error: state.error ? "Official source could not be verified on this attempt" : null },
    ]));
    return Response.json({ observations, fetchStates: publicFetchStates });
  } catch (err) {
    return Response.json({ error: "Request could not be completed" }, { status: 500 });
  }
}
