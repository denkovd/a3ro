// Crypto module (roadmap #82): a small summary of the latest DefiLlama snapshot for the homepage card.
import { NextResponse } from "next/server";
import { CRYPTO_PROJECTS, createDb, latestCryptoSnapshot } from "@a3ro/oil-backend";

export const revalidate = 3600;

export async function GET() {
  try {
    const snap = await latestCryptoSnapshot(await createDb());
    if (!snap) return NextResponse.json({ status: "empty" });
    const named = snap.projects.map((p) => ({ ...p, name: CRYPTO_PROJECTS.find((x) => x.id === p.id)?.name ?? p.id }));
    const topFees = named.filter((p) => p.fees30d !== null).sort((a, b) => b.fees30d! - a.fees30d!)[0] ?? null;
    const eth = named.find((p) => p.id === "ethereum");
    const ethShare12mAgo = eth && eth.tvlShareMonthly.length >= 13 ? eth.tvlShareMonthly[eth.tvlShareMonthly.length - 13].value : null;
    return NextResponse.json({
      status: "ready", asOf: snap.asOf,
      stablecoins: snap.totals.stablecoins, defiTvl: snap.totals.defiTvl,
      topFees: topFees ? { name: topFees.name, fees30d: topFees.fees30d } : null,
      ethShare: eth?.tvlShare ?? null, ethShare12mAgo,
    }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
