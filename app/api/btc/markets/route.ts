import { loadBtcMarkets } from "../../../../lib/btcMarkets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const body = await loadBtcMarkets(async (url) => {
    const response = await fetch(url, {
      next: { revalidate: 30 }, signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Market feed ${response.status}`);
    return response.json();
  });
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
