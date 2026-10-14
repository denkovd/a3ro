import { backtestPrice, type BenchmarkAssetKey, type BenchmarkPriceSeries, type BenchmarkWeights,
  type PricePoint, type PriceSeries } from "./allocationBacktest";

export const SP_BENCHMARK = "S&P 500 (SPY total return)";
export const BTC_HOLD_NAME = "Bitcoin buy-and-hold";
export const NVIDIA_HOLD_NAME = "NVIDIA (NVDA) buy-and-hold";
export const BUY_HOLD_ASSETS = [
  { key: "nvidia", symbol: "NVDA", label: "NVIDIA" },
  { key: "amd", symbol: "AMD", label: "AMD" },
  { key: "broadcom", symbol: "AVGO", label: "Broadcom" },
  { key: "arista", symbol: "ANET", label: "Arista Networks" },
  { key: "axon", symbol: "AXON", label: "Axon Enterprise" },
  { key: "fairIsaac", symbol: "FICO", label: "Fair Isaac" },
  { key: "netflix", symbol: "NFLX", label: "Netflix" },
  { key: "tesla", symbol: "TSLA", label: "Tesla" },
  { key: "apple", symbol: "AAPL", label: "Apple" },
  { key: "microsoft", symbol: "MSFT", label: "Microsoft" },
  { key: "amazon", symbol: "AMZN", label: "Amazon" },
  { key: "alphabet", symbol: "GOOGL", label: "Alphabet" },
  { key: "meta", symbol: "META", label: "Meta Platforms" },
  { key: "costco", symbol: "COST", label: "Costco" },
  { key: "texasPacific", symbol: "TPL", label: "Texas Pacific Land" },
  { key: "nasdaq", symbol: "QQQ", label: "Nasdaq-100" },
  { key: "semiconductors", symbol: "SMH", label: "Semiconductors" },
] as const satisfies ReadonlyArray<{ key: BenchmarkAssetKey; symbol: string; label: string }>;
export const BUY_HOLD_SELECTION_NOTE = "Buy-and-hold comparisons are a selected set of historical winners and major assets, ranked over your chosen dates. Selection uses hindsight; this is not a complete market ranking or a portfolio selected before the test period.";
export const BENCHMARK_ASSETS = [
  { key: "bonds", symbol: "AGG", label: "US aggregate bonds" },
  { key: "bills", symbol: "BIL", label: "1–3 month Treasury bills" },
  { key: "shortTreasury", symbol: "SHY", label: "1–3 year Treasuries" },
  { key: "longTreasury", symbol: "TLT", label: "20+ year Treasuries" },
  { key: "intermediateTreasury", symbol: "IEF", label: "7–10 year Treasuries" },
  { key: "commodities", symbol: "DBC", label: "Broad commodity futures fund" },
  { key: "berkshire", symbol: "BRK-B", label: "Berkshire Hathaway Class B shares" },
  { key: "allWeatherFund", symbol: "ALLW", label: "Bridgewater All Weather ETF" },
  ...BUY_HOLD_ASSETS,
] as const satisfies ReadonlyArray<{ key: BenchmarkAssetKey; symbol: string; label: string }>;
export const BENCHMARK_HISTORY_SOURCE = `Yahoo Finance adjusted daily stock and ETF benchmark closes: ${BENCHMARK_ASSETS.map(asset => asset.symbol).join(", ")}`;

