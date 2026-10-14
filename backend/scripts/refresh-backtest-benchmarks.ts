import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBenchmarkHistory } from "../src/macro/benchmarkHistory";
import { defaultResearchConfig, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";
import { BENCHMARK_HISTORY_SOURCE, BUY_HOLD_SELECTION_NOTE, BUY_HOLD_ASSETS } from "../src/macro/researchBenchmarks";

async function main() {
  const destination = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data/regime-backtest.json");
  const { bitcoinWeeklySignals: _signals, bitcoinWeeklyGeneratedAt: _date, bitcoinWeeklyIndicator: _indicator, ...dataset } =
    JSON.parse(readFileSync(destination, "utf8")) as ResearchDataset & Record<string, unknown>;
  console.log(`Loading benchmark prices on the existing strategy window through ${dataset.through}…`);
  dataset.benchmarkPrices = await loadBenchmarkHistory(dataset.through);
  dataset.benchmarkGeneratedAt = new Date().toISOString();
  dataset.sources = dataset.sources.filter(source => !source.startsWith("Yahoo Finance adjusted daily") && !source.startsWith("BTC-USD daily OHLC:"));
  dataset.sources.push(BENCHMARK_HISTORY_SOURCE);
  if (!dataset.warnings.includes(BUY_HOLD_SELECTION_NOTE)) dataset.warnings.push(BUY_HOLD_SELECTION_NOTE);
  const result = runResearch(dataset, defaultResearchConfig(dataset.through));
  for (const benchmark of result.benchmarkAvailability) {
    const metrics = result.candidate.benchmarks[benchmark.name];
    console.log(`${benchmark.name}: ${metrics ? `${(metrics.cagr * 100).toFixed(2)}% CAGR` : benchmark.reason}`);
  }
  if (result.benchmarkAvailability.filter(b => b.available).length < 7) throw new Error("Incomplete benchmark coverage in the default window.");
  for (const asset of BUY_HOLD_ASSETS) {
    const name = `${asset.label} (${asset.symbol}) buy-and-hold`;
    if (!result.candidate.benchmarks[name]) throw new Error(`Incomplete full-window buy-and-hold history for ${asset.symbol}.`);
  }
  writeFileSync(`${destination}.tmp`, JSON.stringify(dataset));
  renameSync(`${destination}.tmp`, destination);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
