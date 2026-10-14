// IO-only loader, imported by refresh scripts; never bundled into the browser.
import { fetchAdjustedHistory } from "../regime/yahooHistory";
import { BENCHMARK_ASSETS } from "./researchBenchmarks";
import type { BenchmarkPriceSeries } from "./allocationBacktest";

export async function loadBenchmarkHistory(through: string): Promise<BenchmarkPriceSeries> {
  const prices: BenchmarkPriceSeries = {};
  for (const asset of BENCHMARK_ASSETS) {
    const history = await fetchAdjustedHistory(asset.symbol);
    const closed = history.filter(bar => bar.date >= "2004-01-01" && bar.date <= through);
    if (!closed.length) throw new Error(`No adjusted daily history for ${asset.symbol}.`);
    prices[asset.key] = closed.map(({ date, close }) => ({ date, close }));
    console.log(`  ${asset.symbol}: ${closed.length} daily adjusted bars (${closed[0].date}–${closed.at(-1)!.date})`);
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return prices;
}
