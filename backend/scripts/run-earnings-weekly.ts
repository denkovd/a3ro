/* Manual/dev entrypoint: `npm run run:earnings-weekly` (needs DATABASE_URL +
   FINNHUB_API_KEY). Production scheduling is the Vercel cron route
   (app/api/cron/earnings) — this script does exactly what that route
   does, for local iteration and ad-hoc re-runs. */

import { createDb } from "../src/storage/db";
import { runWeeklyIncremental } from "../src/earnings/pipeline";

const db = await createDb();
const report = await runWeeklyIncremental(db, { log: (msg) => console.error(msg) });
console.log(JSON.stringify(report, null, 2));
