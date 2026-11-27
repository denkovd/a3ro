/* ────────────────────────────────────────────────────────────────
   Vercel cron entrypoint: scheduled daily ingestion cycle.

   Invoked by Vercel Cron per vercel.json schedule ("0 6 * * *").
   The ingestion cycle is idempotent — re-running it is safe.

   Order (oil path first so slower downstream feeds cannot consume
   the function budget before oil scores land):
     price → baselines → seasonal → macro →
     positioning → scores → gold (last; not required for oil scores).
   Corridors (EIA physical, PortWatch, MPA, China) run only in
   /api/cron/oil, beside prices on their own 300 s budget. Running them
   here too doubled the calls to rate-limited PortWatch and EIA, and the
   step was cut off at 90 s, starving goldFlow/btc/dividend (26 Nov).
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
  createDb, runIngestionCycle, runBaselineCycle, runGateSpreadCycle,
  runSeasonalCycle, runMacroCycle, runPositioningCycle, runScoreCycle,
  runGoldCycle, runGoldFlowCycle,
} from "@a3ro/oil-backend";
import type { MacroCycleReport } from "@a3ro/oil-backend";
import { requireCronAuth } from "../../_lib/cronAuth";
import { runDividendCycle } from "../../../../backend/src/ingest/dividendCycle";
import { withErrorLog } from "../../_lib/errorLog";

export const runtime = "nodejs";
// Never statically pre-render at build time — this route runs a full
// ingestion against the live DB. Runtime-only (fixes build timeouts).
export const dynamic = "force-dynamic";
// The price cycle plus baselines/seasonal/macro/positioning/gold/dividend
// need a five-minute budget for the independent source cycles.
export const maxDuration = 300;
/** No step starts after this. */
const STEP_BUDGET_MS = 240_000;
/** Longest any one later step is waited on, and the price step. */
const STEP_MAX_MS = 90_000;
const PRICE_MAX_MS = 120_000;
/** Nothing is waited on past this, leaving time to answer (and record the run) before 300 s. */
const HARD_DEADLINE_MS = 270_000;

export const GET = withErrorLog("cron:ingest", async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await createDb();
    const began = Date.now();
    // Each step's duration, and any step skipped or cut short for time, so Ops → Data health
    // shows the slow one.
    const timings: Record<string, number | "skipped" | "cut off"> = {};
    const skipped: string[] = [];
    // Vercel kills the function at 300 s, and a killed run records nothing. Several sources have no
    // request timeout of their own, so a hung request used to hold a step until the kill (25 Nov).
    // Now: no step starts after STEP_BUDGET_MS, none is waited on longer than STEP_MAX_MS, and
    // nothing is waited on past HARD_DEADLINE_MS. A step cut short keeps running in the background
    // until the function stops; all steps are idempotent and run again tomorrow.
    const secs = (ms: number) => Math.round(ms / 100) / 10;
    function capped<T>(name: string, run: () => Promise<T>, capMs: number): Promise<T | { error: string }> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cut = new Promise<{ error: string }>((resolve) => {
        timer = setTimeout(() => {
          timings[name] = "cut off";
          skipped.push(name);
          resolve({ error: `cut off: still running after ${secs(capMs)} s` });
        }, Math.max(0, capMs));
      });
      return Promise.race([run(), cut]).finally(() => clearTimeout(timer));
    }
    async function step<T>(name: string, run: () => Promise<T>): Promise<T | { error: string }> {
      const used = Date.now() - began;
      if (used > STEP_BUDGET_MS) {
        timings[name] = "skipped";
        skipped.push(name);
        return { error: `skipped: ${Math.round(used / 1000)} s used before this step started` };
      }
      const t = Date.now();
      try {
        return await capped(name, run, Math.min(STEP_MAX_MS, HARD_DEADLINE_MS - used));
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      } finally {
        timings[name] ??= secs(Date.now() - t);
        console.log(`ingest step ${name}: ${timings[name]}`);
      }
    }

    // Price first: the load-bearing feed. Its failure fails the run (caught below).
    const t0 = Date.now();
    const priced = await capped("price", () => runIngestionCycle(db), PRICE_MAX_MS);
    timings.price ??= secs(Date.now() - t0);
    console.log(`ingest step price: ${timings.price}`);
    if ("error" in priced) throw new Error(`price ${priced.error}`);
    const report = priced;

    // Each later step is isolated: one failure can never fail price ingestion or another step.
    // Gate baselines, weekly spreads and seasonal norms self-guard on freshness (~monthly), so
    // most days they are cheap reads.
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
    // BTC (price snapshot and ETF/venue flows) runs in /api/cron/btc at 21:45 UTC (#122);
    // Australia Watch has its own cron and budget at 02:15 UTC.
    const dividend = await step("dividend", () => runDividendCycle(db));

    return Response.json({
      ...report,
      baselines,
      gateSpreads,
      seasonal,
      macro: macroForResponse,
      positioning,
      scores,
      gold,
      goldFlow,
      dividend,
      timings,
      // Read by cron_runs (#47): a skipped step makes the run "degraded", not silently ok.
      ...(skipped.length ? { degraded: skipped.map((name) => `${name}: ${timings[name] === "cut off" ? "cut off after a long wait" : "skipped for time"}`) } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
});
