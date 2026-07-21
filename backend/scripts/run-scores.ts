/* Manual/dev entrypoint: `npm run run:scores` (needs DATABASE_URL). */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { runScoreCycle } from "../src/ingest/scorePipeline";

const db = await createDb();
const report = await runScoreCycle(db);
console.log(JSON.stringify(report, null, 2));
