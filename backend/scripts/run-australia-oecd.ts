/* ────────────────────────────────────────────────────────────────
   Australia Watch: the three OECD series (roadmap #78).

   sdmx.oecd.org answers HTTP 500 to Vercel's servers but not to other
   networks, so these series are fetched here, by the GitHub Actions
   workflow oecd-refresh.yml (03:00 UTC daily), instead of by the
   Vercel australia-watch cron. Also runs by hand:

     cd backend && npx tsx scripts/run-australia-oecd.ts

   Records the run in cron_runs as job "australia-oecd", so it shows
   on Admin → Data health beside the Vercel jobs. Exits 1 if every
   series failed (the workflow run then shows red).
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { runAustraliaWatchCycle } from "../src/ingest/australiaWatchCycle";
import { recordCronRun, summarizeCronReport } from "../src/storage/cronRunRepo";

async function main(): Promise<void> {
  const db = await createDb();
  const started = Date.now();
  const report = await runAustraliaWatchCycle(db, { sources: ["oecd_sdmx"] });
  const entries = Object.entries(report.results);
  const degraded = entries.filter(([, r]) => r.error).map(([indicator]) => indicator);
  const allFailed = entries.length === 0 || degraded.length === entries.length;
  const httpStatus = allFailed ? 502 : 200;
  const body = { ...report, degraded };

  for (const [indicator, r] of entries) console.log(`${indicator}: ${r.error ? `FAILED ${r.error}` : `${r.written} rows`}`);
  try {
    await recordCronRun(db, { job: "australia-oecd", startedAt: report.startedAt, durationMs: Date.now() - started, httpStatus, ...summarizeCronReport(body, httpStatus) });
  } catch (e) {
    console.warn(`Couldn't record the run in cron_runs: ${e instanceof Error ? e.message : String(e)}`);
  }
  process.exit(allFailed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
