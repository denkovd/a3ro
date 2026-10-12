/* Manual/dev entrypoint: `npm run run:earnings-weekly` (needs DATABASE_URL +
   FINNHUB_API_KEY). Production scheduling uses the earnings-weekly
   GitHub Actions workflow. The former Vercel cron route returns 410. */

import { createDb } from "../src/storage/db";
import { runWeeklyIncremental } from "../src/earnings/pipeline";

const db = await createDb();
const report = await runWeeklyIncremental(db, { log: (msg) => console.error(msg) });
console.log(JSON.stringify(report, null, 2));
