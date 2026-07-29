/* ────────────────────────────────────────────────────────────────
   Shared write-auth guard for mutating API routes (H1 fix).

   This app has no session system — it's a single-operator dashboard.
   Writes are gated behind one shared secret (APP_WRITE_TOKEN):
     - Browser calls: httpOnly cookie set by POST /api/auth/login,
       sent automatically on same-origin fetch — the token itself
       never reaches client JS or the bundle.
     - Scripted/cron-style calls: `Authorization: Bearer <token>`.

   Same fail-closed posture as the CRON_SECRET guard, minus the H2
   bug: if the secret is unset in production, writes are refused
   rather than silently open. Unset in dev is allowed through so
   local iteration doesn't require configuring a token.
──────────────────────────────────────────────────────────────── */

import { timingSafeEqual } from "node:crypto";

export const WRITE_AUTH_COOKIE = "a3ro_write_token";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** Returns a 401/503 Response to short-circuit the caller, or null if
 *  the request is authorized to proceed. */
export function requireWriteAuth(request: Request): Response | null {
  const secret = process.env.APP_WRITE_TOKEN;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "writes disabled — APP_WRITE_TOKEN not configured" }, { status: 503 });
    }
    return null;
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const supplied = bearerToken ?? readCookie(request, WRITE_AUTH_COOKIE);

  if (!supplied || !safeEqual(supplied, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
