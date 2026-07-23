/* ────────────────────────────────────────────────────────────────
   Manual BTC price cycle — seed or refresh btc_snapshots without
   waiting for the daily cron. Run from a machine that can reach
   Coinbase and the database:

     cd backend && npx tsx scripts/run-btc.ts

   Idempotent: re-running upserts the same run_date row. No API key
   needed — both Coinbase endpoints are keyless.
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { runBtcCycle } from "../src/ingest/btcCycle";

async function main(): Promise<void> {
  const db = await createDb();
  const report = await runBtcCycle(db);

  console.log(`BTC cycle · run date ${report.runDate}`);
  if (report.error) {
    console.log(`FAILED: ${report.error}`);
    process.exit(1);
  }
  console.log(`price ${report.price} (${report.priceSource}) · written ${report.written}`);
  if (report.spotError) console.log(`spot tick error: ${report.spotError}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
