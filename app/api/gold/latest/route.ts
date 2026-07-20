/* ────────────────────────────────────────────────────────────────
   Read-only Gold Tracker endpoint — newest gold_snapshots row, mapped
   to the exact GoldSnapshot shape app/components/projects/gold/goldData.ts
   already expects (normalizeSnapshot on the client coerces any nulls
   field-by-field, so this route can pass honest nulls straight through).
   Clone of the other oil read routes: node runtime, force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import { createDb, getLatestGoldSnapshot } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createDb();
    const snapshot = await getLatestGoldSnapshot(db);

    if (!snapshot) {
      return Response.json({ error: "no gold snapshot available" }, { status: 404 });
    }

    return Response.json({
      source: "live",
      asOf: snapshot.priceAsOf,
      price: {
        value: snapshot.price,
        currency: snapshot.priceCurrency,
        unit: snapshot.priceUnit,
      },
      changes: snapshot.changes,
      indicators: snapshot.indicators,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
