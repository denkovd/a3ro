// Public, open data (roadmap #57): Australia's monthly LNG export value from the ABS
// (SITC 343 natural gas, almost all of it LNG), by destination and state.
// Read straight from the ABS Data API and cached, so there is no table or cron to run.
import { unstable_cache } from "next/cache";
import { fetchCommodityExports } from "../../../../lib/commodity/absExports";
import { LNG_EXPORTS } from "../../../../lib/lng/reference";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getExports = unstable_cache(() => fetchCommodityExports(LNG_EXPORTS), ["lng-abs-exports"], { revalidate: 6 * 3600 });

export const GET = withErrorLog("api:lng/exports", async function GET() {
  try {
    const data = await getExports();
    return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "The ABS could not be reached; try again later" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
});
