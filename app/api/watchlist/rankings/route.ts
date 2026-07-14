/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Tracker — rankings read endpoint (architecture spec §4).

   GET /api/watchlist/rankings
     ?active=true|false        default true
     &min_quarters=<int>       default 0
     &limit=<int>              default 100
     &order=asc|desc           default desc (on rank_score)

   DB-only: the compute layer (backend/src/earnings/engine.ts) runs
   on cached rows and never calls Finnhub on this path (§4 "The read
   path never calls Finnhub; it serves from earnings_surprises").
──────────────────────────────────────────────────────────────── */

import { computeTickerMetrics, createDb, getRankingData } from "@a3ro/oil-backend";
import type { ApiErrorBody, RankingsResponse, RankingsResultEntry } from "@a3ro/oil-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorBody(code: ApiErrorBody["error"]["code"], message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** Parses and validates query params. Returns null + a Response on
 *  the first invalid param (§4 errors: 400 INVALID_PARAM). */
function parseParams(url: URL):
  | { active: boolean; minQuarters: number; limit: number; order: "asc" | "desc" }
  | { error: Response } {
  const activeRaw = url.searchParams.get("active");
  let active = true;
  if (activeRaw !== null) {
    if (activeRaw !== "true" && activeRaw !== "false") {
      return { error: Response.json(errorBody("INVALID_PARAM", `active must be "true" or "false", got "${activeRaw}"`), { status: 400 }) };
    }
    active = activeRaw === "true";
  }

  const minQuartersRaw = url.searchParams.get("min_quarters");
  let minQuarters = 0;
  if (minQuartersRaw !== null) {
    if (!/^\d+$/.test(minQuartersRaw)) {
      return { error: Response.json(errorBody("INVALID_PARAM", `min_quarters must be a non-negative integer, got "${minQuartersRaw}"`), { status: 400 }) };
    }
    minQuarters = Number(minQuartersRaw);
  }

  const limitRaw = url.searchParams.get("limit");
  let limit = 100;
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw) || Number(limitRaw) === 0) {
      return { error: Response.json(errorBody("INVALID_PARAM", `limit must be a positive integer, got "${limitRaw}"`), { status: 400 }) };
    }
    limit = Number(limitRaw);
  }

  const orderRaw = url.searchParams.get("order");
  let order: "asc" | "desc" = "desc";
  if (orderRaw !== null) {
    if (orderRaw !== "asc" && orderRaw !== "desc") {
      return { error: Response.json(errorBody("INVALID_PARAM", `order must be "asc" or "desc", got "${orderRaw}"`), { status: 400 }) };
    }
    order = orderRaw;
  }

  return { active, minQuarters, limit, order };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseParams(url);
  if ("error" in parsed) return parsed.error;
  const { active, minQuarters, limit, order } = parsed;

  let entries;
  try {
    const db = await createDb();
    entries = await getRankingData(db, { activeOnly: active, perTicker: 4 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Distinguish "DB unreachable" from other unhandled failures so the
    // 503 vs 500 split in §4's error table is meaningful, not a coin flip.
    const unreachable =
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect|timeout/i.test(message) ||
      (err as { code?: string } | undefined)?.code === "ECONNREFUSED";
    if (unreachable) {
      return Response.json(errorBody("UPSTREAM_UNAVAILABLE", message), { status: 503 });
    }
    return Response.json(errorBody("INTERNAL", message), { status: 500 });
  }

  try {
    const results: RankingsResultEntry[] = entries
      .map((entry): RankingsResultEntry | null => {
        // quarters are already newest-first, capped to 4, by getRankingData's
        // lateral join (§3: "N = min(4, available)").
        const metrics = computeTickerMetrics(
          entry.quarters.map((q) => ({
            fiscalYear: q.fiscalYear,
            fiscalQuarter: q.fiscalQuarter,
            epsSurprisePercent: q.epsSurprisePercent,
            revenueSurprisePercent: q.revenueSurprisePercent,
          })),
        );
        if (metrics.quartersAvailable < minQuarters) return null;

        const latestRow = entry.quarters[0] ?? null;
        return {
          ticker: entry.watchlist.ticker,
          company_name: entry.watchlist.companyName,
          is_active: entry.watchlist.isActive,
          rank_score: round2(metrics.rankScore),
          beat_streak: metrics.beatStreak,
          eps_surprise_avg: metrics.epsSurpriseAvg === null ? null : round2(metrics.epsSurpriseAvg),
          revenue_surprise_avg: metrics.revenueSurpriseAvg === null ? null : round2(metrics.revenueSurpriseAvg),
          quarters_available: metrics.quartersAvailable,
          latest: latestRow
            ? {
                fiscal_year: latestRow.fiscalYear,
                fiscal_quarter: latestRow.fiscalQuarter,
                fiscal_date_ending: latestRow.fiscalDateEnding,
                report_date: latestRow.reportDate,
                report_hour: latestRow.reportHour,
                reported_eps: latestRow.reportedEps,
                estimated_eps: latestRow.estimatedEps,
                eps_surprise_percent: latestRow.epsSurprisePercent,
                reported_revenue: latestRow.reportedRevenue,
                estimated_revenue: latestRow.estimatedRevenue,
                revenue_surprise_percent: latestRow.revenueSurprisePercent,
                pulled_at: latestRow.pulledAt,
              }
            // No cached quarters at all: still a valid watchlist row (e.g.
            // freshly added, backfill pending). `latest` has no sensible
            // value here, so it's null rather than a fabricated shape.
            : (null as unknown as RankingsResultEntry["latest"]),
          quarters: entry.quarters.map((q) => ({
            fiscal_year: q.fiscalYear,
            fiscal_quarter: q.fiscalQuarter,
            eps_surprise_percent: q.epsSurprisePercent,
            revenue_surprise_percent: q.revenueSurprisePercent,
          })),
        };
      })
      .filter((r): r is RankingsResultEntry => r !== null)
      .sort((a, b) => (order === "desc" ? b.rank_score - a.rank_score : a.rank_score - b.rank_score))
      .slice(0, limit);

    const body: RankingsResponse = {
      generated_at: new Date().toISOString(),
      count: results.length,
      params: { active, min_quarters: minQuarters, limit, order },
      results,
    };
    return Response.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(errorBody("INTERNAL", message), { status: 500 });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
