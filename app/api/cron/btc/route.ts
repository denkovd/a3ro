import { createDb, runBtcCycle } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Independent budget for the BTC price cycle. It used to run near the
 *  end of /api/cron/ingest, behind gold flow and every oil cycle, and
 *  btc_snapshots stopped advancing on 26 Oct 2026 while the live
 *  Coinbase markets feed kept working — the signature of a cycle that
 *  never got its turn inside the 300 s ingest budget. Same posture as
 *  australia-watch/macro: own route, own schedule, non-200 on failure
 *  so a silent stall shows up in Vercel's cron log. */
export const GET = withErrorLog("cron:btc", async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runBtcCycle(await createDb());
    if (report.error || report.written === 0) {
      console.error(JSON.stringify({ job: "btc", status: "failed", error: report.error ?? "no snapshot written" }));
      return Response.json(report, { status: 503 });
    }
    return Response.json(report);
  } catch {
    console.error(JSON.stringify({ job: "btc", status: "failed" }));
    return Response.json({ error: "BTC refresh failed" }, { status: 503 });
  }
});
