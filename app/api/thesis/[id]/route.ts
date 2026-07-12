/* ────────────────────────────────────────────────────────────────
   Thesis Lab — one saved thesis (P·07).

   GET    /api/thesis/:id → { thesis: ThesisRow } (full stored analysis)
   DELETE /api/thesis/:id → { deleted: n }
   Node runtime, force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import { createDb, deleteThesis, getThesis } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const id = parseId(params.id);
    if (id === null) return Response.json({ error: "invalid thesis id" }, { status: 400 });
    const db = await createDb();
    const thesis = await getThesis(db, id);
    if (!thesis) return Response.json({ error: `thesis ${id} not found` }, { status: 404 });
    return Response.json({ thesis });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const id = parseId(params.id);
    if (id === null) return Response.json({ error: "invalid thesis id" }, { status: 400 });
    const db = await createDb();
    const deleted = await deleteThesis(db, id);
    if (deleted === 0) return Response.json({ error: `thesis ${id} not found` }, { status: 404 });
    return Response.json({ deleted });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
