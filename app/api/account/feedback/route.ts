// Reviews and requests from members (roadmap #105). Shown to admins on Admin → Users.
import { createDb, insertFeedback, type FeedbackKind } from "@a3ro/oil-backend";
import { NO_STORE, readJson, requireAccount } from "../../_lib/accountRequest";
import { createLeadBurstGuard } from "../../_lib/leadRequest";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: readonly FeedbackKind[] = ["review", "request", "problem", "other"];
const guardBurst = createLeadBurstGuard();

export const POST = withErrorLog("api:account-feedback", async function POST(req: Request) {
  const account = await requireAccount(req, { write: true });
  if (account instanceof Response) return account;
  const limited = guardBurst(req);
  if (limited) return limited;
  const body = await readJson(req);
  const kind = body?.kind;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const rating = body?.rating;
  const page = typeof body?.page === "string" && /^\/[\w\-/.]{0,199}$/.test(body.page) ? body.page : null;
  if (typeof kind !== "string" || !KINDS.includes(kind as FeedbackKind)) return Response.json({ error: "Pick what kind of message this is" }, { status: 400, headers: NO_STORE });
  if (message.length < 1 || message.length > 4000) return Response.json({ error: "Write between 1 and 4,000 characters" }, { status: 400, headers: NO_STORE });
  if (rating !== undefined && rating !== null && !(Number.isInteger(rating) && (rating as number) >= 1 && (rating as number) <= 5)) {
    return Response.json({ error: "Invalid rating" }, { status: 400, headers: NO_STORE });
  }
  try {
    await insertFeedback(await createDb(), {
      userId: account.userId, email: account.email, kind: kind as FeedbackKind,
      rating: kind === "review" && typeof rating === "number" ? rating : null, message, page,
    });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Request could not be completed" }, { status: 500, headers: NO_STORE });
  }
});
