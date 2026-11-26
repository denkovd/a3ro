// Newsletter box for signed-in members (roadmap #80).
// GET: is the signed-in account's email already on the newsletter list?
// POST: one tap subscribes the account's own (verified) email. The email
// always comes from the session, never from the request body.
import { createDb, hasNewsletterLead, insertLead } from "@a3ro/oil-backend";
import { currentViewer } from "../../../../lib/supabase/server";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const CONTEXT_RE = /^[\w:.-]{1,80}$/;

export const GET = withErrorLog("api:newsletter-me", async function GET() {
  const viewer = await currentViewer();
  if (!viewer.signedIn || !viewer.email) return Response.json({ signedIn: false }, { headers: NO_STORE });
  try {
    const subscribed = await hasNewsletterLead(await createDb(), viewer.email);
    return Response.json({ signedIn: true, email: viewer.email, subscribed }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Request could not be completed" }, { status: 500, headers: NO_STORE });
  }
});

export const POST = withErrorLog("api:newsletter-me", async function POST(req: Request) {
  // Same-origin only, so another site can't sign a visitor up behind their back.
  const origin = req.headers.get("origin");
  const target = new URL(req.url);
  const host = req.headers.get("host");
  if (host) target.host = host;
  if (!origin || origin !== target.origin || req.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }
  const viewer = await currentViewer();
  if (!viewer.signedIn || !viewer.email) return Response.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE });

  let context = "account";
  try {
    const body = await req.json() as { context?: unknown };
    if (typeof body?.context === "string" && CONTEXT_RE.test(body.context)) context = body.context;
  } catch {
    // No or bad body: keep the default context.
  }
  try {
    const db = await createDb();
    if (!(await hasNewsletterLead(db, viewer.email))) {
      await insertLead(db, { email: viewer.email, context: `newsletter:${context}` });
    }
    return Response.json({ ok: true, subscribed: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Request could not be completed" }, { status: 500, headers: NO_STORE });
  }
});
