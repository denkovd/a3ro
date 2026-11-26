// Cron jobs an admin can re-run from Ops controls (#52). Must match vercel.json (a test checks).
export const CRON_JOBS = [
  "ingest", "australia-watch", "oil", "scores", "refineries", "macro", "btc", "value-chain", "dividend-signals", "dividend-constraints",
  // Monday 6pm Sydney: 07:05 UTC in daylight saving, 08:05 UTC otherwise (each run sends only in the window).
  "newsletter", "newsletter-late",
] as const;
export type CronJob = (typeof CRON_JOBS)[number];

export function isCronJob(value: unknown): value is CronJob {
  return typeof value === "string" && (CRON_JOBS as readonly string[]).includes(value);
}
