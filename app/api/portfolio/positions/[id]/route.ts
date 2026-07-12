/* ────────────────────────────────────────────────────────────────
   Portfolio positions — single-row ops (P·07 Risk Audit).

   PATCH  /api/portfolio/positions/:id — partial update (same fields
          as POST; `manualMark: null` clears the manual mark,
          `thesisId: null` unlinks)
   DELETE /api/portfolio/positions/:id
   Node runtime, force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import { createDb, deletePosition, updatePosition } from "@a3ro/oil-backend";
import type { PositionWrite } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = parseId(params.id);
    if (id === null) return Response.json({ error: "invalid position id" }, { status: 400 });
    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw) return Response.json({ error: "json body required" }, { status: 400 });

    const patch: Partial<PositionWrite> = {};
    if (typeof raw.symbol === "string" && raw.symbol.trim()) patch.symbol = raw.symbol.trim().toUpperCase().slice(0, 24);
    if (raw.side === "long" || raw.side === "short") patch.side = raw.side;
    if (typeof raw.quantity === "number" && Number.isFinite(raw.quantity) && raw.quantity > 0) patch.quantity = raw.quantity;
    if (typeof raw.entryPrice === "number" && Number.isFinite(raw.entryPrice) && raw.entryPrice >= 0) patch.entryPrice = raw.entryPrice;
    if (raw.manualMark === null) patch.manualMark = null;
    else if (typeof raw.manualMark === "number" && Number.isFinite(raw.manualMark) && raw.manualMark > 0) patch.manualMark = raw.manualMark;
    if (raw.thesisId === null) patch.thesisId = null;
    else if (typeof raw.thesisId === "number" && Number.isInteger(raw.thesisId) && raw.thesisId > 0) patch.thesisId = raw.thesisId;
    if (typeof raw.displayName === "string") patch.displayName = raw.displayName.trim().slice(0, 80) || null;
    if (typeof raw.notes === "string") patch.notes = raw.notes.trim().slice(0, 500) || null;
    if (typeof raw.openedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.openedAt)) patch.openedAt = raw.openedAt;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "no valid fields to update" }, { status: 400 });
    }

    const db = await createDb();
    const updated = await updatePosition(db, id, patch);
    if (updated === 0) return Response.json({ error: `position ${id} not found` }, { status: 404 });
    return Response.json({ updated });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const id = parseId(params.id);
    if (id === null) return Response.json({ error: "invalid position id" }, { status: 400 });
    const db = await createDb();
    const deleted = await deletePosition(db, id);
    if (deleted === 0) return Response.json({ error: `position ${id} not found` }, { status: 404 });
    return Response.json({ deleted });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
