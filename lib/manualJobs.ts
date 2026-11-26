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
  /** Repeat every N months, or every N days when everyDays is set. */
  everyMonths: number;
  everyDays?: number;
  /** Date the data in the code was last checked, used until a run is recorded. */
  lastCheckedInCode: string;
}

export const MANUAL_JOBS: readonly ManualJob[] = [
  {
    id: "newsletter-signups",
    title: "Copy newsletter sign-ups into Loops",
    steps: [
      "Open Ops → Growth and look for new leads whose form starts with newsletter: or waitlist:.",
      "Add those emails to the Loops audience (tag them with the page they came from).",
    ],
    where: "Ops → Growth, then Loops",
    everyMonths: 0,
    everyDays: 7,
    lastCheckedInCode: "2026-11-23",
  },
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
  {
    id: "iron-ore-reference",
    title: "Iron ore reference figures (Iron Ore Tracker)",
    steps: [
      "Open the latest WA Iron Ore Profile (WA Government): update WA export volume and value, destination shares, imports by market, company shipments and the price line.",
      "Check Pilbara Ports' latest annual or monthly figures for Port Hedland, Dampier and Ashburton.",
      "Each January, update country production from the new USGS Mineral Commodity Summaries (iron ore chapter).",
      "After each Resources and Energy Quarterly, update the export earnings outlook.",
      "Change each source's reviewed date. Monthly export value comes from the ABS by itself.",
    ],
    where: "lib/ironore/reference.ts",
    everyMonths: 3,
    lastCheckedInCode: "2026-11-27",
  },
  {
    id: "copper-reference",
    title: "Copper reference figures (Copper Tracker)",
    steps: [
      "Check the status of the disruptions on the page: Grasberg ramp-up, Cobre Panamá restart, Mount Isa smelter and Townsville refinery support (ends 2028). Update the notes in SITES.",
      "After each Resources and Energy Quarterly, update the copper export earnings outlook.",
      "Each January, update mine and refined output from the new USGS Mineral Commodity Summaries (copper chapter), and China's share of use from the ICSG Factbook.",
      "Change each source's reviewed date. Export values (ABS) and COMEX stocks (CME) update by themselves.",
    ],
    where: "lib/copper/reference.ts",
    everyMonths: 3,
    lastCheckedInCode: "2026-11-27",
  },
  {
    id: "lng-hormuz",
    title: "LNG Tracker: Strait of Hormuz note",
    steps: [
      "Check the latest on LNG shipping through the Strait of Hormuz and Qatar's Ras Laffan (IEA, EIA, Reuters or Bloomberg).",
      "Update HORMUZ.latest and HORMUZ.asOf, and the summary if the strait has reopened. Add the source if it is new.",
    ],
    where: "lib/lng/reference.ts",
    everyMonths: 0,
    everyDays: 7,
    lastCheckedInCode: "2026-11-27",
  },
  {
    id: "lng-reference",
    title: "LNG reference figures (LNG Tracker)",
    steps: [
      "Check plant status: Pluto Train 2 first cargo (then add its 5 Mtpa), North West Shelf trains, Darwin LNG, Prelude.",
      "After each Resources and Energy Quarterly, update the LNG export earnings outlook.",
      "Each July, update exporters and importers from the new IGU World LNG Report.",
      "Change each source's reviewed date. Export values (ABS) update by themselves.",
    ],
    where: "lib/lng/reference.ts",
    everyMonths: 3,
    lastCheckedInCode: "2026-11-27",
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

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** "Every week", "Every 3 months" etc. */
export function cadenceLabel(job: ManualJob): string {
  if (job.everyDays) return job.everyDays === 7 ? "Every week" : `Every ${job.everyDays} days`;
  return job.everyMonths === 12 ? "Every year" : `Every ${job.everyMonths} months`;
}

export function jobSchedule(job: ManualJob, lastDone: string | null, now = new Date()) {
  const last = (lastDone ?? job.lastCheckedInCode).slice(0, 10);
  const nextDue = job.everyDays ? addDays(last, job.everyDays) : addMonths(last, job.everyMonths);
  const daysLeft = Math.floor((Date.parse(`${nextDue}T00:00:00Z`) - Date.parse(now.toISOString().slice(0, 10) + "T00:00:00Z")) / 86_400_000);
  // Weekly jobs only turn amber in their last 2 days; longer ones 14 days ahead.
  const soon = job.everyDays && job.everyDays < 30 ? 2 : DUE_SOON_DAYS;
  const status: JobStatus = daysLeft < 0 ? "overdue" : daysLeft <= soon ? "due soon" : "ok";
  return { last, nextDue, daysLeft, status };
}
