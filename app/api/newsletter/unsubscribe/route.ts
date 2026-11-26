// Newsletter unsubscribe (roadmap #36). Two callers:
//  - the button on /unsubscribe (a form post with e and t), redirected back to a confirmation
//  - mail apps' one-click unsubscribe (RFC 8058): a POST to the List-Unsubscribe URL with e and t
//    in the query and "List-Unsubscribe=One-Click" as the body
// The token is an HMAC of the email, so only the emailed link can unsubscribe that address.
import { createDb, unsubscribeEmail, unsubscribeSecret, verifyUnsubscribeToken } from "@a3ro/oil-backend";
import { withErrorLog } from "../../_lib/errorLog";
import { SITE_URL } from "../../../../lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrorLog("api:newsletter/unsubscribe", async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const field = (k: string) => String(form?.get(k) ?? url.searchParams.get(k) ?? "");
  const email = field("e").trim().toLowerCase();
  const token = field("t");
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  const back = (status: string) => Response.redirect(new URL(`/unsubscribe?status=${status}`, SITE_URL), 303);

  const secret = unsubscribeSecret();
  const valid = !!secret && /^[^\s@]+@[^\s@]+$/.test(email) && token.length > 0 && verifyUnsubscribeToken(email, token, secret);
  if (!valid) return oneClick ? Response.json({ error: "Invalid link" }, { status: 400 }) : back("invalid");
  try {
    await unsubscribeEmail(await createDb(), email, oneClick ? "one-click" : "link");
  } catch {
    return oneClick ? Response.json({ error: "Try again later" }, { status: 503 }) : back("invalid");
  }
  return oneClick ? new Response(null, { status: 200 }) : back("done");
});
