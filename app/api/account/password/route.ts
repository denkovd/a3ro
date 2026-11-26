// Set or change the account's password (roadmap #105). Only from an emailed link: the sign-up link
// (first password) or a reset link from the login page or Account. The session must have signed in
// through that link within the last 15 minutes (verified `amr` claim, lib/emailLinkSession.ts).
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { signedInByRecentEmailLink } from "../../../../lib/emailLinkSession";
import { NO_STORE, readJson, requireAccount } from "../../_lib/accountRequest";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD = 10;

export const POST = withErrorLog("api:account-password", async function POST(req: Request) {
  const account = await requireAccount(req, { write: true });
  if (account instanceof Response) return account;
  const body = await readJson(req);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD || password.length > 128) {
    return Response.json({ error: `Use ${MIN_PASSWORD} to 128 characters` }, { status: 400, headers: NO_STORE });
  }
  try {
    const supabase = await createSupabaseServerClient();
    // getClaims verifies the access token's signature before its claims are trusted.
    const { data: claims } = await supabase.auth.getClaims();
    if (!signedInByRecentEmailLink(claims?.claims?.amr)) {
      return Response.json({ error: "This link has run out. Use “Email me a reset link” to get a new one." }, { status: 403, headers: NO_STORE });
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      // Supabase's own rules (weak or leaked password, same as before) come back as a 4xx.
      const status = typeof error.status === "number" && error.status >= 400 && error.status < 500 ? 400 : 500;
      const message = error.code === "same_password" ? "That's already your password"
        : error.code === "weak_password" ? "That password is too weak or has appeared in a data breach. Try a longer one."
        : error.code === "reauthentication_needed" ? "This link has run out. Use “Email me a reset link” to get a new one."
        : status === 400 ? error.message : "Password could not be saved";
      return Response.json({ error: message }, { status, headers: NO_STORE });
    }
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Password could not be saved" }, { status: 500, headers: NO_STORE });
  }
});
