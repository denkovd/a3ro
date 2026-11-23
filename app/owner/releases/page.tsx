// Releases (roadmap #49): recent commits next to Vercel deployments and data refreshes.
// GitHub needs no key (public repo). Vercel needs VERCEL_TOKEN (read-only scope is enough).
import { createDb, getModuleSignals } from "@a3ro/oil-backend";
import { requireOwner } from "../../../lib/ownerGuard";
import { REFRESH_CADENCE_HOURS } from "../../../lib/scorecard";
import { OpsPage, OpsSection, OpsTable, ago } from "../ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = "denkovd/a3ro";
// Not secrets: they identify the project, the token authorises access.
const VERCEL_PROJECT_ID = process.env.VERCEL_OPS_PROJECT_ID ?? "prj_MnHp3NND3aDZq2LZK7R4Jdirup5X";
const VERCEL_TEAM_ID = process.env.VERCEL_OPS_TEAM_ID ?? "team_UC1Bw4Kmfb7IDkHP3NqtmNP9";

const SYDNEY = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const when = (iso: string | number) => SYDNEY.format(new Date(iso));

interface Commit { sha: string; message: string; at: string }
interface Deployment { sha: string | null; state: string; target: string | null; at: number; url: string }

async function commits(): Promise<Commit[] | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=20`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "a3ro-ops" },
      next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const body = await r.json() as { sha: string; commit: { message: string; committer: { date: string } } }[];
    return body.map((c) => ({ sha: c.sha, message: c.commit.message.split("\n")[0], at: c.commit.committer.date }));
  } catch { return null; }
}

async function deployments(): Promise<Deployment[] | "no-token" | null> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return "no-token";
  try {
    const r = await fetch(`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const body = await r.json() as { deployments: { url: string; state?: string; readyState?: string; target?: string | null; created: number; meta?: { githubCommitSha?: string } }[] };
    return body.deployments.map((d) => ({ sha: d.meta?.githubCommitSha ?? null, state: d.state ?? d.readyState ?? "?", target: d.target ?? null, at: d.created, url: d.url }));
  } catch { return null; }
}

export default async function ReleasesPage() {
  await requireOwner();
  const db = await createDb();
  const [c, d, signals, errors] = await Promise.all([
    commits(), deployments(), getModuleSignals(db),
    db.query(`select source, message, count, last_seen from app_errors order by last_seen desc limit 10`).then((r) => r.rows).catch(() => []),
  ]);
  const deployBySha = new Map(Array.isArray(d) ? d.map((x) => [x.sha, x]) : []);

  return <OpsPage title="Releases" intro="Did that deploy break the data? Commits and deployments on the left, data refreshes and errors on the right. Times are Sydney time.">
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <OpsSection title="Commits and deployments" note={d === "no-token" ? <>Deployment status needs a <code>VERCEL_TOKEN</code> environment variable (a read-only Vercel token).</> : d === null ? "Vercel didn't answer; showing commits only." : undefined}>
        {c === null ? <p className="text-xs text-[var(--ink-3)]">GitHub didn&rsquo;t answer.</p> :
          <OpsTable cols={["Commit", "When", "Deploy"]} rows={c.map((x) => {
            const dep = deployBySha.get(x.sha);
            return [<span key="m" className="font-sans"><code className="text-[var(--ink-3)]">{x.sha.slice(0, 7)}</code> {x.message}</span>, when(x.at),
              dep ? <a key="d" href={`https://${dep.url}`} target="_blank" rel="noreferrer" className="underline" style={{ color: dep.state === "READY" ? undefined : "#e5484d" }}>{dep.state.toLowerCase()}{dep.target === "production" ? " · prod" : ""}</a> : "—"];
          })} />}
      </OpsSection>
      <div className="flex flex-col gap-5">
        <OpsSection title="Data refreshes">
          <OpsTable cols={["Module", "Last refresh", "Status"]} rows={Object.entries(REFRESH_CADENCE_HOURS).map(([id, cadence]) => {
            const age = signals.lastRefreshHours[id] ?? null;
            return [id, `${ago(age)} ago`, age == null ? "missing" : age <= cadence ? "fresh" : age <= cadence * 2 ? "late" : "stale"];
          })} />
        </OpsSection>
        <OpsSection title="Recent errors" note={<>From the error log (#48).</>}>
          <OpsTable cols={["Source / message", "Count", "Last"]} empty="No errors logged."
            rows={errors.map((e) => [<span key="s" className="font-sans"><code>{String(e.source)}</code> {String(e.message)}</span>, Number(e.count), when(String(e.last_seen))])} />
        </OpsSection>
      </div>
    </div>
  </OpsPage>;
}
