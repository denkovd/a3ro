// Crypto valuation (roadmap #83 / #84): market caps and ratios. Premium: market data (#18); middleware gates it.
import { NextResponse } from "next/server";
import { createDb, latestCryptoSnapshot } from "@a3ro/oil-backend";

export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const snap = await latestCryptoSnapshot(await createDb());
    if (!snap) return NextResponse.json({ status: "empty" }, { headers: PRIVATE });
    return NextResponse.json({
      status: "ready", asOf: snap.asOf,
      cryptoMcap: snap.totals.cryptoMcap ?? null, stablecoins: snap.totals.stablecoins,
      projects: snap.projects.map((p) => ({
        id: p.id, mcap: p.mcap ?? null, fdv: p.fdv ?? null, fees30d: p.fees30d, revenue30d: p.revenue30d,
        priceToFees: p.priceToFees ?? null, priceToRevenue: p.priceToRevenue ?? null,
        priceToFeesMonthly: p.priceToFeesMonthly ?? [], priceToRevenueMonthly: p.priceToRevenueMonthly ?? [],
      })),
      baskets: snap.baskets ?? [],
    }, { headers: PRIVATE });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}