export interface ResearchBenchmark {
  name: string; description: string; weights: BenchmarkWeights; sourceUrl?: string;
}
export function researchBenchmarks(universe: "stocks-gold" | "all"): ResearchBenchmark[] {
  return [
    { name: SP_BENCHMARK, description: "Buy and hold 100% SPY; dividends reinvested.", weights: { stocks: 1 } },
    { name: BTC_HOLD_NAME, description: "Buy and hold 100% Bitcoin using BTC-USD daily closes; no leverage or yield. Same equity-session marks and initial purchase cost as the other portfolios.", weights: { bitcoin: 1 } },
    { name: "Gold (GLD) buy-and-hold", description: "Buy and hold 100% GLD, using adjusted ETF closes including embedded fund fees; no yield or leverage.", weights: { gold: 1 }, sourceUrl: "https://www.spdrgoldshares.com/usa/" },
    ...BUY_HOLD_ASSETS.map(asset => ({ name: `${asset.label} (${asset.symbol}) buy-and-hold`,
      description: `Buy and hold 100% ${asset.symbol}. Split- and dividend-adjusted daily closes; distributions reinvested. One initial purchase, no rebalancing or leverage. Selected historical comparison; full-window history required.`,
      weights: { [asset.key]: 1 }, sourceUrl: `https://finance.yahoo.com/quote/${asset.symbol}/history/` })),
    { name: "Traditional 60/40", description: "60% SPY US large-cap stocks / 40% AGG US aggregate bonds; monthly rebalance.",
      weights: { stocks: 0.6, bonds: 0.4 }, sourceUrl: "https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/0002.pdf" },
    { name: universe === "all" ? "Static 60/30/10" : "Static 60/30 + cash",
      description: universe === "all" ? "60% SPY / 30% GLD / 10% Bitcoin; monthly rebalance. Our reference mix." : "60% SPY / 30% GLD / 10% cash; monthly rebalance. Our reference mix.",
      weights: { stocks: 0.6, gold: 0.3, bitcoin: universe === "all" ? 0.1 : 0 } },
    { name: "Treasury bills (BIL)", description: "Buy and hold BIL, a 1–3 month Treasury bill ETF; distributions reinvested. Independent of the strategy's constant cash assumption.",
      weights: { bills: 1 }, sourceUrl: "https://www.ssga.com/us/en/individual/etfs/state-street-spdr-bloomberg-1-3-month-t-bill-etf-bil" },
    { name: "Buffett 90/10 model", description: "90% SPY / 10% SHY (1–3 year government bonds); monthly rebalance. ETF reconstruction of his suggested trust allocation, not Buffett's personal returns.",
      weights: { stocks: 0.9, shortTreasury: 0.1 }, sourceUrl: "https://www.berkshirehathaway.com/letters/2013ltr.pdf" },
    { name: "Berkshire Hathaway (BRK.B)", description: "Buy and hold adjusted Berkshire Class B shares. Actual share returns; different from Buffett's 90/10 model and corporate book-value growth.",
      weights: { berkshire: 1 }, sourceUrl: "https://www.berkshirehathaway.com/reports.html" },
    { name: "All Weather-style model", description: "Our unleveraged ETF model: 30% SPY / 40% TLT / 15% IEF / 7.5% GLD / 7.5% DBC; monthly rebalance. Illustrative fixed allocation, not Bridgewater's historical performance.",
      weights: { stocks: 0.3, longTreasury: 0.4, intermediateTreasury: 0.15, gold: 0.075, commodities: 0.075 },
      sourceUrl: "https://www.bridgewater.com/research-and-insights/the-all-weather-story" },
    { name: "Bridgewater All Weather ETF (ALLW)", description: "Buy and hold the actual ALLW ETF with distributions reinvested. Its short live fund history cannot represent earlier decades.",
      weights: { allWeatherFund: 1 }, sourceUrl: "https://www.ssga.com/us/en/individual/capabilities/alternatives/all-weather-etf" },
  ];
}

export interface BenchmarkAvailability extends ResearchBenchmark {
  available: boolean; reason: string | null;
}
/** Every benchmark uses the complete strategy window. Never silently crop,
 * backfill an ETF before inception, or treat a missing distribution series flat. */
export function availableBenchmarks(definitions: ResearchBenchmark[], prices: PriceSeries,
  benchmarkPrices: BenchmarkPriceSeries, dates: string[]): BenchmarkAvailability[] {
  const all = { ...benchmarkPrices, ...prices };
  return definitions.map(definition => {
    let reason: string | null = null;
    for (const asset of Object.keys(definition.weights) as BenchmarkAssetKey[]) {
      if (!definition.weights[asset]) continue;
      const bars: PricePoint[] | undefined = all[asset];
      const symbol = BENCHMARK_ASSETS.find(a => a.key === asset)?.symbol ?? asset;
      if (!bars?.length) { reason = `${symbol} history has not been loaded.`; break; }
      if (dates[0] < bars[0].date || dates.at(-1)! > bars.at(-1)!.date) {
        reason = `${symbol} covers ${bars[0].date}–${bars.at(-1)!.date}; choose a window inside that history.`;
        break;
      }
      const missing = dates.find(date => backtestPrice(bars, date, true) === null);
      if (missing) { reason = `${symbol} has a missing or stale price on ${missing}.`; break; }
    }
    return { ...definition, available: reason === null, reason };
  });
}
