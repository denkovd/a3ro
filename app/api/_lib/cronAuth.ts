/* ────────────────────────────────────────────────────────────────
   Cron auth guard (H2 fix).

   Verifies the `Authorization: Bearer <CRON_SECRET>` header Vercel's
   cron feature sends automatically when CRON_SECRET is configured.

   Fails closed in production: a missing CRON_SECRET no longer means
   "unguarded" — it means the route refuses to run. Unset in
   non-production is still allowed through, so local dev doesn't
   require configuring a secret. (Previously, an unset CRON_SECRET
   skipped the check entirely in every environment, including prod —
   see Security-review.md H2.)
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
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "cron disabled — CRON_SECRET not configured" }, { status: 503 });
    }
    return null;
  }

  const auth = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!safeEqual(auth, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
