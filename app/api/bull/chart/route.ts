/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — chart payload for one asset (asset drawer).
   GET /api/bull/chart?symbol=NVDA[&range=3m|6m|1y|2y|5y|max]

   OHLC bars + ChartSignal[] (backend/src/bull/chartSignals.ts). The
   Money Line overlay is re-run on the same closed, roll-adjusted
   series the scan used, as of the symbol's latest scan date, so the
   chart's last levels match the table and drawer exactly.
   Read-only. Symbol allow-listed before any database work.
──────────────────────────────────────────────────────────────── */

import {
  buildBullChart,
  createDb,
  getLatestBullSnapshotsForSymbol,
  isBullSymbol,
  isChartRange,
  loadBars,
  DEFAULT_CHART_RANGE,
} from "@a3ro/oil-backend";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLog("api:bull/chart", async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.trim() ?? "";
    if (!symbol) {
      return Response.json({ error: "symbol query param is required" }, { status: 400 });
    }
    if (!isBullSymbol(symbol)) {
      return Response.json({ error: "symbol is not in the scan universe" }, { status: 404 });
    }
    const rangeParam = url.searchParams.get("range");
    if (rangeParam !== null && !isChartRange(rangeParam)) {
      return Response.json({ error: "range must be one of 3m, 6m, 1y, 2y, 5y, max" }, { status: 400 });
    }
    const range = rangeParam ?? DEFAULT_CHART_RANGE;

    const db = await createDb();
    const [lenses, adj] = await Promise.all([
      getLatestBullSnapshotsForSymbol(db, symbol),
      loadBars(db, symbol, "adj"),
    ]);
    const runDate = lenses[0]?.runDate ?? null;
    if (!runDate || adj.length === 0) {
      return Response.json({ symbol, runDate, range, bars: [], signals: [] });
    }
    return Response.json(buildBullChart(symbol, adj, runDate, range));
  } catch {
    return Response.json({ error: "Request could not be completed" }, { status: 500 });
  }
});
