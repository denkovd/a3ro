/* ────────────────────────────────────────────────────────────────
   Read-only BTC Tracker endpoint — newest btc_snapshots row, mapped
   to the shape app/components/projects/btc/btcData.ts expects. Clone
   of app/api/gold/latest/route.ts: node runtime, force-dynamic, never
   cached.
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestBtcSnapshot } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const snapshot = await getLatestBtcSnapshot(db);

    if (!snapshot) {
      return Response.json({ error: "no btc snapshot available" }, { status: 404 });
    }

    return Response.json({
      source: "live",
      asOf: snapshot.priceAsOf,
      price: {
        value: snapshot.price,
        currency: snapshot.priceCurrency,
      },
      changes: snapshot.changes,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
