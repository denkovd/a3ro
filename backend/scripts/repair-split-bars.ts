/* ────────────────────────────────────────────────────────────────
   One-off repair for roadmap #104: finds symbols whose stored bars
   are on a pre-split scale and replaces their history with a fresh
   5y fetch. The daily scan now catches new splits itself (within a
   month of the split, see bull/rescale.ts); this script fixes the
   ones that happened before that check existed.

   Compares the full stored 'adj' series with a fresh 5y fetch for
   every non-futures symbol (futures 'adj' is roll-shifted on purpose
   and is skipped). Dry run by default: it only lists what it finds.

   Usage:
     npm run repair:splits                        # dry run, whole universe
     npm run repair:splits -- --symbols MNST,APH  # dry run, some symbols
     npm run repair:splits -- --apply             # write the fixes
──────────────────────────────────────────────────────────────── */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { loadBars } from "../src/storage/bullRepo";
import { defaultRegistry, fetchBarsWithFallback } from "../src/bull/adapters";
import { replaceHistory } from "../src/bull/pipeline";
import { detectRescale } from "../src/bull/rescale";
import { BULL_UNIVERSE } from "../src/bull/universe";
import { AdapterHealthEntry } from "../src/bull/types";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const only = arg("--symbols")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const universe = BULL_UNIVERSE
    .filter((e) => !e.futures)
    .filter((e) => !only || only.includes(e.symbol.toUpperCase()));
  if (only) {
    const missing = only.filter((s) => !universe.some((e) => e.symbol.toUpperCase() === s));
    if (missing.length) console.log(`not in the (non-futures) universe: ${missing.join(", ")}`);
  }

  const db = await createDb();
  const registry = defaultRegistry(BULL_UNIVERSE);
  const runDate = new Date().toISOString().slice(0, 10);
  const health: AdapterHealthEntry[] = [];
  const found: string[] = [];
  const fixed: string[] = [];
  const failed: string[] = [];

  console.log(`${apply ? "APPLY" : "DRY RUN"}: checking ${universe.length} symbols against a fresh 5y fetch\n`);
  for (const entry of universe) {
    try {
      const stored = await loadBars(db, entry.symbol, "adj");
      if (stored.length === 0) continue;
      const { bars } = await fetchBarsWithFallback(entry, "5y", runDate, registry);
      if (!bars) { failed.push(entry.symbol); continue; }
      const check = detectRescale(stored, bars);
      if (!check.rescaled) continue;
      found.push(entry.symbol);
      console.log(`${entry.symbol.padEnd(10)} ${check.mismatches}/${check.compared} dates off, stored/fresh ratio ≈ ${check.ratio?.toFixed(3)}`);
      if (apply && await replaceHistory(db, entry, runDate, registry, health, (m) => console.log(`  ${m}`), check.ratio)) {
        fixed.push(entry.symbol);
      }
    } catch (e) {
      failed.push(entry.symbol);
      console.log(`✗ ${entry.symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nfound on another scale: ${found.length}${found.length ? ` (${found.join(", ")})` : ""}`);
  if (apply) console.log(`replaced: ${fixed.length}`);
  else if (found.length) console.log("re-run with --apply to replace their history; the next daily scan then recomputes their signals");
  if (failed.length) console.log(`could not check: ${failed.join(", ")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
