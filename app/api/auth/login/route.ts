/* ────────────────────────────────────────────────────────────────
   Write-auth login (H1 fix).

   POST /api/auth/login  body: { token } → sets httpOnly cookie
   DELETE /api/auth/login → clears it (logout)

   The shared secret (APP_WRITE_TOKEN) is compared server-side and,
   on success, stored as an httpOnly cookie — it never touches
   client JS or the built bundle. See app/api/_lib/writeAuth.ts.
──────────────────────────────────────────────────────────────── */

import { timingSafeEqual } from "node:crypto";
import { WRITE_AUTH_COOKIE } from "../../_lib/writeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const secret = process.env.APP_WRITE_TOKEN;
  if (!secret) {
    return Response.json({ error: "writes disabled — APP_WRITE_TOKEN not configured" }, { status: 503 });
  }

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof raw?.token === "string" ? raw.token : "";
  if (!token || !safeEqual(token, secret)) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const isProd = process.env.NODE_ENV === "production";
  const res = Response.json({ ok: true });
  res.headers.set(
    "Set-Cookie",
    `${WRITE_AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${isProd ? "; Secure" : ""}`,
  );
  return res;
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.set("Set-Cookie", `${WRITE_AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
