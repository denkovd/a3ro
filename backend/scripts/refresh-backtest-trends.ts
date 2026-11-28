/* Daily 21- and 63-observation VAMS signals for the internal regime lab.

     npm --prefix backend run backtest:trends [-- --cache-dir <dir with trend-bars-{stocks,gold,bitcoin}.json>]

   Writes backend/.backtest-cache/lab-trends.json (gitignored). It never touches the
   published public/data/regime-backtest.json, so the live Regime page is unaffected. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SLEEVES, type SleeveKey } from "../src/macro/allocation";
import { fetchDailyHistory } from "../src/regime/yahooHistory";
import { buildDailyVams } from "../src/macro/vams21History";
import { LAB_TRENDS_PATH, type LabTrends } from "../src/macro/internalResearch";
import type { ResearchDataset } from "../src/macro/backtestResearch";
import type { RegimeBar } from "../src/regime/types";

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const dataset: ResearchDataset = JSON.parse(readFileSync(resolve(root, "public/data/regime-backtest.json"), "utf8"));
  const cacheAt = process.argv.indexOf("--cache-dir");
  const cacheDir = cacheAt >= 0 ? process.argv[cacheAt + 1] : null;
  if (cacheAt >= 0 && !cacheDir) throw new Error("--cache-dir requires a directory with trend-bars-{stocks,gold,bitcoin}.json.");
  const bars: Partial<Record<SleeveKey, RegimeBar[]>> = {};
  for (const sleeve of SLEEVES) {
    const history: RegimeBar[] = cacheDir ? JSON.parse(readFileSync(resolve(cacheDir, `trend-bars-${sleeve.key}.json`), "utf8")) : await fetchDailyHistory(sleeve.symbol, "max");
    if (!Array.isArray(history) || history.some((b, i) => !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(b.close) || b.close <= 0 || i > 0 && b.date <= history[i - 1].date))
      throw new Error(`Invalid daily signal history: ${sleeve.symbol}.`);
    bars[sleeve.key] = history.filter(b => b.date <= dataset.through);
  }
  const calendar = dataset.prices.stocks ?? [];
  const trends: LabTrends = { through: dataset.through, generatedAt: new Date().toISOString(),
    vams21Signals: buildDailyVams(bars, calendar, 21), vams63Signals: buildDailyVams(bars, calendar, 63) };
  const destination = resolve(root, LAB_TRENDS_PATH);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(`${destination}.tmp`, JSON.stringify(trends));
  renameSync(`${destination}.tmp`, destination);
  console.log(`Wrote ${trends.vams21Signals.length} daily 21/63-observation signals through ${trends.through} to ${LAB_TRENDS_PATH}.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
