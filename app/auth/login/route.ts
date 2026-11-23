// Sends a magic link to an existing account only (shouldCreateUser: false), so this can't be used
// to sign up. The reply is the same whether or not the email has an account.
import { createLeadBurstGuard, LeadRequestError, readLeadRequest } from "../../api/_lib/leadRequest";
import { safeNextPath } from "../../../lib/access";
import { createSupabaseServerClient, supabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const guardBurst = createLeadBurstGuard();
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const limited = guardBurst(request);
  if (limited) return limited;
  if (!supabaseConfigured()) return Response.json({ error: "Sign-in is not configured" }, { status: 503, headers: NO_STORE });
  try {
    const body = await readLeadRequest(request) as Record<string, unknown> | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (email.length > 320 || !EMAIL_RE.test(email)) return Response.json({ error: "Invalid email" }, { status: 400, headers: NO_STORE });
    const next = safeNextPath(typeof body?.next === "string" ? body.next : null);
    const origin = new URL(request.url).origin;
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    // Same answer either way: don't reveal which emails have accounts.
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof LeadRequestError) return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    return Response.json({ error: "Could not send a sign-in link" }, { status: 500, headers: NO_STORE });
  }
}
