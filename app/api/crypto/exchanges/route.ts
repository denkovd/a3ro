// Exchange reserves (roadmap #127): assets in exchanges' published wallets, from DefiLlama. Open data, public.
import { NextResponse } from "next/server";
import { createDb, latestCryptoSnapshot } from "@a3ro/oil-backend";

export const revalidate = 3600;

export async function GET() {
  try {
    const snap = await latestCryptoSnapshot(await createDb());
    if (!snap?.exchanges?.length) return NextResponse.json({ status: "empty" });
    return NextResponse.json({ status: "ready", asOf: snap.asOf, exchanges: snap.exchanges },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
