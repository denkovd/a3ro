/* ────────────────────────────────────────────────────────────────
   Cron auth guard (H2 fix).

   Verifies the `Authorization: Bearer <CRON_SECRET>` header Vercel's
   cron feature sends automatically when CRON_SECRET is configured.

   Fails closed in every environment. Local development can use the
   same database credentials as production, so it must also require
   an explicit secret before any ingestion or other writes run.
──────────────────────────────────────────────────────────────── */

import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Returns a 401/503 Response to short-circuit the caller, or null if
 *  the request is authorized to proceed. */
export function requireCronAuth(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) {
    return Response.json({ error: "cron disabled — CRON_SECRET not configured" }, { status: 503 });
  }

  const auth = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!safeEqual(auth, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
