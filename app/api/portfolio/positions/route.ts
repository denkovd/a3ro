/* ────────────────────────────────────────────────────────────────
   Portfolio positions — the trader's book (P·07 Risk Audit).

   GET  /api/portfolio/positions → { positions: MarkedPosition[] }
        (marked live at read time: latest_quotes → bull_snapshots →
         manual → entry_fallback, each labeled — never silent)
   POST /api/portfolio/positions
        body: { symbol, side, quantity, entryPrice, displayName?,
                manualMark?, thesisId?, notes?, openedAt? }
        → { id }
   Node runtime, force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import { createDb, insertPosition, listPositions, markPositions } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function migrationHint(message: string): string | null {
  if (/relation "(portfolio_positions|theses)" does not exist/i.test(message)) {
    return "Thesis Lab tables missing — run `npm run migrate:thesis` in backend/ (migrations/012_thesis.sql).";
  }
  return null;
}

export async function GET() {
  try {
    const db = await createDb();
    const rows = await listPositions(db);
    const positions = await markPositions(db, rows);
    return Response.json({ positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = migrationHint(message);
    return Response.json(
      hint ? { error: hint, cause: message } : { error: message },
      { status: hint ? 503 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw) return Response.json({ error: "json body required" }, { status: 400 });

    const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().toUpperCase().slice(0, 24) : "";
    const side = raw.side === "short" ? "short" : raw.side === "long" ? "long" : null;
    const quantity = typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : NaN;
    const entryPrice = typeof raw.entryPrice === "number" && Number.isFinite(raw.entryPrice) ? raw.entryPrice : NaN;

    if (!symbol) return Response.json({ error: "symbol is required (WTI, BRENT, or a scanned symbol like GC=F / BTC-USD / AAPL)" }, { status: 400 });
    if (!side) return Response.json({ error: "side must be 'long' or 'short'" }, { status: 400 });
    if (!(quantity > 0)) return Response.json({ error: "quantity must be > 0 (units: bbl / shares / coins)" }, { status: 400 });
    if (!(entryPrice >= 0)) return Response.json({ error: "entryPrice must be ≥ 0" }, { status: 400 });

    const manualMark =
      typeof raw.manualMark === "number" && Number.isFinite(raw.manualMark) && raw.manualMark > 0 ? raw.manualMark : null;
    const thesisId =
      typeof raw.thesisId === "number" && Number.isInteger(raw.thesisId) && raw.thesisId > 0 ? raw.thesisId : null;
    const openedAt =
      typeof raw.openedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.openedAt) ? raw.openedAt : null;

    const db = await createDb();
    const id = await insertPosition(db, {
      symbol,
      displayName: typeof raw.displayName === "string" && raw.displayName.trim() ? raw.displayName.trim().slice(0, 80) : null,
      side,
      quantity,
      entryPrice,
      manualMark,
      thesisId,
      notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim().slice(0, 500) : null,
      openedAt,
    });
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = migrationHint(message);
    return Response.json(
      hint ? { error: hint, cause: message } : { error: message },
      { status: hint ? 503 : 500 },
    );
  }
}
