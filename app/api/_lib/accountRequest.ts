// Shared checks for /api/account/* (roadmap #105): same-origin writes from a signed-in account.
import { currentViewer } from "../../../lib/supabase/server";

export const NO_STORE = { "Cache-Control": "private, no-store" };

export type AccountViewer = { userId: string; email: string | null; admin: boolean; premium: boolean };

/** True for a browser request from our own pages (blocks other sites posting on a member's behalf). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const target = new URL(req.url);
  const host = req.headers.get("host");
  if (host) target.host = host;
  return !!origin && origin === target.origin && req.headers.get("sec-fetch-site") !== "cross-site";
}

/** The signed-in account, or a ready error response. Writes also need same-origin. */
export async function requireAccount(req: Request | null, opts: { write?: boolean } = {}): Promise<AccountViewer | Response> {
  if (opts.write && req && !sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const viewer = await currentViewer();
  if (!viewer.signedIn || !viewer.userId) return Response.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE });
  return { userId: viewer.userId, email: viewer.email, admin: viewer.admin, premium: viewer.premium };
}

/** JSON object body, or null. Bodies are small; anything over 16 KB is refused. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > 16 * 1024) return null;
  try {
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
