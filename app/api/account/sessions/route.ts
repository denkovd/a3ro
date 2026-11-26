// Sign out on every device (roadmap #105): ends all of the account's sessions, this one included.
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { NO_STORE, requireAccount } from "../../_lib/accountRequest";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withErrorLog("api:account-sessions", async function DELETE(req: Request) {
  const account = await requireAccount(req, { write: true });
  if (account instanceof Response) return account;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) return Response.json({ error: "Could not sign out everywhere" }, { status: 500, headers: NO_STORE });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Could not sign out everywhere" }, { status: 500, headers: NO_STORE });
  }
});
