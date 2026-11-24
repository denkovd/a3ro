/* ────────────────────────────────────────────────────────────────
   Vercel cron entrypoint: scheduled daily ingestion cycle.

   Invoked by Vercel Cron per vercel.json schedule ("0 6 * * *").
   The ingestion cycle is idempotent — re-running it is safe.

   Order (oil path first so slower downstream feeds cannot consume
   the function budget before oil scores land):
     price → corridors → baselines → seasonal → macro →
     positioning → scores → gold (last; not required for oil scores).
   Scores also have a dedicated cron at /api/cron/scores (06:10 UTC)
   as a second line of defence. Each cycle is isolated so a failure
   in one can NEVER take down price ingestion or any other cycle.
   The regime scan (Module 4) was retired from this cron — the
   macro-30 lens now lives in the GitHub Actions bull scan as the
   unified Bull Market Finder's `ml-dw` strategy (all strategy
   lenses run there; see bull-finder-unified-architecture.md).

   Auth: verifies Authorization header against CRON_SECRET (Vercel's
   own cron feature sends this automatically when CRON_SECRET is
   configured). Fails closed in every environment if CRON_SECRET is
   unset — see app/api/_lib/cronAuth.ts.
──────────────────────────────────────────────────────────────── */

import {
  createDb, runIngestionCycle, runCorridorCycle, runBaselineCycle, runGateSpreadCycle,
  runSeasonalCycle, runMacroCycle, runPositioningCycle, runScoreCycle,
  runGoldCycle, runGoldFlowCycle, runBtcCycle, runBtcFlowCycle,
} from "@a3ro/oil-backend";
import type { MacroCycleReport } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";
import { runDividendCycle } from "../../../../backend/src/ingest/dividendCycle";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
// Never statically pre-render at build time — this route runs a full
// ingestion against the live DB. Runtime-only (fixes build timeouts).
export const dynamic = "force-dynamic";
// Price + corridor cycles plus baselines/seasonal/macro/positioning
// need a five-minute budget for the independent source cycles.
export const maxDuration = 300;
/** No step starts after this; leaves a minute for the slowest step and the response. */
const STEP_BUDGET_MS = 240_000;

export const GET = withErrorLog("cron:ingest", async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await createDb();
    const began = Date.now();
    // Each step's duration, and any step skipped for time, so Ops → Data health shows the slow one.
    const timings: Record<string, number | "skipped"> = {};
    const skipped: string[] = [];
    // Vercel kills the function at 300 s, and a killed run records nothing. So no step starts after
    // STEP_BUDGET_MS; the rest are reported as skipped and run again tomorrow (all are idempotent).
    async function step<T>(name: string, run: () => Promise<T>): Promise<T | { error: string }> {
      if (Date.now() - began > STEP_BUDGET_MS) {
        timings[name] = "skipped";
        skipped.push(name);
        return { error: `skipped: ${Math.round((Date.now() - began) / 1000)} s used before this step started` };
      }
      const t = Date.now();
      try {
        return await run();
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      } finally {
        timings[name] ??= Math.round((Date.now() - t) / 100) / 10;
      }
    }

    // Price first: the load-bearing feed. Its failure fails the run (caught below).
    const t0 = Date.now();
    const report = await runIngestionCycle(db);
    timings.price = Math.round((Date.now() - t0) / 100) / 10;

    // Each later step is isolated: one failure can never fail price ingestion or another step.
    // Gate baselines, weekly spreads and seasonal norms self-guard on freshness (~monthly), so
    // most days they are cheap reads.
    const corridors = await step("corridors", () => runCorridorCycle(db));
    const baselines = await step("baselines", () => runBaselineCycle(db));
    const gateSpreads = await step("gateSpreads", () => runGateSpreadCycle(db));
    const seasonal = await step("seasonal", () => runSeasonalCycle(db));
    // Macro (FRED) after price so the oil-momentum divergence reads fresh WTI closes.
    const macro: MacroCycleReport | { error: string } = await step("macro", () => runMacroCycle(db));
    // The panel feeds the gold step (saves a second FRED fetch); it isn't part of the report.
    const macroPanel = "panel" in macro ? macro.panel : undefined;
    const macroForResponse: MacroCycleReport | { error: string } =
      "panel" in macro ? { ...macro, panel: undefined } : macro;
    // CFTC positioning before scores so tape can include crowded-long/short context.
    const positioning = await step("positioning", () => runPositioningCycle(db));
    // Scores before gold so a slow gold fetch can't starve the oil intel rail
    // (/api/cron/scores at 06:10 UTC is the safety net).
    const scores = await step("scores", () => runScoreCycle(db));
    const gold = await step("gold", () => runGoldCycle(db, { macroPanel }));
    const goldFlow = await step("goldFlow", () => runGoldFlowCycle(db));
    const btc = await step("btc", () => runBtcCycle(db));
    const btcFlow = await step("btcFlow", () => runBtcFlowCycle(db));
    // Australia Watch has its own cron and budget at 02:15 UTC.
    const dividend = await step("dividend", () => runDividendCycle(db));

    return Response.json({
      ...report,
      corridors,
      baselines,
      gateSpreads,
      seasonal,
      macro: macroForResponse,
      positioning,
      scores,
      gold,
      goldFlow,
      btc,
      btcFlow,
      dividend,
      timings,
      // Read by cron_runs (#47): a skipped step makes the run "degraded", not silently ok.
      ...(skipped.length ? { degraded: skipped.map((name) => `${name}: skipped for time`) } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
});
