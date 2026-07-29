/* ────────────────────────────────────────────────────────────────
   Dedicated score + tape cron — runs AFTER the main ingest cron so
   composite scores never starve when the 60s Hobby budget is spent
   on PortWatch / FRED / gold. Idempotent: re-running is safe.

   Schedule: vercel.json "10 6 * * *" (10 min after ingest at 06:00).
──────────────────────────────────────────────────────────────── */

import { createDb, runScoreCycle } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await createDb();
    const scores = await runScoreCycle(db);
    return Response.json({ scores });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
