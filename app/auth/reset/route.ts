// "Forgot password, or never set one": emails a reset link. Opening it (in the same browser) signs
// the member in through /auth/callback and lands on /account?reset=1, which asks for a new password.
// Works for accounts that started with Google or an old email link too. Never creates an account,
// and the reply is the same whether or not the email has one.
import { createLeadBurstGuard, LeadRequestError, readLeadRequest } from "../../api/_lib/leadRequest";
import { sameOrigin } from "../../api/_lib/accountRequest";
import { createSupabaseServerClient, supabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const guardBurst = createLeadBurstGuard();
const NO_STORE = { "Cache-Control": "no-store" };
const RESET_LANDING = "/account?reset=1";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  const limited = guardBurst(request);
  if (limited) return limited;
  if (!supabaseConfigured()) return Response.json({ error: "Sign-in is not configured" }, { status: 503, headers: NO_STORE });
  try {
    const body = await readLeadRequest(request) as Record<string, unknown> | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (email.length > 320 || !EMAIL_RE.test(email)) return Response.json({ error: "Enter a valid email" }, { status: 400, headers: NO_STORE });
    const origin = new URL(request.url).origin;
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(RESET_LANDING)}`,
    });
    // Same answer either way: don't reveal which emails have accounts.
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof LeadRequestError) return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    return Response.json({ error: "Could not send a reset link" }, { status: 500, headers: NO_STORE });
  }
}
