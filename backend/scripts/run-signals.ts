import { buildSignalsSnapshot } from "../src/dividend/signals/snapshot";
import { fetchSignals } from "../src/dividend/signals/fetch";
import { CONSTRAINT_SOURCES, STEP3_SOURCES, type SignalDatasets } from "../src/dividend/signals/types";
import { buildConstraintsSnapshot } from "../src/dividend/constraints/gauges";
import { runSignalCycle } from "../src/ingest/signalCycle";
import { createDb } from "../src/storage/db";
import { ensureDatabaseUrl } from "./loadEnv";

// Usage: npm run run:signals [-- --archive] [-- --constraints]
// --constraints fetches the step 4 sources (EIA needs EIA_API_KEY) instead of the step 3 ones.
async function main() {
  const sources = process.argv.includes("--constraints") ? CONSTRAINT_SOURCES : STEP3_SOURCES;
  if (process.argv.includes("--archive")) {
    ensureDatabaseUrl();
    const report = await runSignalCycle(await createDb(), { sources });
    console.log(JSON.stringify(report, null, 2));
    if (report.results.some(result => !result.archived)) process.exitCode = 1;
    return;
  }
  const fetched = await fetchSignals({ sources });
  const datasets = Object.fromEntries(fetched.flatMap(item => item.dataset ? [[item.source, item.dataset]] : [])) as SignalDatasets;
  if (sources === CONSTRAINT_SOURCES) {
    const constraints = buildConstraintsSnapshot(datasets, undefined, null);
    console.table(constraints.gauges.map(gauge => ({ gauge: gauge.id, status: gauge.status, value: gauge.value, asOf: gauge.asOf })));
    const failures = fetched.filter(item => item.error);
    if (failures.length) { console.error("Failures:", failures.map(item => ({ source: item.source, error: item.error }))); process.exitCode = 1; }
    return;
  }
  const snapshot = buildSignalsSnapshot(datasets, []);
  const { capability, adoption, postings } = snapshot;
  console.log(JSON.stringify({
    capability: capability && { leader: capability.leader, gainLast12Months: capability.gainLast12Months, openGap: capability.openGap, models: capability.models },
    adoption: adoption && { latest: adoption.latest, changeSixMonths: adoption.changeSixMonths },
    postings: postings && { latestDay: postings.latestDay, gap: postings.gap, gapAtLaunch: postings.gapAtLaunch },
    failures: fetched.filter(item => item.error).map(item => ({ source: item.source, error: item.error })),
  }, null, 2));
  if (fetched.some(item => item.error)) process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Signal refresh failed"); process.exitCode = 1; }).finally(() => {
  const pools = (globalThis as typeof globalThis & { __a3roPgPools?: Map<string, { end?: () => Promise<void> }> }).__a3roPgPools;
  return Promise.all([...pools?.values() ?? []].map(pool => pool.end?.()));
});
