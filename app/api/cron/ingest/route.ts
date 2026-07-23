/* ────────────────────────────────────────────────────────────────
   Vercel cron entrypoint: scheduled daily ingestion cycle.

   Invoked by Vercel Cron per vercel.json schedule ("0 6 * * *").
   The ingestion cycle is idempotent — re-running it is safe.

   Order (oil path first so the 60s Hobby budget can't be eaten by
   gold before scores land):
     price → corridors → baselines → seasonal → macro →
     positioning → scores → gold (last; not required for oil scores).
   Scores also have a dedicated cron at /api/cron/scores (06:10 UTC)
   as a second line of defence. Each cycle is isolated so a failure
   in one can NEVER take down price ingestion or any other cycle.
   The regime scan (Module 4) was retired from this cron — the
   macro-45 lens now lives in the GitHub Actions bull scan as the
   unified Bull Market Finder's `ml-dw` strategy (all strategy
   lenses run there; see bull-finder-unified-architecture.md).

   Auth: If CRON_SECRET env var is set, verifies Authorization header
   to prevent unauthorized calls. Vercel's own cron feature automatically
   sends this header when CRON_SECRET is configured. Local dev without
   CRON_SECRET is not guarded (allows iterating locally).
──────────────────────────────────────────────────────────────── */

import {
  createDb, runIngestionCycle, runCorridorCycle, runBaselineCycle,
  runSeasonalCycle, runMacroCycle, runPositioningCycle, runScoreCycle,
  runGoldCycle, runGoldFlowCycle,
} from "@a3ro/oil-backend";
import type {
  CorridorCycleReport, BaselineCycleReport, SeasonalCycleReport,
  MacroCycleReport, PositioningCycleReport, ScoreCycleReport,
  GoldCycleReport, GoldFlowCycleReport,
} from "@a3ro/oil-backend";

export const runtime = "nodejs";
// Never statically pre-render at build time — this route runs a full
// ingestion against the live DB. Runtime-only (fixes build timeouts).
export const dynamic = "force-dynamic";
// Price + corridor cycles plus baselines/seasonal/macro/positioning
// need headroom over the 10s default. 60s is the Hobby ceiling.
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    // Auth guard: if CRON_SECRET is set, verify Authorization header.
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = request.headers.get("Authorization");
      const expected = `Bearer ${secret}`;
      if (auth !== expected) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const db = await createDb();
    const report = await runIngestionCycle(db);

    // Corridor ingestion runs in its own try/catch so it can NEVER
    // fail price ingestion — price data is the load-bearing feed.
    let corridors: CorridorCycleReport | { error: string };
    try {
      corridors = await runCorridorCycle(db);
    } catch (e) {
      corridors = { error: e instanceof Error ? e.message : String(e) };
    }

    // Gate baseline refresh — same isolation posture. Internally
    // self-guards on freshness (runs ~monthly), so most days this is
    // a cheap no-op db read rather than a live PortWatch fetch.
    let baselines: BaselineCycleReport | { error: string };
    try {
      baselines = await runBaselineCycle(db);
    } catch (e) {
      baselines = { error: e instanceof Error ? e.message : String(e) };
    }

    // Week-of-year seasonal norms (WPSR stocks) — same isolation +
    // freshness-guard posture as the gate baselines above (~monthly
    // EIA 5y-history fetch; most days a cheap no-op read).
    let seasonal: SeasonalCycleReport | { error: string };
    try {
      seasonal = await runSeasonalCycle(db);
    } catch (e) {
      seasonal = { error: e instanceof Error ? e.message : String(e) };
    }

    // Macro layer (FRED, keyless) — GRID regime (P·06) + Macro pressure
    // (#5), same isolation posture. Runs after price ingestion so the
    // oil-momentum divergence input reads fresh WTI closes.
    let macro: MacroCycleReport | { error: string };
    try {
      macro = await runMacroCycle(db);
    } catch (e) {
      macro = { error: e instanceof Error ? e.message : String(e) };
    }
    // Panel is internal plumbing for goldCycle below (avoids a second
    // 7-series FRED fetch) — stripped from the JSON response, not
    // meant to be part of the cron's public report.
    const macroPanel = "panel" in macro ? macro.panel : undefined;
    const macroForResponse: MacroCycleReport | { error: string } =
      "panel" in macro ? { ...macro, panel: undefined } : macro;

    // CFTC managed-money positioning (Macro Override's other half, P7)
    // — before scores so tape can include crowded-long/short context.
    let positioning: PositioningCycleReport | { error: string };
    try {
      positioning = await runPositioningCycle(db);
    } catch (e) {
      positioning = { error: e instanceof Error ? e.message : String(e) };
    }

    // Composite scores — after oil inputs (prices/corridors/seasonal/
    // macro/positioning), BEFORE gold so a slow gold fetch can't starve
    // the oil intel rail. Dedicated /api/cron/scores is the safety net.
    let scores: ScoreCycleReport | { error: string };
    try {
      scores = await runScoreCycle(db);
    } catch (e) {
      scores = { error: e instanceof Error ? e.message : String(e) };
    }

    // Gold Tracker last — not on the oil score critical path.
    let gold: GoldCycleReport | { error: string };
    try {
      gold = await runGoldCycle(db, { macroPanel });
    } catch (e) {
      gold = { error: e instanceof Error ? e.message : String(e) };
    }

    // Gold stock/flow (COMEX warehouse + WGC ETF holdings) — after price
    // gold; isolated so a blocked CME host cannot fail the rest of cron.
    let goldFlow: GoldFlowCycleReport | { error: string };
    try {
      goldFlow = await runGoldFlowCycle(db);
    } catch (e) {
      goldFlow = { error: e instanceof Error ? e.message : String(e) };
    }

    return Response.json({
      ...report,
      corridors,
      baselines,
      seasonal,
      macro: macroForResponse,
      positioning,
      scores,
      gold,
      goldFlow,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
