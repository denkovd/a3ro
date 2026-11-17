/* Refresh the static research dataset. No database or live-rule mutations.
 * Research-only: current revised FRED data with approximate release lags. */
import { mkdirSync, writeFileSync, renameSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MACRO_SERIES, fetchFredSeries, parseFredCsv, type MacroSeries } from "../src/sources/fredMacro";
import { fetchDailyHistory, fetchAdjustedHistory } from "../src/regime/yahooHistory";
import { REGIME_UNIVERSE } from "../src/regime/universe";
import { RESEARCH_VERSION, TREND_HORIZONS, defaultResearchConfig, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";
import { buildResearchSignal, CORPORATE_PROFITS_Q4_LAG_DAYS, RELEASE_LAG_DAYS, SIGNAL_SCHEMA } from "../src/macro/backtestSignals";
import type { RegimeBar } from "../src/regime/types";
import { loadBenchmarkHistory } from "../src/macro/benchmarkHistory";
import { buildDailyVams21 } from "../src/macro/vams21History";
import { BENCHMARK_HISTORY_SOURCE, BUY_HOLD_SELECTION_NOTE } from "../src/macro/researchBenchmarks";

const destination = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data/regime-backtest.json");
const before = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

async function main() {
  const generatedAt = new Date().toISOString();
  const closedThrough = before(generatedAt.slice(0, 10), 1);
  console.log("Fetching historical macro inputs…");
  const panel: MacroSeries[] = [];
  const at = process.argv.indexOf("--fred-dir");
  const fredDirectory = at >= 0 ? process.argv[at + 1] : null;
  if (at >= 0 && !fredDirectory) throw new Error("--fred-dir requires a directory containing untransformed FRED CSV exports.");
  const exports = fredDirectory ? readdirSync(fredDirectory, { recursive: true }).filter(name => String(name).endsWith(".csv"))
    .map(name => readFileSync(resolve(fredDirectory, String(name)), "utf8")) : [];
  for (const cfg of MACRO_SERIES) {
    if (fredDirectory) {
      const csv = exports.find(text => text.split(/\r?\n/)[0].split(",").includes(cfg.seriesId));
      if (!csv) throw new Error(`Missing untransformed ${cfg.seriesId} in FRED exports.`);
      const lines = csv.split(/\r?\n/), column = lines[0].split(",").indexOf(cfg.seriesId);
      const observations = parseFredCsv(lines.map(line => { const cells = line.split(","); return `${cells[0]},${cells[column] ?? ""}`; }).join("\n"));
      if (!observations.length) throw new Error(`Empty FRED export for ${cfg.seriesId}`);
      panel.push({ ...cfg, observations });
    } else panel.push(await fetchFredSeries(cfg, { lookbackDays: 12000, fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30000) }) }));
    console.log(`  ${cfg.seriesId}`);
  }
  const bars = new Map<string, RegimeBar[]>();
  console.log("Fetching the complete signal universe…");
  for (const symbol of new Set([...REGIME_UNIVERSE.map(e => e.symbol), "HYG"])) {
    const history = await fetchDailyHistory(symbol, "max");
    if (!history.length) throw new Error(`No history for ${symbol}`);
    bars.set(symbol, history.filter(b => b.date <= closedThrough));
    console.log(`  ${symbol}: ${history.length} bars`);
    await new Promise(r => setTimeout(r, 400));
  }
  const prices = {
    stocks: (await fetchAdjustedHistory("SPY")).filter(b => b.date >= "2004-01-01" && b.date <= closedThrough),
    gold: (await fetchAdjustedHistory("GLD")).filter(b => b.date <= closedThrough),
    bitcoin: (bars.get("BTC-USD") ?? []).filter(b => b.date <= closedThrough),
  };
  const through = prices.stocks.at(-1)?.date;
  if (!through || prices.gold.length === 0 || prices.bitcoin.length === 0) throw new Error("Incomplete portfolio price history.");
  const signals: ResearchDataset["signals"] = [];
  const calendar = bars.get("^GSPC") ?? [];
  console.log("Rebuilding monthly signals with publication lags…");
  for (let i = 1; i < calendar.length; i++) {
    const execution = calendar[i].date, signalDate = calendar[i - 1].date;
    if (execution < "2004-01-01" || execution > through || execution.slice(0, 7) === signalDate.slice(0, 7)) continue;
    signals.push(buildResearchSignal({ execution, signalDate, panel, bars, prices }));
  }
  const benchmarkPrices = await loadBenchmarkHistory(through);
  const dataset: ResearchDataset = { version: RESEARCH_VERSION, generatedAt, through, signals, prices,
    signalSchema: SIGNAL_SCHEMA, trendHorizons: [...TREND_HORIZONS],
    releaseLagDays: { ...RELEASE_LAG_DAYS, corporateProfitsQ4: CORPORATE_PROFITS_Q4_LAG_DAYS },
    vams21Signals: buildDailyVams21({ stocks: bars.get("^GSPC"), gold: bars.get("GC=F"), bitcoin: bars.get("BTC-USD") }, prices.stocks),
    vams21GeneratedAt: new Date().toISOString(),
    benchmarkPrices, benchmarkGeneratedAt: new Date().toISOString(),
    sources: ["FRED current revised series", "Yahoo Finance daily signal bars", "SPY and GLD dividend/split-adjusted closes", "BTC-USD daily closes",
      BENCHMARK_HISTORY_SOURCE,
      "Daily 21-observation VAMS: prior-date ^GSPC, GC=F and BTC-USD bars; 100/50/0 exposure rule"],
    warnings: [
      BUY_HOLD_SELECTION_NOTE,
      "Research reconstruction using revised macro data, not a point-in-time or live performance record.",
      `Approximate publication lags from each observation's period start: daily ${RELEASE_LAG_DAYS.daily} days, weekly ${RELEASE_LAG_DAYS.weekly} days, monthly ${RELEASE_LAG_DAYS.monthly} days, quarterly ${RELEASE_LAG_DAYS.quarterly} days (fourth-quarter corporate profits ${CORPORATE_PROFITS_Q4_LAG_DAYS} days). These are not verified historical release dates.`,
      "Each signal row also stores the regime vote shares, 21/63/126/252-observation trend z-scores, 21-session realised S&P 500 volatility with its 126-session median, and the share of the regime universe with a positive 63-observation trend score, for research. The allocation rule still uses only the winning regime and the 63-observation trend state.",
      "Macro regime signals are observed at month-end and executed at the next equity session close; intra-month macro changes are not reconstructed. The separate 21-day VAMS portfolio uses daily prior-date signals.",
      "Stocks and gold returns use SPY and GLD ETF proxies; their signals use the live S&P index and gold futures. Adjusted ETF returns include distributions and embedded fund fees, before taxes.",
      "The signal universe and regime affinities are the current model; historical constituent availability differs. No historical model vintages are available.",
      "Macro series have unequal coverage. Missing cycle inputs remain pending rather than being invented; this can understate historical cycle headwinds.",
      "A later validation period is a chronological comparison, not an untouched holdout once repeatedly used to tune settings."
    ] };
  const check = runResearch(dataset, defaultResearchConfig(through));
  mkdirSync(dirname(destination), { recursive: true });
  // Publish only a complete dataset after a strict portfolio validation.
  writeFileSync(`${destination}.tmp`, JSON.stringify(dataset));
  renameSync(`${destination}.tmp`, destination);
  const m = check.baseline.metrics;
  console.log(`Wrote ${signals.length} signals through ${through}. Baseline, cash at Treasury bills: CAGR ${(m.cagr * 100).toFixed(2)}%, volatility ${(m.volatility * 100).toFixed(2)}%, Sharpe ${m.sharpe.toFixed(2)}, Sortino ${m.sortino.toFixed(2)}, max drawdown ${(m.maxDrawdown * 100).toFixed(2)}%.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
