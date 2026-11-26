/* ────────────────────────────────────────────────────────────────
   Public "data as of" endpoint (roadmap #21). One timestamp per
   module: when its data was last refreshed. Timestamps only, so it is
   public for every module, including Premium ones. Cached at the CDN
   for 5 minutes; the jobs it reports on run at most a few times a day.
──────────────────────────────────────────────────────────────── */
import { createDb, getDataStatus } from "@a3ro/oil-backend";
import { withErrorLog } from "../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLog("api:data-status", async function GET() {
  try {
    const status = await getDataStatus(await createDb());
    return Response.json({ modules: status }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return Response.json({ modules: {} }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
});
