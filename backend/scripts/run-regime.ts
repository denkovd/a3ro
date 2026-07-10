/* ────────────────────────────────────────────────────────────────
   Manual regime scan — seed or refresh regime_snapshots without
   waiting for the 06:00 UTC cron. Run from a machine that can
   reach Yahoo Finance and the database:

     cd backend && DATABASE_URL=... npx tsx scripts/run-regime.ts

   Idempotent: re-running upserts the same (run_date, symbol) rows.
──────────────────────────────────────────────────────────────── */

import { createDb } from "../src/storage/db";
import { runRegimeCycle } from "../src/regime/pipeline";

async function main(): Promise<void> {
  const db = await createDb();
  const report = await runRegimeCycle(db);

  console.log(`Regime scan · run date ${report.runDate}`);
  console.log(`universe ${report.universe} · written ${report.written}\n`);
  for (const s of report.scanned) {
    console.log(
      s.ok
        ? `  ok    ${s.symbol.padEnd(10)} ${s.verdict} (${s.bars} bars)`
        : `  FAIL  ${s.symbol.padEnd(10)} ${s.error}`,
    );
  }
  console.log(
    report.newlyBullish.length > 0
      ? `\nNewly bullish: ${report.newlyBullish.join(", ")}`
      : "\nNewly bullish: none",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
