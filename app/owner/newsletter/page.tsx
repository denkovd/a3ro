// Newsletter (Admin, roadmap #36): generate the coming Monday's issue, preview it, send a test to
// yourself, approve it. The Monday 6pm (Sydney) cron sends only an approved issue.
import { createDb, listIssues, pendingRecipients, upcomingIssueDate, type NewsletterIssue } from "@a3ro/oil-backend";
import { requireOwner } from "../../../lib/ownerGuard";
import { newsletterEnv } from "../../../lib/newsletter";
import { OpsPage, OpsSection, OpsTable } from "../ui";
import NewsletterActions from "./NewsletterActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const DAY = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const STATUS: Record<string, string> = { draft: "Draft", approved: "Approved, sends Monday 6pm", sending: "Sending…", sent: "Sent" };

export default async function NewsletterPage() {
  await requireOwner();
  const upcoming = upcomingIssueDate(new Date());
  let issues: NewsletterIssue[] | null = null;
  let subscribers: number | null = null;
  try {
    const db = await createDb();
    [issues, subscribers] = await Promise.all([listIssues(db), pendingRecipients(db, null).then((r) => r.length)]);
  } catch { issues = null; }
  const cfg = newsletterEnv();
  const current = issues?.find((i) => i.issueDate === upcoming) ?? null;

  return <OpsPage title="Newsletter" intro="The weekly issue: Australia Pulse, US macro weather and oil flows, from open data only. Generate the draft, check the preview, send yourself a test, then approve it. Only an approved issue goes out, on Monday at 6pm Sydney time. Regenerating an approved issue puts it back to draft.">
    {"missing" in cfg ? <p role="alert" className="text-xs text-[#e5484d]">Sending is off: {cfg.missing} is not set in Vercel.</p> : null}
    {issues === null
      ? <p className="text-xs text-[var(--ink-2)]">The newsletter tables don&rsquo;t exist yet: run <code>npm --prefix backend run migrate:newsletter</code>.</p>
      : <>
        <OpsSection title={`Issue for ${DAY(upcoming)}`} note={`${subscribers ?? "?"} subscriber${subscribers === 1 ? "" : "s"} (newsletter sign-ups, minus unsubscribes and accounts that switched it off).`}>
          {current
            ? <div className="flex flex-col gap-4">
              <p className="text-xs text-[var(--ink-2)]"><span className="text-[var(--ink)]">{STATUS[current.status] ?? current.status}</span> · generated {WHEN.format(new Date(current.updatedAt))}{current.approvedBy ? ` · approved by ${current.approvedBy}` : ""}{current.status === "sent" ? ` · ${current.sentCount} sent, ${current.failedCount} failed` : ""}</p>
              {current.lastError ? <p role="alert" className="text-xs text-[#e5484d]">Last send error: {current.lastError}</p> : null}
              <p className="text-sm">Subject: {current.subject}</p>
              <NewsletterActions id={current.id} actions={current.status === "draft" ? ["generate", "test", "approve"] : current.status === "approved" ? ["test", "unapprove", "generate"] : ["test"]} />
              <iframe title="Issue preview" srcDoc={current.html} sandbox="" className="h-[720px] w-full rounded-sm border border-[var(--line)] bg-white" />
            </div>
            : <NewsletterActions actions={["generate"]} />}
        </OpsSection>
        <OpsSection title="Past issues">
          <OpsTable cols={["Monday", "Subject", "Status", "Sent", "Failed"]} empty="No issues yet."
            rows={issues.filter((i) => i.issueDate !== upcoming).map((i) => [DAY(i.issueDate), i.subject, STATUS[i.status] ?? i.status, i.sentCount, i.failedCount])} />
        </OpsSection>
      </>}
  </OpsPage>;
}
