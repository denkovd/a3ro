// Delete my account (roadmap #105). The member types their email to confirm. Removes the
// account, its profile, Premium row, feedback and newsletter sign-ups, then signs out.
import { createDb, deleteAccount } from "@a3ro/oil-backend";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { NO_STORE, readJson, requireAccount } from "../../_lib/accountRequest";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrorLog("api:account-delete", async function POST(req: Request) {
  const account = await requireAccount(req, { write: true });
  if (account instanceof Response) return account;
  if (account.admin) return Response.json({ error: "Admin accounts can't be deleted here" }, { status: 400, headers: NO_STORE });
  const body = await readJson(req);
  const confirm = typeof body?.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
  if (!account.email || confirm !== account.email.toLowerCase()) {
    return Response.json({ error: "Type your email exactly to confirm" }, { status: 400, headers: NO_STORE });
  }
  try {
    await deleteAccount(await createDb(), account.userId, account.email);
    // Clear this browser's session cookies. The account is already gone, so Supabase may answer
    // 401/404; supabase-js still removes the local session in that case.
    try { await (await createSupabaseServerClient()).auth.signOut({ scope: "local" }); } catch { /* nothing left to end */ }
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Account could not be deleted" }, { status: 500, headers: NO_STORE });
  }
});
