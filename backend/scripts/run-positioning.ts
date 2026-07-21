/* Manual: `npm run run:positioning` (needs DATABASE_URL; CFTC is keyless). */

import { ensureDatabaseUrl } from "./loadEnv";
ensureDatabaseUrl();

import { createDb } from "../src/storage/db";
import { runPositioningCycle } from "../src/ingest/positioningCycle";

const db = await createDb();
const report = await runPositioningCycle(db);
console.log(JSON.stringify(report, null, 2));
