/* Refresh the static research dataset. No database or live-rule mutations.
 * Research-only: current revised FRED data with approximate release lags. */
import { mkdirSync, writeFileSync, renameSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MACRO_SERIES, fetchFredSeries, parseFredCsv, type MacroSeries } from "../src/sources/fredMacro";
import { fetchDailyHistory, fetchAdjustedHistory } from "../src/regime/yahooHistory";
import { REGIME_UNIVERSE } from "../src/regime/universe";
import { computeMacroRegime, netLiquiditySeries } from "../src/macro/engine";
import { computeSixCycles } from "../src/macro/cycles";
import { computeRiskMatrix, computeVams } from "../src/macro/vams";
import { SLEEVES, type Quadrant, type SleeveKey } from "../src/macro/allocation";
import { RESEARCH_VERSION, defaultResearchConfig, runResearch, type ResearchDataset } from "../src/macro/backtestResearch";
import type { RegimeBar } from "../src/regime/types";
import { loadBenchmarkHistory } from "../src/macro/benchmarkHistory";
import { buildDailyVams21 } from "../src/macro/vams21History";
import { BENCHMARK_HISTORY_SOURCE, BUY_HOLD_SELECTION_NOTE } from "../src/macro/researchBenchmarks";

const destination = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/data/regime-backtest.json");
const before = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const upTo = (bars: RegimeBar[], date: string) => bars.filter(b => b.date <= date);
const lagged = (panel: MacroSeries[], date: string) => panel.map(s => ({ ...s,
  observations: s.observations.filter(o => o.date <= before(date,
    s.frequency === "quarterly" ? 120 : s.frequency === "monthly" ? 45 : s.frequency === "weekly" ? 8 : 2)) }));

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
    const asOfPanel = lagged(panel, signalDate);
    const growth = asOfPanel.find(s => s.key === "growth_indpro")?.observations ?? [];
    const inflation = asOfPanel.find(s => s.key === "inflation_cpi")?.observations ?? [];
    const economic = computeMacroRegime(growth, inflation, signalDate);
    const reads = REGIME_UNIVERSE.map(e => computeVams(upTo(bars.get(e.symbol) ?? [], signalDate), e.symbol, e.displayName));
    const matrix = computeRiskMatrix(reads, signalDate);
    const cycles = computeSixCycles(asOfPanel, netLiquiditySeries(asOfPanel),
      upTo(calendar, signalDate), upTo(bars.get("HYG") ?? [], signalDate), signalDate);
    const states: ResearchDataset["signals"][number]["states"] = {};
    const unavailable: SleeveKey[] = [];
    for (const sleeve of SLEEVES) {
      const history = upTo(bars.get(sleeve.symbol) ?? [], signalDate);
      const proxy = upTo(prices[sleeve.key], execution);
      if (history.length < 64 || !proxy.length) unavailable.push(sleeve.key);
      states[sleeve.key] = computeVams(history, sleeve.symbol, sleeve.label).state;
    }
    signals.push({ date: execution, signalDate,
      marketRegime: matrix.modalRegime === "PENDING" ? null : matrix.modalRegime as Quadrant,
      economicQuadrant: economic.quadrant === "PENDING" ? null : economic.quadrant as Quadrant,
      states, headwinds: cycles.headwinds, unavailable });
  }
  const benchmarkPrices = await loadBenchmarkHistory(through);
  const dataset: ResearchDataset = { version: RESEARCH_VERSION, generatedAt, through, signals, prices,
    vams21Signals: buildDailyVams21({ stocks: bars.get("^GSPC"), gold: bars.get("GC=F"), bitcoin: bars.get("BTC-USD") }, prices.stocks),
    vams21GeneratedAt: new Date().toISOString(),
    benchmarkPrices, benchmarkGeneratedAt: new Date().toISOString(),
    sources: ["FRED current revised series", "Yahoo Finance daily signal bars", "SPY and GLD dividend/split-adjusted closes", "BTC-USD daily closes",
      BENCHMARK_HISTORY_SOURCE,
      "Daily 21-observation VAMS: prior-date ^GSPC, GC=F and BTC-USD bars; 100/50/0 exposure rule"],
    warnings: [
      BUY_HOLD_SELECTION_NOTE,
      "Research reconstruction using revised macro data, not a point-in-time or live performance record.",
      "Approximate publication lags: daily 2 days, weekly 8 days, monthly 45 days, quarterly 120 days. These are not verified historical release dates.",
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
  console.log(`Wrote ${signals.length} signals through ${through}. Baseline CAGR ${(check.baseline.metrics.cagr * 100).toFixed(2)}%.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
