/* ────────────────────────────────────────────────────────────────
   Bagholder Risk Map — the trigger board (P·08). One read powers the
   whole frontend: every open/closed trigger, its narrative, and its
   latest per-timeframe scoring snapshot.

   GET /api/bagholder/triggers → { board: TriggerBoardEntry[] }
──────────────────────────────────────────────────────────────── */

import { createDb, getTriggerBoard } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function migrationHint(message: string): string | null {
  if (/relation "bh_\w+" does not exist/i.test(message)) {
    return "Bagholder tables missing — run `npm run migrate:bagholder` in backend/ (migrations/021_bagholder.sql).";
  }
  return null;
}

export async function GET() {
  try {
    const db = await createDb();
    const board = await getTriggerBoard(db);
    return Response.json({ board });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = migrationHint(message);
    return Response.json(hint ? { error: hint, cause: message } : { error: message }, { status: hint ? 503 : 500 });
  }
}
