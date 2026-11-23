/* ────────────────────────────────────────────────────────────────
   Manual jobs (Ops). Recurring updates done by hand because the data
   has no feed we can use. Each job says what to do and where; the Ops
   page shows when it was last done and when it's next due.
   Add a job here; marking it done is stored in manual_job_runs.
──────────────────────────────────────────────────────────────── */

export interface ManualJob {
  id: string;
  title: string;
  /** What to do, step by step. */
  steps: string[];
  /** File(s) to edit. */
  where: string;
  everyMonths: number;
  /** Date the data in the code was last checked, used until a run is recorded. */
  lastCheckedInCode: string;
}

export const MANUAL_JOBS: readonly ManualJob[] = [
  {
    id: "world-assets",
    title: "World assets figures (/markets)",
    steps: [
      "Check each source for a newer figure: Savills (real estate), SIFMA fact book (bonds), World Federation of Exchanges (US and other stocks), World Gold Council (gold).",
      "Update bitcoin: coins in circulation × a recent price.",
      "Edit the values, dates and WORLD_ASSETS_CHECKED, then push.",
    ],
    where: "lib/globalMarkets.ts",
    everyMonths: 3,
    lastCheckedInCode: "2026-11-23",
  },
  {
    id: "central-bank-dates",
    title: "RBA and Fed meeting dates (/calendar)",
    steps: [
      "Check the RBA calendar and the Fed FOMC calendar for next year's dates and any revisions.",
      "Add or correct meetings and their decision times (UTC).",
    ],
    where: "lib/centralBanks.ts",
    everyMonths: 6,
    lastCheckedInCode: "2026-11-23",
  },
  {
    id: "asx-list",
    title: "ASX company list and saved screens (/markets)",
    steps: [
      "Check the ASX names still match the companies you want to cover.",
      "Open each saved screen to confirm its link still works and the filters are right.",
    ],
    where: "lib/marketLinks.ts",
    everyMonths: 3,
    lastCheckedInCode: "2026-11-23",
  },
];

export type JobStatus = "ok" | "due soon" | "overdue";
const DUE_SOON_DAYS = 14;

/** Adds whole months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function jobSchedule(job: ManualJob, lastDone: string | null, now = new Date()) {
  const last = (lastDone ?? job.lastCheckedInCode).slice(0, 10);
  const nextDue = addMonths(last, job.everyMonths);
  const daysLeft = Math.floor((Date.parse(`${nextDue}T00:00:00Z`) - Date.parse(now.toISOString().slice(0, 10) + "T00:00:00Z")) / 86_400_000);
  const status: JobStatus = daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "due soon" : "ok";
  return { last, nextDue, daysLeft, status };
}
