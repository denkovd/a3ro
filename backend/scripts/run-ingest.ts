/* Manual/dev entrypoint: `npm run ingest` (needs DATABASE_URL + EIA_API_KEY).
   Production scheduling (Vercel cron route or systemd timer) is deferred —
   whatever the wrapper is, it should do exactly this and nothing more. */

import { createDb } from "../src/storage/db";
import { runIngestionCycle } from "../src/ingest/pipeline";

const db = await createDb();
const report = await runIngestionCycle(db);
console.log(JSON.stringify(report, null, 2));
