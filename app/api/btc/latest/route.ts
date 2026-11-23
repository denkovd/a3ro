/* ────────────────────────────────────────────────────────────────
   Read-only BTC Tracker endpoint — newest btc_snapshots row, mapped
   to the shape app/components/projects/btc/btcData.ts expects. Clone
   of app/api/gold/latest/route.ts: node runtime, force-dynamic, never
   cached.
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestBtcSnapshot } from "@a3ro/oil-backend";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLog("api:btc/latest", async function GET() {
  try {
    const db = await createDb();
    const snapshot = await getLatestBtcSnapshot(db);

    if (!snapshot) {
      return Response.json({ error: "no btc snapshot available" }, { status: 404 });
    }

    // Flag when the snapshot has stopped advancing, rather than serving an
    // old price as "live" (it sat at 26 Oct for three weeks unnoticed).
    const asOfMs = snapshot.priceAsOf ? Date.parse(snapshot.priceAsOf) : NaN;
    const ageHours = Number.isFinite(asOfMs) ? (Date.now() - asOfMs) / 3_600_000 : null;
    const stale = ageHours === null || ageHours > 36;

    return Response.json({
      source: "live",
      stale,
      ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      asOf: snapshot.priceAsOf,
      price: {
        value: snapshot.price,
        currency: snapshot.priceCurrency,
      },
      changes: snapshot.changes,
    });
  } catch (err) {
    return Response.json(
      { error: "Request could not be completed" },
      { status: 500 },
    );
  }
});
