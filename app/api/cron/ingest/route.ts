/* ────────────────────────────────────────────────────────────────
   Vercel cron entrypoint: scheduled daily ingestion cycle.

   Invoked by Vercel Cron per vercel.json schedule ("0 6 * * *").
   The ingestion cycle is idempotent — re-running it is safe.

   Order: price ingestion (load-bearing) → corridor metrics →
   regime scan (Module 4). The corridor and regime cycles each run
   in their own try/catch so they can NEVER fail price ingestion —
   and a regime failure can't take down corridors either.

   Auth: If CRON_SECRET env var is set, verifies Authorization header
   to prevent unauthorized calls. Vercel's own cron feature automatically
   sends this header when CRON_SECRET is configured. Local dev without
   CRON_SECRET is not guarded (allows iterating locally).
──────────────────────────────────────────────────────────────── */

import {
  createDb, runIngestionCycle, runCorridorCycle, runRegimeCycle, runBaselineCycle,
  runSeasonalCycle, runScoreCycle,
} from "@a3ro/oil-backend";
import type {
  CorridorCycleReport, RegimeCycleReport, BaselineCycleReport, SeasonalCycleReport,
  ScoreCycleReport,
} from "@a3ro/oil-backend";

export const runtime = "nodejs";
// Never statically pre-render at build time — this route runs a full
// ingestion against the live DB. Runtime-only (fixes build timeouts).
export const dynamic = "force-dynamic";
// Price + corridor cycles plus ~30 sequential-ish Yahoo history
// fetches (regime scan, concurrency 4) need headroom over the 10s
// default. 60s is the Hobby ceiling.
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

    // Regime scan (Module 4) — same isolation posture.
    let regime: RegimeCycleReport | { error: string };
    try {
      regime = await runRegimeCycle(db);
    } catch (e) {
      regime = { error: e instanceof Error ? e.message : String(e) };
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

    // Composite scores - computed FROM the data the cycles above just
    // wrote (prices -> spread; stocks/gates/seasonal -> Flow Stress,
    // Tightness), so it runs last and in its own try/catch: a score
    // failure must never fail ingestion.
    let scores: ScoreCycleReport | { error: string };
    try {
      scores = await runScoreCycle(db);
    } catch (e) {
      scores = { error: e instanceof Error ? e.message : String(e) };
    }

    return Response.json({ ...report, corridors, regime, baselines, seasonal, scores });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
