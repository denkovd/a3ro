// Sign in with email and password (roadmap #105). Only works once the member has set a password
// on /account; new accounts still start with Google or an email link.
import { createLeadBurstGuard, LeadRequestError, readLeadRequest } from "../../api/_lib/leadRequest";
import { sameOrigin } from "../../api/_lib/accountRequest";
import { safeNextPath } from "../../../lib/access";
import { createSupabaseServerClient, supabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const guardBurst = createLeadBurstGuard();
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const limited = guardBurst(request);
  if (limited) return limited;
  if (!supabaseConfigured()) return Response.json({ error: "Sign-in is not configured" }, { status: 503, headers: NO_STORE });
  try {
    const body = await readLeadRequest(request) as Record<string, unknown> | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (email.length > 320 || !EMAIL_RE.test(email) || password.length < 1 || password.length > 128) {
      return Response.json({ error: "Enter your email and password" }, { status: 400, headers: NO_STORE });
    }
    const next = safeNextPath(typeof body?.next === "string" ? body.next : null);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // One answer for every failure: don't reveal which emails exist or have a password.
    if (error) return Response.json({ error: "Email or password is wrong. No password yet? Use Google or the email link, then set one under Account." }, { status: 401, headers: NO_STORE });
    return Response.json({ ok: true, next }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof LeadRequestError) return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    return Response.json({ error: "Could not sign in" }, { status: 500, headers: NO_STORE });
  }
}
