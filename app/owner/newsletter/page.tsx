// Newsletter (Admin, roadmap #36): generate the coming Monday's issue, draft and edit the editorial,
// keep the consensus and red flags current, preview both editions, send a test to yourself, approve it.
// The Monday 6pm (Sydney) cron sends only an approved issue: Premium readers get the Premium edition.
import {
  createDb, getNewsletterSetting, missingLabels, listIssues, listRedFlags, pendingRecipients, upcomingIssueDate,
  type Consensus, type IssueData, type NewsletterIssue, type RedFlag,
} from "@a3ro/oil-backend";
import { requireOwner } from "../../../lib/ownerGuard";
import { newsletterEnv } from "../../../lib/newsletter";
import { OpsPage, OpsSection, OpsTable } from "../ui";
import NewsletterActions from "./NewsletterActions";
import EditorialForm, { type EditorialValue } from "./EditorialForm";
import { ConsensusForm, RedFlagsForm } from "./SettingsForms";

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
  let flags: RedFlag[] | null = null;
  let us: Consensus | null = null, au: Consensus | null = null;
  try {
    const db = await createDb();
    [issues, subscribers] = await Promise.all([listIssues(db), pendingRecipients(db, null).then((r) => r.length)]);
    [flags, us, au] = await Promise.all([listRedFlags(db), getNewsletterSetting<Consensus>(db, "us_consensus"), getNewsletterSetting<Consensus>(db, "au_consensus")]).catch(() => [null, null, null] as const);
  } catch { issues = null; }
  const cfg = newsletterEnv();
  const current = issues?.find((i) => i.issueDate === upcoming) ?? null;
  const data = (current?.data ?? null) as IssueData | null;
  const excluded = data?.premium?.leaderboard?.excluded ?? [];
  const missing = data ? missingLabels(data) : [];
  const editable = current ? current.status === "draft" || current.status === "approved" : false;

  return <OpsPage title="Newsletter" intro="The weekly issue in two editions. Free: big news, flip counts, US and Australia weather, commodities and red flags, Execute (only in an event week), what\u2019s coming and A3RO updates, from open data. Premium adds the flip pattern and tables and the YTD leaderboard. Generate, draft the editorial with Claude and edit it, check both previews, send yourself a test, then approve. Only an approved issue goes out, Monday 6pm Sydney. Any edit or regenerate puts it back to draft.">
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
              {current.subjectPremium ? <p className="text-sm">Premium subject: {current.subjectPremium}</p> : null}
              {current.status === "draft" && missing.length ? <p className="text-xs text-[#b38f00]">✍️ Still to write before approving: {missing.join(", ")}. Generating uses data only; Claude runs only when you press &ldquo;Draft editorial with Claude&rdquo;.</p> : null}
              <NewsletterActions id={current.id} actions={current.status === "draft" ? ["generate", "draft-editorial", "test", "approve"] : current.status === "approved" ? ["test", "unapprove", "generate"] : ["test"]} />
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="flex flex-col gap-1"><p className="text-xs text-[var(--ink-2)]">Free edition</p>
                  <iframe title="Free edition preview" srcDoc={current.html} sandbox="" className="h-[820px] w-full rounded-sm border border-[var(--line)] bg-white" /></div>
                {current.htmlPremium ? <div className="flex flex-col gap-1"><p className="text-xs text-[var(--ink-2)]">Premium edition</p>
                  <iframe title="Premium edition preview" srcDoc={current.htmlPremium} sandbox="" className="h-[820px] w-full rounded-sm border border-[var(--line)] bg-white" /></div>
                  : <p className="text-xs text-[var(--ink-2)]">No Premium edition this week (Trend Finder data unavailable): Premium readers get the free one.</p>}
              </div>
              {excluded.length ? <p className="text-xs text-[var(--ink-2)]">Left out of the leaderboard: {excluded.map((x) => `${x.symbol} (${x.reason})`).join("; ")}.</p> : null}
            </div>
            : <NewsletterActions actions={["generate"]} />}
        </OpsSection>
        {current && editable ? <OpsSection title="Editorial" note="Claude drafts from a web search and this week's data; you check and edit every line. Saving re-renders both editions.">
          <EditorialForm key={current.updatedAt} id={current.id} value={(current.editorial ?? {}) as EditorialValue} premium={Boolean(current.htmlPremium)} />
        </OpsSection> : null}
        <OpsSection title="Consensus" note="The third view in each weather table. Update after each Fed SEP and RBA Statement on Monetary Policy, then regenerate.">
          <ConsensusForm us={us} au={au} />
        </OpsSection>
        <OpsSection title="Commodity red flags" note="Listed under the commodities brief until resolved. Auto flags (chokepoint transits under 70% of normal) clear themselves when the data recovers.">
          {flags === null ? <p className="text-xs text-[var(--ink-2)]">Run <code>npm --prefix backend run migrate:newsletter-v2</code> first.</p> : <RedFlagsForm flags={flags} />}
        </OpsSection>
        <OpsSection title="Past issues">
          <OpsTable cols={["Monday", "Subject", "Status", "Sent", "Failed"]} empty="No issues yet."
            rows={issues.filter((i) => i.issueDate !== upcoming).map((i) => [DAY(i.issueDate), i.subject, STATUS[i.status] ?? i.status, i.sentCount, i.failedCount])} />
        </OpsSection>
      </>}
  </OpsPage>;
}
