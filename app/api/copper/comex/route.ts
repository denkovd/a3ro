// Public (roadmap #56): COMEX copper warehouse stocks from CME's free daily delivery report.
// Stock counts only, no prices. Read on demand and cached for 3 hours (CME updates once a day).
import { unstable_cache } from "next/cache";
import { fetchComexCopperStocks } from "../../../../lib/copper/comexStocks";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getStocks = unstable_cache(() => fetchComexCopperStocks(), ["copper-comex-stocks"], { revalidate: 3 * 3600 });

export const GET = withErrorLog("api:copper/comex", async function GET() {
  try {
    const data = await getStocks();
    return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=10800, stale-while-revalidate=43200" } });
  } catch {
    return Response.json({ error: "The CME report could not be read; try again later" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
});
