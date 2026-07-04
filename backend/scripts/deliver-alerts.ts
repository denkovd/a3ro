/* Manual/dev entrypoint: `npm run deliver-alerts` (needs DATABASE_URL).
   Production scheduling (Vercel cron route or systemd timer) is deferred —
   whatever the wrapper is, it should do exactly this and nothing more. */

import { createDb } from "../src/storage/db";
import { deliverPendingAlerts, consoleAlertDelivery } from "../src/alerts/deliver";

const db = await createDb();
const report = await deliverPendingAlerts(db, consoleAlertDelivery);
console.log(JSON.stringify(report, null, 2));
