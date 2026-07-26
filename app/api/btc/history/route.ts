/* ────────────────────────────────────────────────────────────────
   Read-only BTC price history endpoint — daily closes from btc_prices,
   for client-side weekly bucketing (BtcPriceChart). Clone of
   app/api/btc/latest/route.ts: node runtime, force-dynamic, never
   cached.
──────────────────────────────────────────────────────────────── */

import { createDb, getBtcPriceHistory } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 3 * 365;

export async function GET() {
  try {
    const db = await createDb();
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const points = await getBtcPriceHistory(db, from, to);

    return Response.json({ points });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
