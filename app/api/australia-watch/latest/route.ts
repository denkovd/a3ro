import { createDb, getAustraliaFetchStates, getAustraliaObservations } from "@a3ro/oil-backend";
import { fetchAustraliaReleaseSchedules } from "../../../../backend/src/sources/absReleases";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getReleaseSchedules = unstable_cache(fetchAustraliaReleaseSchedules, ["australia-abs-release-calendars"], { revalidate: 3600 });

export async function GET() {
  try {
    const db = await createDb();
    const [observations, fetchStates, releaseSchedules] = await Promise.all([getAustraliaObservations(db), getAustraliaFetchStates(db), getReleaseSchedules()]);
    const publicFetchStates = Object.fromEntries(Object.entries(fetchStates).map(([indicator, state]) => [
      indicator, { ...state, error: state.error ? "Official source could not be verified on this attempt" : null },
    ]));
    return Response.json({ observations, fetchStates: publicFetchStates, releaseSchedules }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: "Request could not be completed" }, { status: 500 });
  }
}
