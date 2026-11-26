/* Newsletter storage (roadmap #36, migration 033_newsletter.sql). */
import type { Queryable } from "./db";
import { normalizeEmail } from "../newsletter/unsubscribe";

export type IssueStatus = "draft" | "approved" | "sending" | "sent";

export interface NewsletterIssue {
  id: number;
  issueDate: string;
  subject: string;
  html: string;
  text: string;
  status: IssueStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  lastError: string | null;
}

const iso = (v: unknown) => (v == null ? null : new Date(v instanceof Date ? v.getTime() : String(v)).toISOString());
const day = (v: unknown) => (v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
  : String(v).slice(0, 10));

function toIssue(r: Record<string, unknown>): NewsletterIssue {
  return {
    id: Number(r.id), issueDate: day(r.issue_date), subject: String(r.subject), html: String(r.html), text: String(r.text_body),
    status: String(r.status) as IssueStatus, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
    approvedAt: iso(r.approved_at), approvedBy: r.approved_by == null ? null : String(r.approved_by),
    sentAt: iso(r.sent_at), sentCount: Number(r.sent_count ?? 0), failedCount: Number(r.failed_count ?? 0),
    lastError: r.last_error == null ? null : String(r.last_error),
  };
}

/**
 * Saves a freshly generated issue for `issueDate`. Replaces an existing draft
 * (and puts an approved one back to draft, since its content changed); refuses
 * once sending has started. Returns null when refused.
 */
export async function saveDraftIssue(
  db: Queryable, issue: { issueDate: string; subject: string; html: string; text: string; data: unknown },
): Promise<NewsletterIssue | null> {
  const res = await db.query(
    `insert into newsletter_issues (issue_date, subject, html, text_body, data)
     values ($1, $2, $3, $4, $5)
     on conflict (issue_date) do update set subject = excluded.subject, html = excluded.html, text_body = excluded.text_body,
       data = excluded.data, status = 'draft', approved_at = null, approved_by = null, updated_at = now()
     where newsletter_issues.status in ('draft', 'approved')
     returning *`,
    [issue.issueDate, issue.subject, issue.html, issue.text, JSON.stringify(issue.data)],
  );
  return res.rows[0] ? toIssue(res.rows[0]) : null;
}

export async function listIssues(db: Queryable, limit = 12): Promise<NewsletterIssue[]> {
  const res = await db.query(`select * from newsletter_issues order by issue_date desc limit $1`, [limit]);
  return res.rows.map(toIssue);
}

export async function getIssue(db: Queryable, id: number): Promise<NewsletterIssue | null> {
  const res = await db.query(`select * from newsletter_issues where id = $1`, [id]);
  return res.rows[0] ? toIssue(res.rows[0]) : null;
}

export async function getIssueByDate(db: Queryable, issueDate: string): Promise<NewsletterIssue | null> {
  const res = await db.query(`select * from newsletter_issues where issue_date = $1`, [issueDate]);
  return res.rows[0] ? toIssue(res.rows[0]) : null;
}

/** Approve (draft → approved) or take approval back (approved → draft). False when the issue isn't in the expected state. */
export async function setApproved(db: Queryable, id: number, approved: boolean, by: string): Promise<boolean> {
  const res = approved
    ? await db.query(`update newsletter_issues set status = 'approved', approved_at = now(), approved_by = $2, updated_at = now()
        where id = $1 and status = 'draft'`, [id, by])
    : await db.query(`update newsletter_issues set status = 'draft', approved_at = null, approved_by = null, updated_at = now()
        where id = $1 and status = 'approved'`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/** Claims an approved issue for sending (or one whose send run died mid-way). False if another run has it or it isn't approved. */
export async function claimForSending(db: Queryable, id: number): Promise<boolean> {
  const res = await db.query(
    `update newsletter_issues set status = 'sending', updated_at = now()
      where id = $1 and (status = 'approved' or (status = 'sending' and updated_at < now() - interval '10 minutes'))`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/** After a send run: 'sent' when everyone got it, otherwise back to 'approved' so the next cron run carries on. */
export async function finishSending(db: Queryable, id: number, outcome: { done: boolean; error: string | null }): Promise<void> {
  await db.query(
    `update newsletter_issues set
       status = case when $2 then 'sent' else 'approved' end,
       sent_at = case when $2 then now() else sent_at end,
       sent_count = (select count(*) from newsletter_sends where issue_id = $1 and error is null),
       failed_count = (select count(*) from newsletter_sends where issue_id = $1 and error is not null),
       last_error = $3, updated_at = now()
     where id = $1`,
    [id, outcome.done, outcome.error],
  );
}

/**
 * Who gets the newsletter: newsletter sign-ups (leads with a 'newsletter:' context),
 * minus unsubscribed emails, minus accounts that switched it off on /account,
 * minus anyone this issue already went to.
 */
export async function pendingRecipients(db: Queryable, issueId: number | null): Promise<string[]> {
  const res = await db.query(
    `select distinct lower(trim(l.email)) as email
       from leads l
      where l.context like 'newsletter:%'
        and l.email like '%@%'
        and not exists (select 1 from newsletter_unsubscribes u where u.email = lower(trim(l.email)))
        and not exists (select 1 from auth.users au join user_profiles p on p.user_id = au.id
                         where lower(au.email) = lower(trim(l.email)) and p.newsletter = false)
        and ($1::bigint is null or not exists (select 1 from newsletter_sends s where s.issue_id = $1 and s.email = lower(trim(l.email))))
      order by 1`,
    [issueId],
  );
  return res.rows.map((r) => String(r.email));
}

export async function recordSends(db: Queryable, issueId: number, rows: { email: string; resendId: string | null; error: string | null }[]): Promise<void> {
  if (rows.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [issueId];
  rows.forEach((r, i) => {
    values.push(`($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`);
    params.push(r.email, r.resendId, r.error);
  });
  await db.query(
    `insert into newsletter_sends (issue_id, email, resend_id, error) values ${values.join(",")}
     on conflict (issue_id, email) do update set resend_id = excluded.resend_id, error = excluded.error, sent_at = now()`,
    params,
  );
}

export async function unsubscribeEmail(db: Queryable, email: string, source = "link"): Promise<void> {
  await db.query(
    `insert into newsletter_unsubscribes (email, source) values ($1, $2) on conflict (email) do nothing`,
    [normalizeEmail(email), source],
  );
}

/** Signing up again (a newsletter box or the Account page) lifts an earlier unsubscribe. */
export async function clearUnsubscribe(db: Queryable, email: string): Promise<void> {
  await db.query(`delete from newsletter_unsubscribes where email = $1`, [normalizeEmail(email)]).catch(() => undefined);
}
