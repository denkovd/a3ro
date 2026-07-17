/* ────────────────────────────────────────────────────────────────
   Earnings-Beat Leaderboard — v2 read endpoint (architecture spec §4).

   GET /api/leaderboard/earnings-beats
     ?active=true|false        default true
     &min_quarters=<int>       default 0
     &limit=<int>              default 100
     &order=asc|desc           default desc (on rank_score)
     &ticker=<symbol>          optional single-ticker detail view

   DB-only: the ranking engine (./engine.ts) runs on cached rows and
   never calls Finnhub on this path (§4: "the read path never calls
   Finnhub — it serves from Postgres only").

   Self-contained on purpose: does not import "@a3ro/oil-backend"
   (= backend/src via tsconfig paths). backend/src/earnings is being
   upgraded concurrently by a separate workstream, so this route owns
   its own pg pool (./db.ts) and ranking math (./engine.ts) instead of
   depending on that in-flight package.
──────────────────────────────────────────────────────────────── */

import { createPool, getDataAsOf, loadLeaderboardData, type TickerData } from "./db";
import { computeTickerMetrics, RANKING_CONFIG, round2, type QuarterSurprise } from "./engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrorCode = "INVALID_PARAM" | "TICKER_NOT_FOUND" | "INTERNAL" | "DB_UNAVAILABLE";

interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

function errorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

function errorResponse(code: ErrorCode, message: string, status: number): Response {
  return Response.json(errorBody(code, message), { status });
}

interface ParsedParams {
  active: boolean;
  minQuarters: number;
  limit: number;
  order: "asc" | "desc";
  ticker: string | null;
}

/** Parses and validates query params (§4 errors: 400 INVALID_PARAM). */
function parseParams(url: URL): { params: ParsedParams } | { error: Response } {
  const activeRaw = url.searchParams.get("active");
  let active: boolean = RANKING_CONFIG.DEFAULT_ACTIVE;
  if (activeRaw !== null) {
    if (activeRaw !== "true" && activeRaw !== "false") {
      return { error: errorResponse("INVALID_PARAM", `active must be "true" or "false", got "${activeRaw}"`, 400) };
    }
    active = activeRaw === "true";
  }

  const minQuartersRaw = url.searchParams.get("min_quarters");
  let minQuarters: number = RANKING_CONFIG.DEFAULT_MIN_QUARTERS;
  if (minQuartersRaw !== null) {
    if (!/^\d+$/.test(minQuartersRaw)) {
      return { error: errorResponse("INVALID_PARAM", `min_quarters must be a non-negative integer, got "${minQuartersRaw}"`, 400) };
    }
    minQuarters = Number(minQuartersRaw);
  }

  const limitRaw = url.searchParams.get("limit");
  let limit: number = RANKING_CONFIG.DEFAULT_LIMIT;
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw) || Number(limitRaw) === 0) {
      return { error: errorResponse("INVALID_PARAM", `limit must be a positive integer, got "${limitRaw}"`, 400) };
    }
    limit = Number(limitRaw);
  }

  const orderRaw = url.searchParams.get("order");
  let order: "asc" | "desc" = RANKING_CONFIG.DEFAULT_ORDER;
  if (orderRaw !== null) {
    if (orderRaw !== "asc" && orderRaw !== "desc") {
      return { error: errorResponse("INVALID_PARAM", `order must be "asc" or "desc", got "${orderRaw}"`, 400) };
    }
    order = orderRaw;
  }

  const tickerRaw = url.searchParams.get("ticker");
  let ticker: string | null = null;
  if (tickerRaw !== null) {
    const trimmed = tickerRaw.trim();
    if (trimmed.length === 0) {
      return { error: errorResponse("INVALID_PARAM", `ticker must not be empty`, 400) };
    }
    ticker = trimmed;
  }

  return { params: { active, minQuarters, limit, order, ticker } };
}

/** True for pg/network errors indicating Postgres is unreachable, as
 *  opposed to a genuine application bug (§4: 503 DB_UNAVAILABLE vs
 *  500 INTERNAL — "renamed from v1's misleading UPSTREAM_UNAVAILABLE,
 *  this path has no upstream"). */
function isDbUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | undefined)?.code;
  return (
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect|timeout/i.test(message) ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT"
  );
}

interface ResultEntry {
  ticker: string;
  company_name: string | null;
  is_active: boolean;
  rank_score: number | null;
  beat_streak: number;
  streak_is_capped: boolean;
  confidence: "high" | "medium" | "low" | null;
  eps_surprise_avg: number | null;
  revenue_surprise_avg: number | null;
  quarters_available: number;
  latest: {
    fiscal_year: number;
    fiscal_quarter: number;
    fiscal_date_ending: string | null;
    /** NULL for quarters backfilled solely from /stock/earnings (no
     *  announcement date on that endpoint). */
    report_date: string | null;
    report_hour: "bmo" | "amc" | "dmh" | null;
    reported_eps: number | null;
    estimated_eps: number | null;
    eps_surprise_percent: number | null;
    reported_revenue: number | null;
    estimated_revenue: number | null;
    revenue_surprise_percent: number | null;
    pulled_at: string;
  } | null;
  quarters: {
    fiscal_year: number;
    fiscal_quarter: number;
    eps_surprise_percent: number | null;
    revenue_surprise_percent: number | null;
  }[];
}

