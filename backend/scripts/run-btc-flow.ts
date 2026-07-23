/* ────────────────────────────────────────────────────────────────
   Manual BTC flow cycle — SoSoValue US spot ETF flow/AUM API.

     cd backend && npx tsx scripts/run-btc-flow.ts

   Requires migration 019_btc.sql applied first.
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { runBtcFlowCycle } from "../src/ingest/btcFlowCycle";

async function main(): Promise<void> {
  const db = await createDb();
  const report = await runBtcFlowCycle(db);
  console.log(JSON.stringify(report, null, 2));
  if (report.error && report.written === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
