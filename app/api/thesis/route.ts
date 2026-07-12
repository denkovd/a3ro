/* ────────────────────────────────────────────────────────────────
   Thesis Lab — saved-theses index (P·07).

   GET /api/thesis?limit=50 → { theses: ThesisSummary[] }
   Light summaries only (id/title/direction/instrument/strength/
   verdict) — the full analysis rides /api/thesis/[id]. Node runtime,
   force-dynamic, never cached.
──────────────────────────────────────────────────────────────── */

import { createDb, listTheses } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 50;
    const db = await createDb();
    const theses = await listTheses(db, limit);
    return Response.json({ theses });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "theses" does not exist/i.test(message)) {
      return Response.json(
        { error: "Thesis Lab tables missing — run `npm run migrate:thesis` in backend/.", cause: message },
        { status: 503 },
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