function buildResultEntry(data: TickerData): ResultEntry {
  const asSurprises: QuarterSurprise[] = data.quarters.map((q) => ({
    fiscalYear: q.fiscalYear,
    fiscalQuarter: q.fiscalQuarter,
    epsSurprisePercent: q.epsSurprisePercent,
    revenueSurprisePercent: q.revenueSurprisePercent,
  }));
  const metrics = computeTickerMetrics(asSurprises);

  // Invariant guard (§4): beat_streak must never exceed quarters_available.
  // Structurally true given computeBeatStreak walks the same array whose
  // length is quartersAvailable, but assert it explicitly rather than hope.
  if (metrics.beatStreak > metrics.quartersAvailable) {
    throw new Error(
      `invariant violated for ${data.watchlist.ticker}: beat_streak (${metrics.beatStreak}) > quarters_available (${metrics.quartersAvailable})`,
    );
  }

  const latestRow = data.quarters[0] ?? null;

  return {
    ticker: data.watchlist.ticker,
    company_name: data.watchlist.companyName,
    is_active: data.watchlist.isActive,
    rank_score: metrics.rankScore === null ? null : round2(metrics.rankScore),
    beat_streak: metrics.beatStreak,
    streak_is_capped: metrics.streakIsCapped,
    confidence: metrics.confidence,
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
      : null,
    // Full cached history, newest-first (not capped to the trailing
    // window used internally for averages/composite) — quarters[0] is
    // `latest` expanded, and quarters_available is meant to be
    // verifiable against this array's length, not silently truncated.
    quarters: data.quarters.map((q) => ({
      fiscal_year: q.fiscalYear,
      fiscal_quarter: q.fiscalQuarter,
      eps_surprise_percent: q.epsSurprisePercent,
      revenue_surprise_percent: q.revenueSurprisePercent,
    })),
  };
}

/** Leaderboard order (§3.3): rank_score desc/asc with nulls ALWAYS
 *  last regardless of `order`, then beat_streak desc, then
 *  eps_surprise_avg desc (nulls last), then ticker asc. */
function compareResults(a: ResultEntry, b: ResultEntry, order: "asc" | "desc"): number {
  if (a.rank_score === null && b.rank_score !== null) return 1;
  if (a.rank_score !== null && b.rank_score === null) return -1;
  if (a.rank_score !== null && b.rank_score !== null && a.rank_score !== b.rank_score) {
    return order === "desc" ? b.rank_score - a.rank_score : a.rank_score - b.rank_score;
  }

  if (a.beat_streak !== b.beat_streak) return b.beat_streak - a.beat_streak;

  if (a.eps_surprise_avg === null && b.eps_surprise_avg !== null) return 1;
  if (a.eps_surprise_avg !== null && b.eps_surprise_avg === null) return -1;
  if (a.eps_surprise_avg !== null && b.eps_surprise_avg !== null && a.eps_surprise_avg !== b.eps_surprise_avg) {
    return b.eps_surprise_avg - a.eps_surprise_avg;
  }

  return a.ticker.localeCompare(b.ticker);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseParams(url);
  if ("error" in parsed) return parsed.error;
  const { active, minQuarters, limit, order, ticker } = parsed.params;

  let dataRows: TickerData[];
  let dataAsOf: string | null;
  try {
    const pool = await createPool();
    dataRows = await loadLeaderboardData(pool, { activeOnly: active, ticker: ticker ?? undefined });
    // Degrades to null internally if pipeline_runs (migration 014)
    // doesn't exist yet; genuine connection failures still propagate
    // to the catch below and become 503, not a silently-null field.
    dataAsOf = await getDataAsOf(pool);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isDbUnavailable(err)) {
      return errorResponse("DB_UNAVAILABLE", message, 503);
    }
    return errorResponse("INTERNAL", message, 500);
  }

  if (ticker !== null && dataRows.length === 0) {
    return errorResponse("TICKER_NOT_FOUND", `"${ticker}" is not in the watchlist`, 404);
  }

  try {
    let results = dataRows.map(buildResultEntry);

    // Single-ticker detail view (§4 "ticker: single-ticker detail
    // view"): bypass active/min_quarters filtering — a direct lookup
    // of one ticker's own row, not a filtered list membership check.
    if (ticker === null) {
      results = results.filter((r) => r.quarters_available >= minQuarters);
    }

    results.sort((a, b) => compareResults(a, b, order));

    if (ticker === null) {
      results = results.slice(0, limit);
    }

    const body = {
      generated_at: new Date().toISOString(),
      data_as_of: dataAsOf,
      count: results.length,
      params: {
        active,
        min_quarters: minQuarters,
        limit,
        order,
        ...(ticker !== null ? { ticker } : {}),
      },
      results,
    };

    return Response.json(body, {
      headers: { "Cache-Control": RANKING_CONFIG.CACHE_CONTROL },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse("INTERNAL", message, 500);
  }
}
