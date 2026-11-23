// Data health (Ops, roadmap #47): cron runs, freshness per series, data issues.
import { createDb, getCronRuns, getDataHealth, getRecentAppErrors } from "@a3ro/oil-backend";
import type { CronRunRow, DataHealth, SeriesFreshness, SeriesHealth } from "@a3ro/oil-backend";
import { CRON_JOBS, cronOverdue } from "../../../lib/cronJobs";
import { requireOwner } from "../../../lib/ownerGuard";
import { OpsPage, OpsSection, OpsTable } from "../ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const when = (iso: string | null) => iso ? WHEN.format(new Date(iso)) : "—";
const secs = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;

const RED = "#e5484d", AMBER = "#f5a524", GREEN = "#30a46c";
const RUN_TONE = { ok: GREEN, degraded: AMBER, failed: RED } as const;
const FRESH_TONE: Record<SeriesFreshness, string> = { fresh: GREEN, aging: AMBER, stale: RED, missing: RED };
const FRESH_ORDER: Record<SeriesFreshness, number> = { missing: 0, stale: 1, aging: 2, fresh: 3 };

const Tag = ({ tone, children }: { tone: string; children: string }) => <span className="font-mono" style={{ color: tone }}>{children}</span>;
const Wrap = ({ children }: { children: string | null }) => <span className="block max-w-md whitespace-normal break-words text-left font-sans text-[var(--ink-2)]">{children ?? "—"}</span>;

function seriesCounts(results: CronRunRow["results"]) {
  if (!results.length) return "—";
  const failed = results.filter((r) => r.state === "failed").length;
  const skipped = results.filter((r) => r.state === "skipped").length;
  return `${results.length - failed - skipped} ok${failed ? ` · ${failed} failed` : ""}${skipped ? ` · ${skipped} skipped` : ""}`;
}

