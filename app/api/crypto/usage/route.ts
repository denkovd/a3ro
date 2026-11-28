// Crypto usage for one project (asset pages, #38): open DefiLlama figures only. Market caps and
// ratios stay in the Premium valuation API (#18), so they are never copied here.
import { NextResponse } from "next/server";
import { CRYPTO_PROJECTS, createDb, latestCryptoSnapshot } from "@a3ro/oil-backend";

export const revalidate = 3600;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const project = CRYPTO_PROJECTS.find((p) => p.id === id);
  if (!project) return NextResponse.json({ status: "unknown" }, { status: 404 });
  try {
    const snap = await latestCryptoSnapshot(await createDb());
    const s = snap?.projects.find((p) => p.id === id);
    if (!snap || !s) return NextResponse.json({ status: "empty" });
    return NextResponse.json({
      status: "ready", asOf: snap.asOf, name: project.name, role: project.role, chain: !!project.chain,
      fees30d: s.fees30d, revenue30d: s.revenue30d, tvl: s.tvl, tvlShare: s.tvlShare,
      stablecoins: s.stablecoins, stablecoinShare: s.stablecoinShare,
    }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
