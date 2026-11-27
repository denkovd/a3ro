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
  /** Premium edition (v2, migration 035). Null on older issues: Premium readers then get the free edition. */
  subjectPremium: string | null;
  htmlPremium: string | null;
  textPremium: string | null;
  editorial: Record<string, unknown>;
  data: Record<string, unknown>;
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
    subjectPremium: r.subject_premium == null ? null : String(r.subject_premium),
    htmlPremium: r.html_premium == null ? null : String(r.html_premium),
    textPremium: r.text_premium == null ? null : String(r.text_premium),
    editorial: (r.editorial && typeof r.editorial === "object" ? r.editorial : {}) as Record<string, unknown>,
    data: (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>,
  };
}

/**
 * Saves a freshly generated issue for `issueDate`. Replaces an existing draft
 * (and puts an approved one back to draft, since its content changed); refuses
 * once sending has started. Returns null when refused.
 */
export interface IssueContent {
  issueDate: string; subject: string; html: string; text: string; data: unknown;
  premium?: { subject: string; html: string; text: string } | null;
  editorial?: unknown;
}

export async function saveDraftIssue(db: Queryable, issue: IssueContent): Promise<NewsletterIssue | null> {
  const res = await db.query(
    `insert into newsletter_issues (issue_date, subject, html, text_body, data, subject_premium, html_premium, text_premium, editorial)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::jsonb, '{}'::jsonb))
     on conflict (issue_date) do update set subject = excluded.subject, html = excluded.html, text_body = excluded.text_body,
       data = excluded.data, subject_premium = excluded.subject_premium, html_premium = excluded.html_premium, text_premium = excluded.text_premium,
       editorial = coalesce($9::jsonb, newsletter_issues.editorial),
       status = 'draft', approved_at = null, approved_by = null, updated_at = now()
     where newsletter_issues.status in ('draft', 'approved')
     returning *`,
    [issue.issueDate, issue.subject, issue.html, issue.text, JSON.stringify(issue.data),
      issue.premium?.subject ?? null, issue.premium?.html ?? null, issue.premium?.text ?? null,
      issue.editorial === undefined ? null : JSON.stringify(issue.editorial)],
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

/** Emails that get the Premium edition: accounts with Premium, plus the admins listed in OWNER_EMAILS. */
export async function premiumEmails(db: Queryable, ownerEmails: string[] = []): Promise<Set<string>> {
  const res = await db.query(
    `select lower(au.email) as email from user_access a join auth.users au on au.id = a.user_id where a.premium = true and au.email is not null`,
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return new Set([...res.rows.map((r) => String(r.email)), ...ownerEmails.map(normalizeEmail)]);
}

/* ── settings (consensus quadrants) ─────────────────────────────── */

export async function getSetting<T>(db: Queryable, key: string): Promise<T | null> {
  const res = await db.query(`select value from newsletter_settings where key = $1`, [key]);
  return res.rows[0] ? (res.rows[0].value as T) : null;
}

export async function setSetting(db: Queryable, key: string, value: unknown, by: string): Promise<void> {
  await db.query(
    `insert into newsletter_settings (key, value, updated_by, updated_at) values ($1, $2, $3, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), by],
  );
}

/* ── red flags (ongoing commodity disturbances) ─────────────────── */

export interface RedFlag { id: number; commodity: string; title: string; detail: string; source: "auto" | "manual"; since: string; active: boolean; resolvedAt: string | null }

const toFlag = (r: Record<string, unknown>): RedFlag => ({
  id: Number(r.id), commodity: String(r.commodity), title: String(r.title), detail: String(r.detail ?? ""),
  source: String(r.source) === "auto" ? "auto" : "manual", since: day(r.since), active: r.active === true, resolvedAt: iso(r.resolved_at),
});

export async function activeRedFlags(db: Queryable): Promise<RedFlag[]> {
  const res = await db.query(`select * from newsletter_red_flags where active order by since asc, id asc`);
  return res.rows.map(toFlag);
}

export async function listRedFlags(db: Queryable, limit = 30): Promise<RedFlag[]> {
  const res = await db.query(`select * from newsletter_red_flags order by active desc, coalesce(resolved_at, created_at) desc limit $1`, [limit]);
  return res.rows.map(toFlag);
}

export async function addRedFlag(db: Queryable, flag: { commodity: string; title: string; detail: string; since?: string | null }, by: string): Promise<void> {
  await db.query(
    `insert into newsletter_red_flags (commodity, title, detail, source, since, updated_by) values ($1, $2, $3, 'manual', coalesce($4::date, current_date), $5)`,
    [flag.commodity, flag.title, flag.detail, flag.since || null, by],
  );
}

export async function setRedFlagActive(db: Queryable, id: number, active: boolean, by: string): Promise<boolean> {
  const res = await db.query(
    `update newsletter_red_flags set active = $2, resolved_at = case when $2 then null else now() end, updated_by = $3 where id = $1`,
    [id, active, by],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Auto flags follow the data: raised (or refreshed) while their condition holds, removed once it
 * clears. One the owner resolved stays resolved while the condition holds, then is removed when it clears.
 */
export async function syncAutoRedFlags(db: Queryable, flags: { autoKey: string; commodity: string; title: string; detail: string }[]): Promise<void> {
  for (const f of flags) {
    await db.query(
      `insert into newsletter_red_flags (commodity, title, detail, source, auto_key, updated_by) values ($1, $2, $3, 'auto', $4, 'auto')
       on conflict (auto_key) do update set title = excluded.title, detail = excluded.detail
       where newsletter_red_flags.source = 'auto'`,
      [f.commodity, f.title, f.detail, f.autoKey],
    );
  }
  await db.query(
    `delete from newsletter_red_flags where source = 'auto' and auto_key is not null and not (auto_key = any($1))`,
    [flags.map((f) => f.autoKey)],
  );
}
