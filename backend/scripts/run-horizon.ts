import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildHorizonSnapshot } from "../src/horizon/engine";
import { fetchHorizonBaseline } from "../src/horizon/sources";
import { runHorizonCycle } from "../src/ingest/horizonCycle";
import { createDb } from "../src/storage/db";
import { ensureDatabaseUrl } from "./loadEnv";

async function main() {
  if (process.argv.includes("--archive")) {
    ensureDatabaseUrl();
    const report = await runHorizonCycle(await createDb());
    console.log(JSON.stringify(report, null, 2));
    if (report.results.some(result => !result.archived || result.health !== "healthy")) process.exitCode = 1;
    return;
  }
  const { datasets, states } = await fetchHorizonBaseline();
  const snapshot = buildHorizonSnapshot(datasets, states);
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex !== -1) {
    const destination = process.argv[outputIndex + 1];
    if (!destination || destination.startsWith("--")) throw new Error("--output requires a file path");
    writeFileSync(resolve(destination), JSON.stringify(snapshot, null, 2) + "\n");
  }
  console.log(JSON.stringify({ status: snapshot.status, coverage: snapshot.coverage, sources: states, readings: snapshot.indicators.map(indicator => ({ key: indicator.key, latest: indicator.latest, annualChange: indicator.annualChange, freshness: indicator.freshness })) }, null, 2));
  if (snapshot.status !== "ready") process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Horizon refresh failed"); process.exitCode = 1; }).finally(() => {
  const pools = (globalThis as typeof globalThis & { __a3roPgPools?: Map<string, { end?: () => Promise<void> }> }).__a3roPgPools;
  return Promise.all([...pools?.values() ?? []].map(pool => pool.end?.()));
});
