/* Manual/dev entrypoint: `npm run backfill:earnings -- TICKER [TICKER...]`
   (needs DATABASE_URL + FINNHUB_API_KEY). This is Flow B (architecture
   spec §2) — run it once when adding a ticker to the watchlist so
   streaks/trailing averages are computable immediately, rather than
   waiting ~4 quarters for the weekly cron to accumulate history.

   With no args, reconciles every active ticker under 4 cached
   quarters (the "nightly reconcile" variant of Flow B) — the same
   thing app/api/cron/earnings runs after the weekly pull. */

import { createDb } from "../src/storage/db";
import { backfillTicker, reconcileUnderfilledTickers } from "../src/earnings/pipeline";

const tickers = process.argv.slice(2).map((t) => t.toUpperCase());
const db = await createDb();
const log = (msg: string) => console.error(msg);

if (tickers.length === 0) {
  const report = await reconcileUnderfilledTickers(db, { log });
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const ticker of tickers) {
    const report = await backfillTicker(db, ticker, { log });
    console.log(JSON.stringify(report, null, 2));
  }
}
