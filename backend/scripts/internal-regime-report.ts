import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLabConfig, LAB_TRENDS_PATH, runInternalResearch, withLabTrends } from "../src/macro/internalResearch";
import type { ResearchDataset } from "../src/macro/backtestResearch";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const trendsPath = resolve(root, LAB_TRENDS_PATH);
const data: ResearchDataset = withLabTrends(JSON.parse(readFileSync(resolve(root, "public/data/regime-backtest.json"), "utf8")),
  existsSync(trendsPath) ? JSON.parse(readFileSync(trendsPath, "utf8")) : null);
const configAt = process.argv.indexOf("--config");
if (configAt >= 0 && !process.argv[configAt + 1]) throw new Error("--config requires an exported experiment JSON file.");
const saved = configAt >= 0 ? JSON.parse(readFileSync(resolve(process.argv[configAt + 1]), "utf8")) : null;
const result = runInternalResearch(data, saved?.config ?? defaultLabConfig(data.through));
const destination = resolve(root, "backend/.backtest-cache/internal-regime-report.json");
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify(result, null, 2));
console.table(result.rows.map(r => ({ rule: r.name, sharpe: r.metrics.sharpe, cagr: r.metrics.cagr, drawdown: r.metrics.maxDrawdown, movesPerYear: r.campaignsPerYear, screen: r.screen })));
console.table(result.correlations.filter(r => ["S&P 500", "Gold", "Bitcoin"].includes(r.outcome) && r.earlier.n >= 10 && r.later.n >= 10 && r.earlier.spearman !== null && r.later.spearman !== null && r.earlier.spearman * r.later.spearman > 0)
  .sort((a, b) => Math.abs(b.spearman ?? 0) - Math.abs(a.spearman ?? 0)).slice(0, 8)
  .map(r => ({ feature: r.feature, outcome: r.outcome, n: r.n, pearson: r.pearson, spearman: r.spearman, earlier: r.earlier.spearman, later: r.later.spearman })));
console.log(`Exploratory report written to ${destination}. Correlations are not adjusted for selection or multiple testing.`);
