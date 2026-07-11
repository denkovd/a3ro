/* ────────────────────────────────────────────────────────────────
   Module 5 — Bull Market Finder: recent verdict transitions.
   The "what just turned" feed: every verdict change the scanner has
   recorded in the last ?days= (default 14, max 90), newest first.
──────────────────────────────────────────────────────────────── */

import { createDb, getRecentTransitions } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("days") ?? "14");
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 90) : 14;

    const db = await createDb();
    const rows = await getRecentTransitions(db, days);
    return Response.json({ days, count: rows.length, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
