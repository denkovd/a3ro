/* ────────────────────────────────────────────────────────────────
   Manual macro cycle — seed or refresh macro_snapshots without
   waiting for the 06:00 UTC cron. Run from a machine that can reach
   fred.stlouisfed.org and the database:

     cd backend && npx tsx scripts/run-macro.ts

   Idempotent: re-running upserts the same run_date row (upsertMacroSnapshot).
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { runMacroCycle } from "../src/ingest/macroCycle";

async function main(): Promise<void> {
  const db = await createDb();
  const report = await runMacroCycle(db);

  console.log(`Macro cycle · run date ${report.runDate}`);
  if (report.error) {
    console.log(`FAILED: ${report.error}`);
    process.exit(1);
  }
  console.log(`quadrant ${report.quadrant} · pressure ${report.pressureScore} (diverging: ${report.diverging}) · written ${report.written}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
