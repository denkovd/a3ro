// Scheduled jobs (vercel.json crons), with how often each is expected to run, for the Ops data health tab (#47).
import vercel from "../vercel.json";

export interface CronJob { job: string; path: string; schedule: string; everyHours: number; label: string }

/** Only the shapes vercel.json uses: daily ("m h * * *") and weekly ("m h * * d"). Anything else counts as daily. */
export function cronInterval(schedule: string): { everyHours: number; label: string } {
  const [min, hour, dom, , dow] = schedule.trim().split(/\s+/);
  const at = /^\d+$/.test(min ?? "") && /^\d+$/.test(hour ?? "") ? ` ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC` : "";
  if (dow && dow !== "*") {
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(dow) % 7] ?? dow;
    return { everyHours: 168, label: `Weekly, ${day}${at}` };
  }
  if (dom && dom !== "*") return { everyHours: 24 * 31, label: `Monthly, day ${dom}${at}` };
  return { everyHours: 24, label: `Daily${at}` };
}

export const CRON_JOBS: CronJob[] = (vercel.crons ?? []).map((c) => ({
  job: c.path.replace(/^\/api\/cron\//, ""), path: c.path, schedule: c.schedule, ...cronInterval(c.schedule),
}));

/** Jobs scheduled in GitHub Actions that record their runs in cron_runs too (not re-runnable from Ops). */
export const GITHUB_JOBS: CronJob[] = [
  { job: "australia-oecd", path: ".github/workflows/oecd-refresh.yml", schedule: "0 3 * * *", ...cronInterval("0 3 * * *") },
].map((j) => ({ ...j, label: `${j.label} · GitHub` }));

/** Everything Data health checks: the Vercel crons, then the GitHub jobs. */
export const SCHEDULED_JOBS: CronJob[] = [...CRON_JOBS, ...GITHUB_JOBS];

/** A run is overdue once 1.5 intervals have passed without one (allows for Vercel's cron jitter). */
export function cronOverdue(lastStartedAt: string | null, everyHours: number, now = new Date()): boolean {
  if (!lastStartedAt) return true;
  return now.getTime() - Date.parse(lastStartedAt) > everyHours * 1.5 * 3_600_000;
}
