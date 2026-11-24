import { createDb, runAustraliaWatchCycle } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";
import { logAppError, withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Independent budget: slow oil/market feeds must not prevent ABS and RBA refreshes.
 * OECD series are not fetched here: sdmx.oecd.org answers HTTP 500 to requests that come too close
 * together, and spacing them out takes longer than this cron can wait, so the GitHub Actions
 * workflow oecd-refresh.yml fetches them twice a day, a minute apart (roadmap #78).
 * Each series fails on its own (recorded as degraded), so a partial failure is still a 200 with the
 * failed series listed under `degraded`. Only a refresh where every series failed is a 502.
 */
export const GET = withErrorLog("cron:australia-watch", async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runAustraliaWatchCycle(await createDb(), { sources: ["abs_sdmx", "rba_csv"] });
    const entries = Object.entries(report.results);
    const degraded = entries.filter(([, result]) => result.error).map(([indicator]) => indicator);
    const allFailed = entries.length > 0 && degraded.length === entries.length;
    if (allFailed) console.error("Australia Watch: every ABS and RBA series failed to refresh");
    else if (degraded.length) console.warn(`Australia Watch: ${degraded.length} of ${entries.length} series failed to refresh: ${degraded.join(", ")}`);
    // A partial failure is a 200, so the wrapper won't see it: log each failed series on its own.
    if (!allFailed) await Promise.all(degraded.map((indicator) => logAppError("cron:australia-watch", `${indicator}: ${report.results[indicator].error}`)));
    return Response.json({ ...report, degraded }, { status: allFailed ? 502 : 200 });
  } catch {
    console.error("Australia Watch refresh failed");
    return Response.json({ error: "Australia Watch refresh failed" }, { status: 500 });
  }
});
