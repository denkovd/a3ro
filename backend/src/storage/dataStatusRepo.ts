/* ────────────────────────────────────────────────────────────────
   Public "data as of" line (roadmap #21): when each module's data was
   last refreshed. Reads the same sources as the Ops data health tab
   (#47): the last successful cron run per job (cron_runs), plus the
   two pipelines that run outside Vercel cron and leave their own
   timestamps (the Bull Market Finder scan and the earnings pull).
   Only timestamps leave this file: no errors, no per-series detail.
──────────────────────────────────────────────────────────────── */
import type { Queryable } from "./db";

/** Which jobs refresh each module (ids match lib/access.ts MODULE_ACCESS). */
export const MODULE_DATA_JOBS: Readonly<Record<string, readonly string[]>> = {
  australia: ["australia-watch", "australia-oecd"],
  dividend: ["dividend-signals", "dividend-constraints"],
  commodity: ["oil"],
  macro: ["macro"],
  regime: ["macro"],
  gold: ["ingest"],
  btc: ["btc"],
  crypto: ["crypto-fundamentals"],
};

export interface ModuleDataStatus { updatedAt: string }
export type DataStatus = Record<string, ModuleDataStatus>;

const iso = (v: unknown) => {
  if (v == null) return null;
  const t = Date.parse(v instanceof Date ? v.toISOString() : String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const empty = { rows: [] as Record<string, unknown>[] };

/** Latest of several timestamps, ignoring missing ones. */
export function latestOf(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of values) if (v && (!best || v > best)) best = v;
  return best;
}

/** Turns per-job finish times into per-module "updated at" times. */
export function moduleStatusFromJobs(jobFinishedAt: Record<string, string>, extra: Record<string, string | null> = {}): DataStatus {
  const out: DataStatus = {};
  for (const [moduleId, jobs] of Object.entries(MODULE_DATA_JOBS)) {
    const at = latestOf(jobs.map((j) => jobFinishedAt[j]));
    if (at) out[moduleId] = { updatedAt: at };
  }
  for (const [moduleId, at] of Object.entries(extra)) if (at) out[moduleId] = { updatedAt: at };
  return out;
}

export async function getDataStatus(db: Queryable): Promise<DataStatus> {
  const [runs, bull, earnings] = await Promise.all([
    db.query(`select distinct on (job) job, started_at + make_interval(secs => duration_ms / 1000.0) as finished_at
        from cron_runs where status in ('ok', 'degraded') order by job, started_at desc`).catch(() => empty),
    // The scan writes one snapshot set per US session; run_date is that session's date.
    db.query(`select max(run_date) as d from bull_snapshots`).catch(() => empty),
    db.query(`select max(pulled_at) as d from earnings_surprises`).catch(() => empty),
  ]);
  const jobs: Record<string, string> = {};
  for (const r of runs.rows) {
    const at = iso(r.finished_at);
    if (at) jobs[String(r.job)] = at;
  }
  return moduleStatusFromJobs(jobs, {
    trend: iso(bull.rows[0]?.d),
    earnings: iso(earnings.rows[0]?.d),
  });
}
