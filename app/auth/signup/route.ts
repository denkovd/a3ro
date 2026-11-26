// Create an account with just an email (roadmap #105). Supabase emails a link; opening it (in the
// same browser) confirms the email, signs the new member in through /auth/callback and lands on
// /account?setup=1, which asks them to choose their first password. If the email already has an
// account, the same link signs that account in and offers a new password, so the reply never says
// whether an email is registered.
import { createLeadBurstGuard, LeadRequestError, readLeadRequest } from "../../api/_lib/leadRequest";
import { sameOrigin } from "../../api/_lib/accountRequest";
import { createSupabaseServerClient, supabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const SETUP_LANDING = "/account?setup=1";
const guardBurst = createLeadBurstGuard();
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const limited = guardBurst(request);
  if (limited) return limited;
  if (!supabaseConfigured()) return Response.json({ error: "Sign-up is not configured" }, { status: 503, headers: NO_STORE });
  try {
    const body = await readLeadRequest(request) as Record<string, unknown> | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (email.length > 320 || !EMAIL_RE.test(email)) return Response.json({ error: "Enter a valid email" }, { status: 400, headers: NO_STORE });
    const origin = new URL(request.url).origin;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(SETUP_LANDING)}` },
    });
    if (error?.status === 429) return Response.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429, headers: NO_STORE });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof LeadRequestError) return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    return Response.json({ error: "Could not send the sign-up link" }, { status: 500, headers: NO_STORE });
  }
}
