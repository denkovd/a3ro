import { createDb } from "@a3ro/oil-backend";
import { runRefineryCycle } from "../../../../backend/src/ingest/refineryCycle";
import { requireCronAuth } from "../../_lib/cronAuth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try { return Response.json(await runRefineryCycle(await createDb())); }
  catch { return Response.json({ error: "Refinery evidence refresh failed" }, { status: 500 }); }
}
