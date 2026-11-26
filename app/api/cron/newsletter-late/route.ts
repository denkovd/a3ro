// Second Monday slot for the newsletter send (08:05 UTC = 6pm Sydney outside daylight saving).
// Same handler as /api/cron/newsletter; rules in lib/newsletterCron.ts.
import { withErrorLog } from "../../_lib/errorLog";
import { runNewsletterCron } from "../../../../lib/newsletterCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withErrorLog("cron:newsletter-late", runNewsletterCron);
