/* ────────────────────────────────────────────────────────────────
   Module 5 daily scan runner — the GitHub Actions entrypoint
   (.github/workflows/bull-scan.yml). Also serves as the manual
   backfill: symbols with no stored bars automatically fetch 5y,
   so the first run IS the backfill (resumable — already-stored
   symbols only fetch increments; use --chunk to split the first
   run across dispatches if needed).

   Usage:
     DATABASE_URL=... npx tsx scripts/run-bull-scan.ts [--chunk N/M]
──────────────────────────────────────────────────────────────── */

import { createDb } from "../src/storage/db";
import { runBullScan } from "../src/bull/pipeline";
import { BULL_UNIVERSE } from "../src/bull/universe";

function parseChunk(argv: string[]): [number, number] | null {
  const i = argv.indexOf("--chunk");
  if (i === -1 || !argv[i + 1]) return null;
  const m = argv[i + 1].match(/^(\d+)\/(\d+)$/);
  if (!m) throw new Error(`--chunk expects N/M (e.g. 1/4), got ${argv[i + 1]}`);
  const [, n, total] = m;
  return [Number(n), Number(total)];
}

async function main(): Promise<void> {
  const db = await createDb();
  const chunk = parseChunk(process.argv.slice(2));
  let universe = BULL_UNIVERSE;
  if (chunk) {
    const [n, total] = chunk;
    const size = Math.ceil(universe.length / total);
    universe = universe.slice((n - 1) * size, n * size);
    console.log(`chunk ${n}/${total}: ${universe.length} symbols`);
  }

  const report = await runBullScan(db, {
    universe,
    log: (msg) => console.log(msg),
  });

  console.log("\n── Bull scan report ─────────────────────────────");
  console.log(`run date        ${report.runDate}`);
  console.log(`universe        ${report.universe}`);
  console.log(`scanned         ${report.scanned}`);
  console.log(`failed          ${report.failed.length}${report.failed.length > 0 ? ` (${report.failed.slice(0, 20).join(", ")}${report.failed.length > 20 ? ", …" : ""})` : ""}`);
  console.log(`rolls           ${report.rolls.length}`);
  for (const r of report.rolls) {
    console.log(`  ↻ ${r.symbol} ${r.rollDate}: ${r.oldContract} → ${r.newContract}, gap ${r.gap.toFixed(4)}, cum ${r.cumAdjustment.toFixed(4)}`);
  }
  if (report.rollProbeFailures.length > 0) {
    console.log(`probe failures  ${report.rollProbeFailures.join(", ")}`);
  }
  console.log(`transitions     ${report.transitions}`);
  console.log(`newly bullish   ${report.newlyBullish.join(", ") || "none"}`);
  console.log(`rows written    ${report.written}`);

  // Fail the workflow only on systemic breakage, not routine per-symbol
  // misses: >25% failures suggests an outage worth a red run.
  if (report.failed.length > report.universe * 0.25) {
    console.error(`\n${report.failed.length}/${report.universe} symbols failed — treating as systemic.`);
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
