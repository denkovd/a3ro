/* ────────────────────────────────────────────────────────────────
   Regenerates the S&P 500 constituents in src/bull/universeData.ts
   from the maintained GitHub dataset, and prints the live CoinGecko
   top-100 for manual curation of the crypto list. Run quarterly,
   with network (not available in the build sandbox):

     cd backend && npx tsx scripts/refresh-universe.ts

   Deliberately writes to stdout for review rather than mutating the
   source file — universe changes go through a human diff, same as
   any other code change.
──────────────────────────────────────────────────────────────── */

const SP500_URL =
  "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv";
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1";

/** Minimal CSV line parser (handles quoted fields with commas). */
function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function main(): Promise<void> {
  const csv = await (await fetch(SP500_URL)).text();
  const lines = csv.trim().split(/\r?\n/).slice(1);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`// S&P 500 constituents as of ${today} — paste into universeData.ts`);
  console.log(`export const SP500_ASOF = "${today}";`);
  console.log("export const SP500: ReadonlyArray<readonly [string, string]> = [");
  for (const line of lines) {
    const [symbol, name] = csvFields(line);
    if (!symbol) continue;
    console.log(`  [${JSON.stringify(symbol)},${JSON.stringify(name)}],`);
  }
  console.log("];");

  try {
    const coins = (await (await fetch(COINGECKO_URL, {
      headers: { accept: "application/json" },
    })).json()) as Array<{ symbol: string; name: string }>;
    console.log("\n// CoinGecko top-100 (map symbol → Yahoo '<SYMBOL>-USD'; curate");
    console.log("// manually — stablecoins and wrapped assets should be excluded):");
    for (const c of coins) {
      console.log(`//   ${c.symbol.toUpperCase()}-USD  ${c.name}`);
    }
  } catch (e) {
    console.log(`\n// CoinGecko fetch failed (${e instanceof Error ? e.message : e}) — crypto list unchanged`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
