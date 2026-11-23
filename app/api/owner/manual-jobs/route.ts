// Mark a manual job done (Ops → Manual jobs). Owner + same-origin only.
import { createDb, recordManualJobRun } from "@a3ro/oil-backend";
import { MANUAL_JOBS } from "../../../../lib/manualJobs";
import { ownerWriteAllowed } from "../../../../lib/ownerGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!(await ownerWriteAllowed(request))) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const body = await request.json().catch(() => null) as { jobId?: unknown; note?: unknown } | null;
  const job = MANUAL_JOBS.find((j) => j.id === body?.jobId);
  if (!job) return Response.json({ error: "Unknown job" }, { status: 400, headers: NO_STORE });
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  try {
    await recordManualJobRun(await createDb(), job.id, note);
  } catch {
    return Response.json({ error: "Couldn't save. Has migrate:manual-jobs been run?" }, { status: 500, headers: NO_STORE });
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}