export default async function DataHealthPage() {
  await requireOwner();
  const now = new Date();
  let runs: Awaited<ReturnType<typeof getCronRuns>> | null = null;
  let health: DataHealth = { series: [], issues: [] };
  let cronErrors: Awaited<ReturnType<typeof getRecentAppErrors>> = [];
  let dbDown = false;
  try {
    const db = await createDb();
    [runs, health, cronErrors] = await Promise.all([
      getCronRuns(db).catch(() => null),
      getDataHealth(db, now),
      getRecentAppErrors(db, 50).catch(() => []),
    ]);
  } catch {
    dbDown = true;
  }

  const latestBy = new Map((runs?.latest ?? []).map((r) => [r.job, r]));
  const jobs = CRON_JOBS.map((j) => {
    const last = latestBy.get(j.job) ?? null;
    return { ...j, last, overdue: runs !== null && cronOverdue(last?.startedAt ?? null, j.everyHours, now) };
  });
  const failedJobs = jobs.filter((j) => j.last?.status === "failed").length;
  const overdueJobs = jobs.filter((j) => j.overdue).length;
  const badSeries = health.series.filter((s) => s.freshness === "stale" || s.freshness === "missing").length;
  const recentCronErrors = cronErrors.filter((e) => e.source.startsWith("cron:") && now.getTime() - Date.parse(e.lastSeen) < 7 * 86_400_000);
  const groups = [...new Set(health.series.map((s) => s.group))];

  return <OpsPage title="Data health" intro="Whether each scheduled job ran and worked, how fresh each series is, and anything odd in the data. Freshness means the age of the newest observation for Australia Watch (against its expected release) and the age of the last good fetch for the feeds.">
    {dbDown ? <p className="text-sm" style={{ color: RED }}>Couldn&rsquo;t reach the database.</p> : <p className="text-sm text-[var(--ink-2)]">
      {failedJobs || overdueJobs || badSeries ? <>
        {failedJobs ? <Tag tone={RED}>{`${failedJobs} job${failedJobs === 1 ? "" : "s"} failed last run`}</Tag> : null}
        {failedJobs && (overdueJobs || badSeries) ? " · " : null}
        {overdueJobs ? <Tag tone={AMBER}>{`${overdueJobs} overdue`}</Tag> : null}
        {overdueJobs && badSeries ? " · " : null}
        {badSeries ? <Tag tone={RED}>{`${badSeries} series stale or missing`}</Tag> : null}
      </> : <Tag tone={GREEN}>All jobs ran and every series is fresh or aging.</Tag>}
    </p>}

    <OpsSection title="Scheduled jobs" note={<>From <code>vercel.json</code>. A job is overdue once 1.5 intervals pass without a run.</>}>
      {runs === null && !dbDown ? <p className="mb-3 text-xs text-[var(--ink-2)]">Run history isn&rsquo;t saved yet: run <code>npm --prefix backend run migrate:cron-runs</code>. Runs are recorded from the next cron onwards.</p> : null}
      <OpsTable cols={["Job", "Schedule", "Last run", "Took", "Result", "Series", "Error"]} rows={jobs.map((j) => [
        <span key="j" className="font-mono">{j.job}</span>,
        j.label,
        j.overdue ? <Tag key="w" tone={AMBER}>{j.last ? `${when(j.last.startedAt)} (overdue)` : "never"}</Tag> : when(j.last?.startedAt ?? null),
        j.last ? secs(j.last.durationMs) : "—",
        j.last ? <Tag key="s" tone={RUN_TONE[j.last.status]}>{`${j.last.status} · ${j.last.httpStatus}`}</Tag> : "—",
        j.last ? seriesCounts(j.last.results) : "—",
        <Wrap key="e">{j.last?.error ?? null}</Wrap>,
      ])} />
      {jobs.some((j) => j.last?.results.some((r) => r.state === "failed")) ? <div className="mt-4 flex flex-col gap-1 text-xs">
        <p className="text-[var(--ink-3)]">Failed series in the latest runs</p>
        {jobs.flatMap((j) => (j.last?.results ?? []).filter((r) => r.state === "failed").map((r) =>
          <p key={`${j.job}/${r.name}`}><span className="font-mono">{j.job} · {r.name}</span> <span className="text-[var(--ink-2)]">{r.detail ?? ""}</span></p>))}
      </div> : null}
    </OpsSection>

    <OpsSection title="Freshness by series" note="Stale or missing first. Australia Watch uses estimated release lags, so a late ABS release can show as aging for a few days.">
      <div className="flex flex-col gap-6">
        {groups.map((g) => {
          const rows = health.series.filter((s) => s.group === g).sort((a, b) => FRESH_ORDER[a.freshness] - FRESH_ORDER[b.freshness] || a.label.localeCompare(b.label));
          const tally = (["fresh", "aging", "stale", "missing"] as const).map((f) => [f, rows.filter((r) => r.freshness === f).length] as const).filter(([, n]) => n);
          return <div key={g}>
            <p className="mb-2 text-xs"><span className="font-medium">{g}</span> <span className="text-[var(--ink-3)]">{tally.map(([f, n]) => `${n} ${f}`).join(" · ")}</span></p>
            <OpsTable cols={["Series", "Freshness", "Data as of", "Last fetch", "Note"]} rows={rows.map((s: SeriesHealth) => [
              <span key="l">{s.label}{s.label !== s.id ? <span className="ml-2 font-mono text-[var(--ink-3)]">{s.id}</span> : null}</span>,
              <Tag key="f" tone={FRESH_TONE[s.freshness]}>{s.freshness}</Tag>,
              s.asOf && s.asOf.includes("T") ? when(s.asOf) : s.asOf ?? "—",
              s.lastFetchAt ? <Tag key="x" tone={s.lastFetchOk === false ? RED : "var(--ink-2)"}>{`${when(s.lastFetchAt)}${s.lastFetchOk === false ? " failed" : ""}`}</Tag> : "—",
              <Wrap key="n">{[s.error, s.note].filter(Boolean).join(" · ") || null}</Wrap>,
            ])} empty="No series found (table missing or empty)." />
          </div>;
        })}
        {groups.length === 0 && !dbDown ? <p className="text-xs text-[var(--ink-3)]">No series found.</p> : null}
      </div>
    </OpsSection>

    <OpsSection title="Data issues" note="Sudden jumps (newest change over 4× the series' usual move), revisions in the last 30 days, disabled sources, and cron errors from the error log in the last 7 days.">
      <OpsTable cols={["Kind", "Where", "What", "When"]} rows={[
        ...health.issues.map((i) => [i.kind, <span key="w" className="font-sans">{i.where}</span>, <Wrap key="m">{i.message}</Wrap>, when(i.at)]),
        ...recentCronErrors.map((e) => ["fetch error", <span key="w" className="font-mono">{e.source}</span>, <Wrap key="m">{e.count > 1 ? `${e.message} (×${e.count})` : e.message}</Wrap>, when(e.lastSeen)]),
      ]} empty="No issues found." />
    </OpsSection>

    {runs && runs.recent.length ? <OpsSection title="Recent runs">
      <OpsTable cols={["Job", "Started", "Took", "Result", "Series"]} rows={runs.recent.map((r) => [
        <span key="j" className="font-mono">{r.job}</span>, when(r.startedAt), secs(r.durationMs),
        <Tag key="s" tone={RUN_TONE[r.status]}>{`${r.status} · ${r.httpStatus}`}</Tag>, seriesCounts(r.results),
      ])} />
    </OpsSection> : null}
  </OpsPage>;
}
