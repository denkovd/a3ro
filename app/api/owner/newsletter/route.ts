// Admin → Newsletter actions (roadmap #36): generate this week's draft, draft or save the editorial,
// update the US/AU consensus, manage commodity red flags, send a test to yourself, approve or
// un-approve. Admin + same-origin only. Sending to the list happens only in the Monday cron.
import {
  addRedFlag, createDb, missingLabels, draftEditorial, editorialContext, fetchRecentCommits, generateIssue, getIssue,
  NEWSLETTER_DEFAULT_MODEL, saveEditorial, sendTestIssue, setApproved, setNewsletterSetting, setRedFlagActive,
  type Editorial, type EditorialSlot, type IssueData,
} from "@a3ro/oil-backend";
import { ownerWriteAllowed } from "../../../../lib/ownerGuard";
import { currentViewer } from "../../../../lib/supabase/server";
import { newsletterEnv, SITE_URL } from "../../../../lib/newsletter";
import { newsletterExtras } from "../../../../lib/newsletterExtras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // the Claude draft runs several web searches

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: NO_STORE });
const ok = (extra: Record<string, unknown> = {}) => Response.json({ ok: true, ...extra }, { headers: NO_STORE });

const QUADRANTS = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"] as const;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lines = (v: unknown, n: number, max = 400) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((s) => str(s, max)).filter(Boolean).slice(0, n);

/** The owner's edited editorial, trimmed to the lengths the template expects. */
function cleanEditorial(raw: unknown, by: string, prior: Editorial): Editorial {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bn = (r.bigNews ?? {}) as Record<string, unknown>;
  const up = (r.updates ?? {}) as Record<string, unknown>;
  const headline = str(bn.headline, 200);
  const SLOTS: EditorialSlot[] = ["summary", "bigNews", "pattern", "earnings", "updates"];
  const skip = Array.isArray(r.skip) ? SLOTS.filter((x) => (r.skip as unknown[]).includes(x)) : [];
  return {
    ...prior,
    skip,
    summary: str(r.summary, 260) || null,
    bigNews: headline ? { headline, body: str(bn.body, 1500), why: str(bn.why, 600), briefs: lines(bn.briefs, 3) } : null,
    pattern: str(r.pattern, 900) || null,
    updates: { shipped: lines(up.shipped, 4), fixed: lines(up.fixed, 3), next: lines(up.next, 2) },
    earnings: lines(r.earnings, 7),
    editedAt: new Date().toISOString(),
    editedBy: by,
  };
}

function cleanConsensus(raw: unknown) {
  const r = (raw ?? {}) as Record<string, unknown>;
  const quadrant = QUADRANTS.find((q) => q === r.quadrant);
  const asOf = str(r.asOf, 10);
  if (!quadrant || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  return { quadrant, source: str(r.source, 120) || "Owner", asOf, note: str(r.note, 300) || undefined };
}

export async function POST(request: Request) {
  if (!(await ownerWriteAllowed(request))) return fail("Forbidden", 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  const id = typeof body?.id === "number" && Number.isInteger(body.id) ? body.id : null;
  const viewer = await currentViewer();
  const by = viewer.email ?? "admin";
  let db;
  try { db = await createDb(); } catch { return fail("Database unavailable", 503); }

  try {
    if (action === "generate") {
      const issue = await generateIssue(db, SITE_URL, new Date(), await newsletterExtras());
      if (!issue) return fail("This week's issue is already sending or sent, so it can't be regenerated.", 409);
      return ok({ id: issue.id });
    }
    if (action === "save-settings") {
      for (const key of ["us_consensus", "au_consensus"] as const) {
        if (body?.[key] === undefined) continue;
        const value = cleanConsensus(body[key]);
        if (!value) return fail(`${key === "us_consensus" ? "US" : "Australia"} consensus needs a quadrant and an as-of date.`);
        await setNewsletterSetting(db, key, value, by);
      }
      return ok({ note: "Saved. Regenerate the issue to use it." });
    }
    if (action === "add-flag") {
      const commodity = str(body?.commodity, 40), title = str(body?.title, 160);
      if (!commodity || !title) return fail("A red flag needs a commodity and a title.");
      const since = str(body?.since, 10);
      await addRedFlag(db, { commodity, title, detail: str(body?.detail, 600), since: /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : null }, by);
      return ok({ note: "Added. Regenerate the issue to include it." });
    }
    if (action === "resolve-flag" || action === "reopen-flag") {
      const flagId = typeof body?.flagId === "number" ? body.flagId : null;
      if (flagId === null || !(await setRedFlagActive(db, flagId, action === "reopen-flag", by))) return fail("No such red flag.", 404);
      return ok();
    }

    if (id === null) return fail("Missing issue id");
    if (action === "approve") {
      const issue = await getIssue(db, id);
      const missing = issue?.data ? missingLabels(issue.data as unknown as IssueData) : [];
      if (missing.length) return fail(`Still to write (or tick "Leave out this week"): ${missing.join(", ")}.`, 409);
    }
    if (action === "approve" || action === "unapprove") {
      const done = await setApproved(db, id, action === "approve", by);
      if (!done) return fail(action === "approve" ? "Only a draft can be approved." : "Only an approved issue can go back to draft.", 409);
      return ok();
    }
    if (action === "draft-editorial") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return fail("Can't draft: ANTHROPIC_API_KEY is not set in Vercel.", 503);
      const issue = await getIssue(db, id);
      if (!issue?.data) return fail("Generate the issue first.", 409);
      const data = issue.data as unknown as IssueData;
      const commits = await fetchRecentCommits(new Date(Date.now() - 7 * 86_400_000)).catch(() => []);
      const drafted = await draftEditorial(
        { issueDate: issue.issueDate, context: editorialContext(data), commits, wantPattern: Boolean(data.premium?.flips) },
        { apiKey, model: process.env.NEWSLETTER_MODEL || NEWSLETTER_DEFAULT_MODEL },
      );
      const saved = await saveEditorial(db, id, { ...(issue.editorial ?? {}), ...drafted }, SITE_URL);
      if (!saved) return fail("Only a draft or approved issue can be edited.", 409);
      return ok({ note: "Draft written. Check every line before you approve." });
    }
    if (action === "save-editorial") {
      const issue = await getIssue(db, id);
      if (!issue) return fail("No such issue", 404);
      const saved = await saveEditorial(db, id, cleanEditorial(body?.editorial, by, (issue.editorial ?? {}) as Editorial), SITE_URL);
      if (!saved) return fail("Only a draft or approved issue can be edited.", 409);
      return ok({ note: "Saved. The issue is back to draft." });
    }
    if (action === "test") {
      if (!viewer.email) return fail("Your account has no email to send the test to.");
      const cfg = newsletterEnv();
      if ("missing" in cfg) return fail(`Can't send: ${cfg.missing} is not set in Vercel.`, 503);
      await sendTestIssue(db, id, viewer.email, cfg.env);
      return ok({ to: viewer.email });
    }
    return fail("Unknown action");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/newsletter_settings|newsletter_red_flags|html_premium|editorial/i.test(msg) && /does not exist|column/i.test(msg)) return fail("Run npm --prefix backend run migrate:newsletter-v2 first.", 500);
    if (/newsletter_issues|newsletter_sends|does not exist/i.test(msg)) return fail("Run npm --prefix backend run migrate:newsletter first.", 500);
    return fail(msg.slice(0, 300), 500);
  }
}
