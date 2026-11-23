// Owner controls (#52): change a module's access level or fit rating. Owner + same-origin only.
import { createDb, saveModuleSetting } from "@a3ro/oil-backend";
import { MODULE_ACCESS } from "../../../../lib/access";
import { clearLevelOverrides } from "../../../../lib/accessOverrides";
import { ownerWriteAllowed } from "../../../../lib/ownerGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const LEVELS = ["public", "owner", "subscriber"] as const;

export async function POST(request: Request) {
  if (!(await ownerWriteAllowed(request))) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const body = await request.json().catch(() => null) as { moduleId?: unknown; level?: unknown; fitRating?: unknown } | null;
  const module = MODULE_ACCESS.find((m) => m.id === body?.moduleId && !m.hidden);
  if (!module) return Response.json({ error: "Unknown module" }, { status: 400, headers: NO_STORE });

  const patch: { level?: (typeof LEVELS)[number] | null; fitRating?: number | null } = {};
  if (body && "level" in body) {
    if (body.level === null || body.level === "default") patch.level = null;
    else if (LEVELS.includes(body.level as (typeof LEVELS)[number])) patch.level = body.level as (typeof LEVELS)[number];
    else return Response.json({ error: "Invalid level" }, { status: 400, headers: NO_STORE });
    if (patch.level === "public" && module.data === "market") {
      return Response.json({ error: `${module.label} uses market data that isn't licensed for public display` }, { status: 400, headers: NO_STORE });
    }
  }
  if (body && "fitRating" in body) {
    if (body.fitRating === null) patch.fitRating = null;
    else if (Number.isInteger(body.fitRating) && Number(body.fitRating) >= 1 && Number(body.fitRating) <= 5) patch.fitRating = Number(body.fitRating);
    else return Response.json({ error: "Fit rating must be 1–5" }, { status: 400, headers: NO_STORE });
  }
  if (!("level" in patch) && !("fitRating" in patch)) return Response.json({ error: "Nothing to change" }, { status: 400, headers: NO_STORE });

  await saveModuleSetting(await createDb(), module.id, patch);
  clearLevelOverrides();
  return Response.json({ ok: true }, { headers: NO_STORE });
}
