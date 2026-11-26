// Account settings for the signed-in member (roadmap #105).
// GET: name, sign-in methods, plan, interests, newsletter. PATCH: change name, interests, newsletter.
import { createDb, getAccountSettings, saveProfile, setNewsletter } from "@a3ro/oil-backend";
import { cleanInterests } from "../../../lib/interests";
import { NO_STORE, readJson, requireAccount } from "../_lib/accountRequest";
import { withErrorLog } from "../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failed = () => Response.json({ error: "Request could not be completed" }, { status: 500, headers: NO_STORE });

export const GET = withErrorLog("api:account", async function GET(req: Request) {
  const account = await requireAccount(req);
  if (account instanceof Response) return account;
  try {
    const settings = await getAccountSettings(await createDb(), account.userId);
    if (!settings) return Response.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE });
    // Admins always have Premium, whatever the table says.
    return Response.json({ ...settings, premium: settings.premium || account.admin, admin: account.admin }, { headers: NO_STORE });
  } catch {
    return failed();
  }
});

export const PATCH = withErrorLog("api:account", async function PATCH(req: Request) {
  const account = await requireAccount(req, { write: true });
  if (account instanceof Response) return account;
  const body = await readJson(req);
  if (!body) return Response.json({ error: "Invalid request body" }, { status: 400, headers: NO_STORE });

  const patch: { displayName?: string | null; interests?: string[] } = {};
  if ("displayName" in body) {
    if (body.displayName !== null && typeof body.displayName !== "string") return Response.json({ error: "Invalid name" }, { status: 400, headers: NO_STORE });
    const name = typeof body.displayName === "string" ? body.displayName.replace(/\s+/g, " ").trim() : "";
    if (name.length > 80) return Response.json({ error: "Name is too long (80 characters at most)" }, { status: 400, headers: NO_STORE });
    patch.displayName = name || null;
  }
  if ("interests" in body) {
    const interests = cleanInterests(body.interests);
    if (!interests) return Response.json({ error: "Invalid interests" }, { status: 400, headers: NO_STORE });
    patch.interests = interests;
  }
  if ("newsletter" in body && typeof body.newsletter !== "boolean") return Response.json({ error: "Invalid newsletter choice" }, { status: 400, headers: NO_STORE });
  if (body.newsletter === true && !account.email) return Response.json({ error: "This account has no email" }, { status: 400, headers: NO_STORE });

  try {
    const db = await createDb();
    if (patch.displayName !== undefined || patch.interests !== undefined) await saveProfile(db, account.userId, patch);
    if (typeof body.newsletter === "boolean") await setNewsletter(db, account.userId, account.email ?? "", body.newsletter);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return failed();
  }
});
