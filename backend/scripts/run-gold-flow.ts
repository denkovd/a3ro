/* ────────────────────────────────────────────────────────────────
   Manual gold stock/flow cycle — COMEX warehouse + WGC ETF holdings.

     cd backend && npx tsx scripts/run-gold-flow.ts

   Requires migration 018_gold_flow.sql applied first.
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { runGoldFlowCycle } from "../src/ingest/goldFlowCycle";

async function main(): Promise<void> {
  const db = await createDb();
  const report = await runGoldFlowCycle(db);
  console.log(JSON.stringify(report, null, 2));
  if (report.error && report.written === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
