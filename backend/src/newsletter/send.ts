/* ────────────────────────────────────────────────────────────────
   Generating and sending newsletter issues (roadmap #36).
     generateIssue  builds this week's draft from the database
     sendTestIssue  one copy to an admin, subject marked [Test]
     sendDueIssue   the Monday 6pm (Sydney) cron: sends the approved
                    issue in batches of 100, recording each recipient,
                    so a retried run carries on where it stopped
──────────────────────────────────────────────────────────────── */
import type { Queryable } from "../storage/db";
import {
  claimForSending, finishSending, getIssue, getIssueByDate, pendingRecipients, recordSends, saveDraftIssue,
  type NewsletterIssue,
} from "../storage/newsletterRepo";
import { gatherIssueData, renderIssue, UNSUBSCRIBE_PLACEHOLDER } from "./content";
import { RESEND_BATCH_LIMIT, sendBatch, type OutgoingEmail, type ResendConfig } from "./resend";
import { inSendWindow, upcomingIssueDate } from "./schedule";
import { unsubscribeUrl } from "./unsubscribe";

export interface SendEnv { resend: ResendConfig; siteUrl: string; secret: string }

export function personalise(issue: Pick<NewsletterIssue, "subject" | "html" | "text">, to: string, env: Pick<SendEnv, "siteUrl" | "secret">, subjectPrefix = ""): OutgoingEmail {
  const url = unsubscribeUrl(env.siteUrl, to, env.secret);
  return {
    to, subject: subjectPrefix + issue.subject, unsubscribeUrl: url,
    html: issue.html.split(UNSUBSCRIBE_PLACEHOLDER).join(url.replace(/&/g, "&amp;")),
    text: issue.text.split(UNSUBSCRIBE_PLACEHOLDER).join(url),
  };
}

/** Builds (or rebuilds) the draft for the coming Monday. Null when that issue is already sending or sent. */
export async function generateIssue(db: Queryable, siteUrl: string, now = new Date()): Promise<NewsletterIssue | null> {
  const issueDate = upcomingIssueDate(now);
  const data = await gatherIssueData(db, issueDate, now);
  const rendered = renderIssue(data, siteUrl);
  return saveDraftIssue(db, { issueDate, ...rendered, data });
}

export async function sendTestIssue(db: Queryable, issueId: number, to: string, env: SendEnv): Promise<void> {
  const issue = await getIssue(db, issueId);
  if (!issue) throw new Error("No such issue");
  await sendBatch(env.resend, [personalise(issue, to, env, "[Test] ")]);
}

export interface SendReport { issueDate: string; status: string; sent: number; failed: number; remaining: number; error?: string }

/**
 * Sends the approved issue for today if it's Monday 6pm or later in Sydney.
 * `force` skips the time check (for a manual run). Stops early, leaving the
 * issue approved for the next run, when the time budget runs out.
 */
export async function sendDueIssue(
  db: Queryable, env: SendEnv, opts: { now?: Date; force?: boolean; issueDate?: string; budgetMs?: number } = {},
): Promise<SendReport> {
  const now = opts.now ?? new Date();
  const window = inSendWindow(now);
  const issueDate = opts.issueDate ?? window.issueDate;
  if (!opts.force && !window.open) return { issueDate, status: "not send time", sent: 0, failed: 0, remaining: 0 };
  const issue = await getIssueByDate(db, issueDate);
  if (!issue) return { issueDate, status: "no issue for today", sent: 0, failed: 0, remaining: 0 };
  if (issue.status === "sent") return { issueDate, status: "already sent", sent: issue.sentCount, failed: issue.failedCount, remaining: 0 };
  if (issue.status === "draft") return { issueDate, status: "not approved", sent: 0, failed: 0, remaining: 0 };
  if (!(await claimForSending(db, issue.id))) return { issueDate, status: "another run is sending", sent: 0, failed: 0, remaining: 0 };

  const started = Date.now();
  const budget = opts.budgetMs ?? 240_000;
  let sent = 0, failed = 0, error: string | null = null;
  let recipients = await pendingRecipients(db, issue.id);
  try {
    while (recipients.length > 0 && Date.now() - started < budget) {
      const batch = recipients.slice(0, RESEND_BATCH_LIMIT);
      try {
        const ids = await sendBatch(env.resend, batch.map((to) => personalise(issue, to, env)), `issue-${issue.id}-${batch[0]}-${batch.length}`);
        await recordSends(db, issue.id, batch.map((email, i) => ({ email, resendId: ids[i] ?? null, error: null })));
        sent += batch.length;
      } catch (e) {
        // A rejected batch stops this run; the next run retries everyone not yet recorded.
        error = e instanceof Error ? e.message : String(e);
        failed += batch.length;
        break;
      }
      recipients = recipients.slice(batch.length);
    }
  } finally {
    await finishSending(db, issue.id, { done: recipients.length === 0 && error === null, error });
  }
  return { issueDate, status: recipients.length === 0 && !error ? "sent" : "partly sent", sent, failed, remaining: recipients.length, ...(error ? { error } : {}) };
}
