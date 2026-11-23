// Manual jobs (Ops): recurring hand-done updates, when each was last done and when it's next due.
import { createDb, getManualJobRuns } from "@a3ro/oil-backend";
import { MANUAL_JOBS, jobSchedule } from "../../../lib/manualJobs";
import { requireOwner } from "../../../lib/ownerGuard";
import { OpsPage, OpsSection, OpsTable } from "../ui";
import MarkDone from "./MarkDone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });
const fmt = (iso: string) => DAY.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
const TONE = { ok: "var(--ink-2)", "due soon": "#f5a524", overdue: "#e5484d" } as const;

export default async function ManualJobsPage() {
  await requireOwner();
  let runs: Awaited<ReturnType<typeof getManualJobRuns>> | null = null;
  try { runs = await getManualJobRuns(await createDb()); } catch { runs = null; }
  const now = new Date();
  const jobs = MANUAL_JOBS.map((job) => ({ job, ...jobSchedule(job, runs?.latest[job.id] ?? null, now) }))
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const overdue = jobs.filter((j) => j.status === "overdue").length;

  return <OpsPage title="Manual jobs" intro="Updates done by hand because the data has no feed we can use. Do the steps, push the change, then mark the job done to restart its clock.">
    {runs === null ? <p className="text-xs text-[var(--ink-2)]">History isn&rsquo;t saved yet: run <code>npm --prefix backend run migrate:manual-jobs</code>. Due dates below count from when the figures in the code were last checked.</p> : null}
    {overdue ? <p className="text-sm" style={{ color: TONE.overdue }}>{overdue} job{overdue === 1 ? " is" : "s are"} overdue.</p> : null}
    <div className="flex flex-col gap-4">
      {jobs.map(({ job, last, nextDue, daysLeft, status }) => <OpsSection key={job.id} title={job.title}
        note={<>Every {job.everyMonths === 12 ? "year" : `${job.everyMonths} months`} · edit <code>{job.where}</code></>}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[var(--ink-2)] md:max-w-2xl">
            {job.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <div className="flex shrink-0 flex-col items-end gap-2 text-right text-xs">
            <span className="text-[var(--ink-3)]">Last done {fmt(last)}</span>
            <span className="font-mono" style={{ color: TONE[status] }}>
              {status === "overdue" ? `Overdue by ${-daysLeft} day${daysLeft === -1 ? "" : "s"}` : `Due ${fmt(nextDue)}${status === "due soon" ? ` (in ${daysLeft} days)` : ""}`}
            </span>
            {runs !== null ? <MarkDone jobId={job.id} /> : null}
          </div>
        </div>
      </OpsSection>)}
    </div>
    {runs && runs.recent.length ? <OpsSection title="History">
      <OpsTable cols={["Job", "Done", "Note"]} rows={runs.recent.map((r) => [MANUAL_JOBS.find((j) => j.id === r.jobId)?.title ?? r.jobId, fmt(r.doneAt), <span key="n" className="font-sans">{r.note ?? "—"}</span>])} />
    </OpsSection> : null}
  </OpsPage>;
}
