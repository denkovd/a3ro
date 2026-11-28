import { createDb, logOpenDataSignals, runMacroCycle, scoreSignalLog } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Independent daily refresh: other ingestion feeds cannot exhaust its budget.
 * Afterwards it logs the open-data signals for the public track record (#11). It runs
 * after the Australia Watch (02:15) and OECD (03:00) refreshes, so both reads are
 * the day's latest. Then it scores any calls now 1, 3 or 6 months old (#11).
 * Logging and scoring are best-effort and never change the status code.
 */
export const GET = withErrorLog("cron:macro", async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  let body: Record<string, unknown>;
  let status: number;
  let db: Awaited<ReturnType<typeof createDb>> | null = null;
  try {
    db = await createDb();
    const report = await runMacroCycle(db);
    const { panel: _panel, ...publicReport } = report;
    body = publicReport;
    status = report.error || report.written === 0 ? 503 : 200;
  } catch (error) {
    body = { error: error instanceof Error ? error.message : String(error) };
    status = 503;
  }
  if (db) try {
    body.signals = await logOpenDataSignals(db);
  } catch (error) {
    body.signals = [{ signal: "track-record", ok: false, error: error instanceof Error ? error.message : String(error) }];
  }
  if (db) try {
    body.trackRecord = await scoreSignalLog(db);
  } catch (error) {
    body.trackRecord = { scored: 0, rows: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }
  return Response.json(body, { status });
});
