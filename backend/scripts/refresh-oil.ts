/** Focused oil refresh; never runs unrelated asset cycles or copies deployment secrets. */
import { ensureDatabaseUrl, ensureEnvVar } from "./loadEnv";
import { createDb } from "../src/storage/db";
import { runIngestionCycle } from "../src/ingest/pipeline";
import { runCorridorCycle } from "../src/ingest/corridorPipeline";
import { runRefineryCycle } from "../src/ingest/refineryCycle";
ensureDatabaseUrl(); ensureEnvVar("EIA_API_KEY"); ensureEnvVar("FRED_API_KEY");
const db = await createDb();
const [prices, physical, refineries] = await Promise.all([
  runIngestionCycle(db), runCorridorCycle(db), runRefineryCycle(db),
]);
console.log(JSON.stringify({ prices, physical, refineries }, null, 2));
process.exit([prices, physical, refineries].some(r => r.polled.some(p => !p.ok && !("skipped" in p && p.skipped))) ? 1 : 0);
