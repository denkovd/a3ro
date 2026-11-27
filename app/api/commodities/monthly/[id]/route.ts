// Public, open data (roadmap #126): World Bank Pink Sheet monthly average price for iron ore, copper or LNG (Japan).
// CC BY 4.0; written monthly by .github/workflows/pink-sheet.yml.
import { unstable_cache } from "next/cache";
import { createDb, loadCommoditySeries, summarisePrices, type PinkSeriesId } from "@a3ro/oil-backend";
import { withErrorLog } from "../../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const IDS: PinkSeriesId[] = ["iron_ore", "copper", "lng_japan"];

const load = unstable_cache(async (id: PinkSeriesId) => {
  const s = await loadCommoditySeries(await createDb(), id);
  if (!s) return null;
  const points = s.points.slice(-61);
  return { id: s.id, label: s.label, unit: s.unit, points, summary: summarisePrices(s.points) };
}, ["commodity-monthly-v1"], { revalidate: 6 * 3600 });

export const GET = withErrorLog("api:commodities/monthly", async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!IDS.includes(id as PinkSeriesId)) return Response.json({ error: "Unknown series" }, { status: 404 });
  try {
    const data = await load(id as PinkSeriesId);
    if (!data) return Response.json({ error: "No data yet" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
});
