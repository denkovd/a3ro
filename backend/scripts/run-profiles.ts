/* ────────────────────────────────────────────────────────────────
   Asset profiles refresh runner — GitHub Actions entrypoint
   (.github/workflows/profiles-refresh.yml).

   Usage:
     DATABASE_URL=... FINNHUB_API_KEY=... npx tsx scripts/run-profiles.ts --daily
     DATABASE_URL=... FINNHUB_API_KEY=... npx tsx scripts/run-profiles.ts --weekly [--chunk N/M]
   Optional: COINGECKO_API_KEY (free Demo key) for steadier crypto rate limits.
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { BULL_UNIVERSE } from "../src/bull/universe";
import { profileTargets, runDailyProfiles, runWeeklyProfiles } from "../src/profiles/pipeline";

function parseChunk(argv: string[]): [number, number] | null {
  const i = argv.indexOf("--chunk");
  if (i === -1 || !argv[i + 1]) return null;
  const m = argv[i + 1].match(/^(\d+)\/(\d+)$/);
  if (!m) throw new Error(`--chunk expects N/M (e.g. 1/2), got ${argv[i + 1]}`);
  return [Number(m[1]), Number(m[2])];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const weekly = argv.includes("--weekly");
  if (!weekly && !argv.includes("--daily")) throw new Error("pass --daily or --weekly");
  const db = await createDb();
  const log = (msg: string) => console.log(msg);

  if (!weekly) {
    const r = await runDailyProfiles(db, { log });
    console.log("\n── Daily profiles ───────────────────────────────");
    console.log(`crypto written   ${r.written}/${r.attempted}`);
    console.log(`next earnings    ${r.nextEarningsWritten ?? "—"}`);
    if (r.cryptoUnmatched?.length) console.log(`unmatched ids    ${r.cryptoUnmatched.join(", ")}  (fix backend/src/profiles/coingeckoIds.ts)`);
    if (r.failed.length) console.log(`failed           ${r.failed.join(", ")}`);
    // Both whole-market calls failing = systemic.
    if (r.failed.includes("finnhub:calendar") && r.failed.includes("coingecko:markets")) process.exit(1);
    return;
  }

  let universe = profileTargets(BULL_UNIVERSE);
  const chunk = parseChunk(argv);
  if (chunk) {
    const [n, total] = chunk;
    const size = Math.ceil(universe.length / total);
    universe = universe.slice((n - 1) * size, n * size);
    console.log(`chunk ${n}/${total}: ${universe.length} symbols`);
  }
  const r = await runWeeklyProfiles(db, { universe, log });
  console.log("\n── Weekly profiles ──────────────────────────────");
  console.log(`attempted        ${r.attempted}`);
  console.log(`written          ${r.written}`);
  console.log(`no data          ${r.empty.length}${r.empty.length ? ` (${r.empty.slice(0, 25).join(", ")}${r.empty.length > 25 ? ", …" : ""})` : ""}`);
  console.log(`failed           ${r.failed.length}${r.failed.length ? ` (${r.failed.slice(0, 25).join(", ")})` : ""}`);
  if (r.failed.length > r.attempted * 0.25) {
    console.error(`\n${r.failed.length}/${r.attempted} failed — treating as systemic.`);
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
