// Cron jobs the owner can re-run from Ops controls (#52). Must match vercel.json (a test checks).
export const CRON_JOBS = [
  "ingest", "australia-watch", "oil", "scores", "refineries", "macro", "btc", "value-chain", "dividend-signals", "dividend-constraints",
] as const;
export type CronJob = (typeof CRON_JOBS)[number];

export function isCronJob(value: unknown): value is CronJob {
  return typeof value === "string" && (CRON_JOBS as readonly string[]).includes(value);
}
