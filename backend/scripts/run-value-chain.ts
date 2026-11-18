import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildValueChainSnapshot } from "../src/dividend/valueChain/metrics";
import { fetchValueChain } from "../src/dividend/valueChain/sec";
import { runValueChainCycle } from "../src/ingest/valueChainCycle";
import { createDb } from "../src/storage/db";
import { ensureDatabaseUrl } from "./loadEnv";

// Usage: npm run run:value-chain [-- --archive] [-- --output file.json]
// Requires SEC_USER_AGENT (a name and contact email; SEC rejects anonymous requests).
const billions = (value: number | null) => value == null ? "—" : `$${(value / 1e9).toFixed(1)}B`;
const percent = (value: number | null) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;

async function main() {
  if (process.argv.includes("--archive")) {
    ensureDatabaseUrl();
    const report = await runValueChainCycle(await createDb());
    console.log(JSON.stringify(report, null, 2));
    if (!report.archived || report.failures.length) process.exitCode = 1;
    return;
  }
  const dataset = await fetchValueChain();
  const snapshot = buildValueChainSnapshot(dataset);
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex !== -1) {
    const destination = process.argv[outputIndex + 1];
    if (!destination || destination.startsWith("--")) throw new Error("--output requires a file path");
    writeFileSync(resolve(destination), JSON.stringify(dataset, null, 2) + "\n");
  }
  console.table(snapshot.layers.map(layer => ({ layer: layer.layer, companies: `${layer.included}/${layer.companies}`, revenue: billions(layer.revenue), growth: percent(layer.revenueGrowth), margin: percent(layer.operatingMargin), capex: billions(layer.capex), capexGrowth: percent(layer.capexGrowth), fcf: billions(layer.freeCashFlow) })));
  console.table(snapshot.companies.map(company => ({ ticker: company.ticker, periodEnd: company.periodEnd, stale: company.stale, revenue: billions(company.ttm.revenue?.value ?? null), margin: percent(company.operatingMargin), capex: billions(company.ttm.capex?.value ?? null), fcf: billions(company.freeCashFlow) })));
  if (dataset.failures.length) { console.error("Failures:", dataset.failures); process.exitCode = 1; }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Value-chain refresh failed"); process.exitCode = 1; }).finally(() => {
  const pools = (globalThis as typeof globalThis & { __a3roPgPools?: Map<string, { end?: () => Promise<void> }> }).__a3roPgPools;
  return Promise.all([...pools?.values() ?? []].map(pool => pool.end?.()));
});
