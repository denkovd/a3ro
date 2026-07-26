/* ────────────────────────────────────────────────────────────────
   Bagholder Risk Map — add a follow-up event to an existing narrative
   (a new reply-corpus reading, a fresh post, a hedge/reframe) and
   rescore immediately. POST /api/bagholder/narratives/:id/events
   → { event, cycleReport, board }
──────────────────────────────────────────────────────────────── */

import {
  createDb, getNarrative, insertNarrativeEvent, runBagholderCycle, getTriggerBoard,
} from "@a3ro/oil-backend";
import type { SourceType } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SOURCE_TYPES = new Set(["X_POST", "NEWS", "FILING", "ONCHAIN", "OTHER"]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const narrativeId = Number(params.id);
    if (!Number.isInteger(narrativeId) || narrativeId <= 0) {
      return Response.json({ error: "invalid narrative id" }, { status: 400 });
    }

    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw || typeof raw.postedAt !== "string" || Number.isNaN(Date.parse(raw.postedAt))) {
      return Response.json({ error: "`postedAt` (ISO date/time) is required" }, { status: 400 });
    }

    const db = await createDb();
    const narrative = await getNarrative(db, narrativeId);
    if (!narrative) return Response.json({ error: `narrative ${narrativeId} not found` }, { status: 404 });

    const event = await insertNarrativeEvent(db, {
      narrativeId,
      sourceType: typeof raw.sourceType === "string" && SOURCE_TYPES.has(raw.sourceType) ? (raw.sourceType as SourceType) : "OTHER",
      sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl.slice(0, 500) : null,
      author: typeof raw.author === "string" ? raw.author.slice(0, 120) : null,
      authorWeight: typeof raw.authorWeight === "number" ? Math.max(0, Math.min(1, raw.authorWeight)) : null,
      postedAt: raw.postedAt,
      text: typeof raw.text === "string" ? raw.text.slice(0, 4000) : null,
      replyAgree: typeof raw.replyAgree === "number" ? Math.max(0, Math.round(raw.replyAgree)) : 0,
      replyDisagree: typeof raw.replyDisagree === "number" ? Math.max(0, Math.round(raw.replyDisagree)) : 0,
      replyReframe: typeof raw.replyReframe === "number" ? Math.max(0, Math.round(raw.replyReframe)) : 0,
      hedgeDetected: raw.hedgeDetected === true,
    });

    const cycleReport = await runBagholderCycle(db);
    const board = (await getTriggerBoard(db)).filter((e) => e.narrative.id === narrativeId);

    return Response.json({ event, cycleReport, board });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
