/* ────────────────────────────────────────────────────────────────
   Manual Bagholder Risk Map rescoring — recompute all active
   narratives without waiting for the daily cron. Run from a machine
   that can reach the database:

     cd backend && npx tsx scripts/run-bagholder.ts

   Idempotent: re-running upserts the same (narrative, run_date,
   timeframe) snapshot rows and only advances trigger state when the
   hysteresis rule actually clears.
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { runBagholderCycle } from "../src/ingest/bagholderCycle";

async function main(): Promise<void> {
  const db = await createDb();
  const report = await runBagholderCycle(db);

  console.log(`Bagholder cycle · run date ${report.runDate}`);
  console.log(`narratives scored ${report.narrativesScored} · triggers evaluated ${report.triggersEvaluated}`);
  console.log(`transitions ${report.transitions} · trade objects emitted ${report.tradeObjectsEmitted}`);
  if (report.errors.length > 0) {
    console.log(`errors:`);
    for (const e of report.errors) console.log(`  narrative ${e.narrativeId}: ${e.message}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
