// Public, open data (roadmap #55): Australia's monthly iron ore export value from the ABS.
// Read straight from the ABS Data API and cached, so there is no table or cron to run.
// The ABS publishes about five weeks after each month ends; a 6-hour cache is plenty.
import { unstable_cache } from "next/cache";
import { fetchIronOreExports } from "../../../../lib/ironore/exports";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getExports = unstable_cache(() => fetchIronOreExports(), ["ironore-abs-exports"], { revalidate: 6 * 3600 });

export const GET = withErrorLog("api:ironore/exports", async function GET() {
  try {
    const data = await getExports();
    return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "The ABS could not be reached; try again later" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
});
