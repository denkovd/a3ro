/* ────────────────────────────────────────────────────────────────
   Logs today's open-data signals for the track record (roadmap #11).
   The macro cron does this every day; run it by hand to seed the log
   right after migration 032, or to check what would be logged.

   Usage: npm run log:signals
──────────────────────────────────────────────────────────────── */
import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { fetchAustraliaReleaseSchedules } from "../src/sources/absReleases";
import { logOpenDataSignals } from "../src/trackRecord/signalLog";

async function main(): Promise<void> {
  const db = await createDb();
  const schedules = await fetchAustraliaReleaseSchedules().catch((e) => {
    console.warn(`ABS release calendars unavailable (${e instanceof Error ? e.message : e}); using estimated release lags`);
    return undefined;
  });
  const results = await logOpenDataSignals(db, { schedules });
  for (const r of results) {
    const what = r.error ? `✗ ${r.error}` : r.skipped ? `skipped: ${r.skipped}` : `${r.state} (${r.action === "none" ? "unchanged" : r.action})`;
    console.log(`${r.signal.padEnd(18)} ${what}`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });
