/* ────────────────────────────────────────────────────────────────
   Manual gold cycle — seed or refresh gold_snapshots without waiting
   for the 06:00 UTC cron. Run from a machine that can reach
   fred.stlouisfed.org, goldapi.io, and the database:

     cd backend && npx tsx scripts/run-gold.ts

   Idempotent: re-running upserts the same run_date row. GOLDAPI_KEY
   is optional here — if unset (or already spent for today), the
   cycle just falls back to FRED's own price for the headline.
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl, ensureEnvVar } from "./loadEnv";
ensureDatabaseUrl();
ensureEnvVar("GOLDAPI_KEY");

import { createDb } from "../src/storage/db";
import { runGoldCycle } from "../src/ingest/goldCycle";

async function main(): Promise<void> {
  const db = await createDb();
  const report = await runGoldCycle(db);

  console.log(`Gold cycle · run date ${report.runDate}`);
  if (report.error) {
    console.log(`FAILED: ${report.error}`);
    process.exit(1);
  }
  console.log(`price ${report.price} (${report.priceSource}) · written ${report.written}`);
  if (report.goldapiSkipped) console.log(`goldapi skipped: ${report.goldapiSkipped}`);
  if (report.goldapiError) console.log(`goldapi error: ${report.goldapiError}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
