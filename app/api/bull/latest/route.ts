/* ────────────────────────────────────────────────────────────────
   Bull Market Finder (unified) — read-only ranked snapshot.
   Newest scan, rank-ordered per STRATEGY lens (?strategy=, default
   ml-dw — the daily×weekly double-confirm, i.e. the pre-merge
   behavior, so existing consumers keep working unchanged).
   Optional ?tier= filter (macro | us_large | ndx_extra | crypto | etf).
   Each row carries `consensus`: how the other lenses read the same
   symbol on this run (bull/bear/neutral of N).
   Writes happen in the GitHub Actions daily scan (bull-scan.yml),
   NOT on Vercel — this route only reads.
──────────────────────────────────────────────────────────────── */

import {
  createDb,
  getLatestBullSnapshots,
  getLatestVerdictsBySymbol,
  isStrategyId,
  tallyConsensus,
  DEFAULT_STRATEGY,
  STRATEGIES,
} from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS = new Set(["macro", "us_large", "ndx_extra", "crypto", "etf"]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tierParam = url.searchParams.get("tier");
    const tier = tierParam && TIERS.has(tierParam) ? tierParam : undefined;

    const strategyParam = url.searchParams.get("strategy");
    if (strategyParam !== null && !isStrategyId(strategyParam)) {
      return Response.json(
        {
          error: `unknown strategy "${strategyParam}" — valid: ${STRATEGIES.map((s) => s.id).join(", ")}`,
        },
        { status: 400 },
      );
    }
    const strategy = strategyParam ?? DEFAULT_STRATEGY;

    const db = await createDb();
    const [rows, verdictsBySymbol] = await Promise.all([
      getLatestBullSnapshots(db, tier, strategy),
      getLatestVerdictsBySymbol(db),
    ]);

    return Response.json({
      runDate: rows.length > 0 ? rows[0].runDate : null,
      count: rows.length,
      tier: tier ?? null,
      strategy,
      // Data-driven switcher: adding a backend strategy lights up the
      // UI without a frontend release.
      strategies: STRATEGIES.map(({ id, label, timeframe }) => ({ id, label, timeframe })),
      rows: rows.map((r) => ({
        ...r,
        consensus: tallyConsensus(verdictsBySymbol.get(r.symbol) ?? []),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
