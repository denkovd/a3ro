import { withErrorLog } from "../../_lib/errorLog";
import { runNewsletterCron } from "../../../../lib/newsletterCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly newsletter send, Mondays 07:05 UTC (6pm Sydney in daylight saving). Rules: lib/newsletterCron.ts.
export const GET = withErrorLog("cron:newsletter", runNewsletterCron);
