/* ────────────────────────────────────────────────────────────────
   Bull Market Finder (unified) — recent verdict transitions.
   The "what just turned" feed: every verdict change the scanner has
   recorded in the last ?days= (default 14, max 90), newest first,
   for one STRATEGY lens (?strategy=, default ml-dw — transitions
   are diffed per lens; a weekly flip and a D×W verdict change are
   separate rows).
──────────────────────────────────────────────────────────────── */

import {
  createDb,
  getRecentTransitions,
  isStrategyId,
  DEFAULT_STRATEGY,
  STRATEGIES,
} from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("days") ?? "14");
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 90) : 14;

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
    const rows = await getRecentTransitions(db, days, strategy);
    return Response.json({ days, strategy, count: rows.length, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
