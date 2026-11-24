// Switch Premium on or off for an account (Admin → Users). Admin + same-origin only.
// Payments (#27) will later set the same flag with source 'stripe'.
import { createDb, setPremium } from "@a3ro/oil-backend";
import { ownerWriteAllowed } from "../../../../lib/ownerGuard";
import { clearPremiumCache } from "../../../../lib/premium";
import { currentViewer } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!(await ownerWriteAllowed(request))) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const body = await request.json().catch(() => null) as { userId?: unknown; premium?: unknown } | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!UUID_RE.test(userId)) return Response.json({ error: "Unknown account" }, { status: 400, headers: NO_STORE });
  if (typeof body?.premium !== "boolean") return Response.json({ error: "premium must be true or false" }, { status: 400, headers: NO_STORE });
  const by = (await currentViewer()).email ?? "admin";
  try {
    const found = await setPremium(await createDb(), userId, body.premium, { by, source: "admin" });
    if (!found) return Response.json({ error: "Unknown account" }, { status: 404, headers: NO_STORE });
  } catch {
    return Response.json({ error: "Couldn't save. Has migrate:user-access been run?" }, { status: 500, headers: NO_STORE });
  }
  clearPremiumCache(userId);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
