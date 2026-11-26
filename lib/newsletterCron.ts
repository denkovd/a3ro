import { createDb, sendDueIssue } from "@a3ro/oil-backend";
import { requireCronAuth } from "../app/api/_lib/cronAuth";
import { newsletterEnv } from "./newsletter";

/**
 * Weekly newsletter send (roadmap #36). Runs Mondays at 07:05 UTC (/api/cron/newsletter) and 08:05 UTC
 * (newsletter-late) so one of them lands at 6pm Sydney whether or not daylight saving is on.
 * Sends only the issue approved in Admin → Newsletter, only from 6pm Monday Sydney time, and
 * never to the same person twice; anything left over is picked up by the next run.
 */
export async function runNewsletterCron(request: Request): Promise<Response> {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  const cfg = newsletterEnv();
  if ("missing" in cfg) return Response.json({ error: `${cfg.missing} not set` }, { status: 503 });
  try {
    const report = await sendDueIssue(await createDb(), cfg.env);
    return Response.json(report, { status: report.error ? 502 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
