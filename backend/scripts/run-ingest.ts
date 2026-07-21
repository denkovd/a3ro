/* Manual/dev entrypoint: `npm run ingest` (needs DATABASE_URL + EIA_API_KEY).
   Production scheduling is the Vercel cron at /api/cron/ingest. */

import { ensureDatabaseUrl, ensureEnvVar } from "./loadEnv";
ensureDatabaseUrl();
ensureEnvVar("EIA_API_KEY");

import { createDb } from "../src/storage/db";
import { runIngestionCycle } from "../src/ingest/pipeline";

const db = await createDb();
const report = await runIngestionCycle(db);
console.log(JSON.stringify(report, null, 2));
