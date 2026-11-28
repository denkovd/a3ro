/* ────────────────────────────────────────────────────────────────
   Generating and sending newsletter issues (roadmap #36).
     generateIssue  builds this week's draft (free + Premium editions) from
                    the database, keeping the editorial already saved
     saveEditorial  stores edited big news / pattern / updates / earnings
                    and re-renders both editions (back to draft)
     sendTestIssue  one copy of each edition to an admin, marked [Test]
     sendDueIssue   the Monday 6pm (Sydney) cron: sends the approved
                    issue in batches of 100, recording each recipient,
                    so a retried run carries on where it stopped
──────────────────────────────────────────────────────────────── */
import type { Queryable } from "../storage/db";
import {
  claimForSending, finishSending, getIssue, getIssueByDate, listIssues, pendingRecipients, premiumEmails, recordSends, saveDraftIssue,
  type NewsletterIssue,
} from "../storage/newsletterRepo";
import { gatherIssueData, previousWeather, renderIssue, UNSUBSCRIBE_PLACEHOLDER, type IssueData, type IssueExtras } from "./content";
import type { Editorial } from "./editorial";
import { RESEND_BATCH_LIMIT, sendBatch, type OutgoingEmail, type ResendConfig } from "./resend";
import { inSendWindow, upcomingIssueDate } from "./schedule";
import { unsubscribeUrl } from "./unsubscribe";

export interface SendEnv { resend: ResendConfig; siteUrl: string; secret: string; ownerEmails?: string[] }

export function personalise(issue: Pick<NewsletterIssue, "subject" | "html" | "text">, to: string, env: Pick<SendEnv, "siteUrl" | "secret">, subjectPrefix = ""): OutgoingEmail {
  const url = unsubscribeUrl(env.siteUrl, to, env.secret);
  return {
    to, subject: subjectPrefix + issue.subject, unsubscribeUrl: url,
    html: issue.html.split(UNSUBSCRIBE_PLACEHOLDER).join(url.replace(/&/g, "&amp;")),
    text: issue.text.split(UNSUBSCRIBE_PLACEHOLDER).join(url),
  };
}

/** Renders both editions from stored data and an editorial. */
export function renderBoth(data: IssueData, siteUrl: string) {
  const free = renderIssue(data, siteUrl, "free");
  const premium = data.premium ? renderIssue(data, siteUrl, "premium") : null;
  return { free, premium };
}

/** Builds (or rebuilds) the draft for the coming Monday. Null when that issue is already sending or sent. */
export async function generateIssue(db: Queryable, siteUrl: string, now = new Date(), extras: IssueExtras = {}): Promise<NewsletterIssue | null> {
  const issueDate = upcomingIssueDate(now);
  const [existing, recent] = await Promise.all([getIssueByDate(db, issueDate), listIssues(db, 3).catch(() => [])]);
  const previous = recent.find((i) => i.issueDate < issueDate);
  const previousExportPeriods = (previous?.data?.commodity as { exportPeriods?: Record<string, string> } | undefined)?.exportPeriods ?? {};
  const data = await gatherIssueData(db, issueDate, now, { previousExportPeriods, previousWeather: previousWeather(previous), ...extras });
  data.editorial = (existing?.editorial ?? {}) as Editorial;
  const { free, premium } = renderBoth(data, siteUrl);
  return saveDraftIssue(db, { issueDate, ...free, premium, data });
}

/** Saves the owner's editorial on a draft or approved issue and re-renders it (back to draft). */
export async function saveEditorial(db: Queryable, issueId: number, editorial: Editorial, siteUrl: string): Promise<NewsletterIssue | null> {
  const issue = await getIssue(db, issueId);
  if (!issue || (issue.status !== "draft" && issue.status !== "approved")) return null;
  const data = { ...(issue.data as unknown as IssueData), editorial };
  const { free, premium } = renderBoth(data, siteUrl);
  return saveDraftIssue(db, { issueDate: issue.issueDate, ...free, premium, data, editorial });
}

export async function sendTestIssue(db: Queryable, issueId: number, to: string, env: SendEnv): Promise<void> {
  const issue = await getIssue(db, issueId);
  if (!issue) throw new Error("No such issue");
  const emails = [personalise(issue, to, env, "[Test · Free] ")];
  if (issue.htmlPremium && issue.textPremium) emails.push(personalise(premiumCopy(issue), to, env, "[Test · Premium] "));
  await sendBatch(env.resend, emails);
}

/** The Premium edition of an issue, or the free one when the issue has none. */
export function premiumCopy(issue: Pick<NewsletterIssue, "subject" | "html" | "text" | "subjectPremium" | "htmlPremium" | "textPremium">) {
  return issue.htmlPremium && issue.textPremium
    ? { subject: issue.subjectPremium ?? issue.subject, html: issue.htmlPremium, text: issue.textPremium }
    : { subject: issue.subject, html: issue.html, text: issue.text };
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
  const premium = issue.htmlPremium ? await premiumEmails(db, env.ownerEmails ?? []) : new Set<string>();
  const copyFor = (to: string) => (premium.has(to) ? premiumCopy(issue) : issue);
  try {
    while (recipients.length > 0 && Date.now() - started < budget) {
      const batch = recipients.slice(0, RESEND_BATCH_LIMIT);
      try {
        const ids = await sendBatch(env.resend, batch.map((to) => personalise(copyFor(to), to, env)), `issue-${issue.id}-${batch[0]}-${batch.length}`);
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
