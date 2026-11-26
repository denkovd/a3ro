// Mark a member's message done or open again (Admin → Messages, roadmap #105). Admin + same-origin only.
import { createDb, setFeedbackHandled } from "@a3ro/oil-backend";
import { ownerWriteAllowed } from "../../../../lib/ownerGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!(await ownerWriteAllowed(request))) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const body = await request.json().catch(() => null) as { id?: unknown; handled?: unknown } | null;
  const id = body?.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Unknown message" }, { status: 400, headers: NO_STORE });
  if (typeof body?.handled !== "boolean") return Response.json({ error: "handled must be true or false" }, { status: 400, headers: NO_STORE });
  try {
    const found = await setFeedbackHandled(await createDb(), id, body.handled);
    if (!found) return Response.json({ error: "Unknown message" }, { status: 404, headers: NO_STORE });
  } catch {
    return Response.json({ error: "Couldn't save" }, { status: 500, headers: NO_STORE });
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}
