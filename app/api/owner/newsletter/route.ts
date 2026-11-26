// Admin → Newsletter actions (roadmap #36): generate this week's draft, send a test to yourself,
// approve or un-approve. Admin + same-origin only. Sending to the list happens only in the Monday cron.
import { createDb, generateIssue, sendTestIssue, setApproved } from "@a3ro/oil-backend";
import { ownerWriteAllowed } from "../../../../lib/ownerGuard";
import { currentViewer } from "../../../../lib/supabase/server";
import { newsletterEnv, SITE_URL } from "../../../../lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: NO_STORE });

export async function POST(request: Request) {
  if (!(await ownerWriteAllowed(request))) return fail("Forbidden", 403);
  const body = await request.json().catch(() => null) as { action?: unknown; id?: unknown } | null;
  const action = body?.action;
  const id = typeof body?.id === "number" && Number.isInteger(body.id) ? body.id : null;
  const viewer = await currentViewer();
  let db;
  try { db = await createDb(); } catch { return fail("Database unavailable", 503); }

  try {
    if (action === "generate") {
      const issue = await generateIssue(db, SITE_URL);
      if (!issue) return fail("This week's issue is already sending or sent, so it can't be regenerated.", 409);
      return Response.json({ ok: true, id: issue.id }, { headers: NO_STORE });
    }
    if (id === null) return fail("Missing issue id");
    if (action === "approve" || action === "unapprove") {
      const ok = await setApproved(db, id, action === "approve", viewer.email ?? "admin");
      if (!ok) return fail(action === "approve" ? "Only a draft can be approved." : "Only an approved issue can go back to draft.", 409);
      return Response.json({ ok: true }, { headers: NO_STORE });
    }
    if (action === "test") {
      if (!viewer.email) return fail("Your account has no email to send the test to.");
      const cfg = newsletterEnv();
      if ("missing" in cfg) return fail(`Can't send: ${cfg.missing} is not set in Vercel.`, 503);
      await sendTestIssue(db, id, viewer.email, cfg.env);
      return Response.json({ ok: true, to: viewer.email }, { headers: NO_STORE });
    }
    return fail("Unknown action");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/newsletter_issues|newsletter_sends|does not exist/i.test(msg)) return fail("Run npm --prefix backend run migrate:newsletter first.", 500);
    return fail(msg.slice(0, 300), 500);
  }
}
