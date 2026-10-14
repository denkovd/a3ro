import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SLEEVES, type SleeveKey } from "../src/macro/allocation";
import { fetchDailyHistory } from "../src/regime/yahooHistory";
import { buildDailyVams21 } from "../src/macro/vams21History";
import { VAMS_21_NAME } from "../src/macro/vams21Backtest";
import { defaultResearchConfig, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";
import type { RegimeBar } from "../src/regime/types";

async function main() {
  const destination = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data/regime-backtest.json");
  const dataset: ResearchDataset = JSON.parse(readFileSync(destination, "utf8"));
  const bars: Partial<Record<SleeveKey, RegimeBar[]>> = {};
  for (const sleeve of SLEEVES) {
    bars[sleeve.key] = (await fetchDailyHistory(sleeve.symbol, "max")).filter(bar => bar.date <= dataset.through);
    console.log(`${sleeve.symbol}: ${bars[sleeve.key]!.length} daily signal bars`);
  }
  dataset.vams21Signals = buildDailyVams21(bars, dataset.prices.stocks ?? []);
  dataset.vams21GeneratedAt = new Date().toISOString();
  const source = "Daily 21-observation VAMS: prior-date ^GSPC, GC=F and BTC-USD bars; 100/50/0 exposure rule";
  if (!dataset.sources.includes(source)) dataset.sources.push(source);
  dataset.warnings = dataset.warnings.map(warning => warning.startsWith("Signals are observed at month-end")
    ? "Macro regime signals are observed at month-end and executed at the next equity session close; intra-month macro changes are not reconstructed. The separate 21-day VAMS portfolio uses daily prior-date signals."
    : warning);
  const result = runResearch(dataset, defaultResearchConfig(dataset.through));
  const metrics = result.candidate.benchmarks[VAMS_21_NAME];
  if (!metrics) throw new Error(result.benchmarkAvailability.find(b => b.name === VAMS_21_NAME)?.reason ?? "Incomplete 21-day VAMS history.");
  writeFileSync(`${destination}.tmp`, JSON.stringify(dataset));
  renameSync(`${destination}.tmp`, destination);
  console.log(`${VAMS_21_NAME}: ${(metrics.totalReturn * 100).toFixed(2)}% total return, ${(metrics.cagr * 100).toFixed(2)}% CAGR, ${(metrics.maxDrawdown * 100).toFixed(2)}% max drawdown.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
