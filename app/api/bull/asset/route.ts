/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — one asset, every lens (asset drawer).
   GET /api/bull/asset?symbol=NVDA[&days=90]

   Returns the newest run's row for EACH strategy lens (both Money
   Line legs incl. flip levels — the scan always stores them) plus
   the symbol's verdict transitions across all lenses in the last
   ?days= (default 90, max 365). Read-only; writes happen in the
   GitHub Actions scan.

   Also returns `details` (company or coin fundamentals from
   asset_profiles, refreshed by profiles-refresh.yml) and `earnings`
   (Earnings-Beat cache when the ticker is tracked there — it carries
   revenue — else the profile's EPS history). Both are optional: if
   the profiles table isn't migrated yet or a symbol has no row, they
   come back null and the drawer simply omits those sections.

   The symbol is allow-listed against the scan universe BEFORE any
   database work, so nothing user-supplied reaches SQL unchecked.
──────────────────────────────────────────────────────────────── */

import {
  createDb,
  getAssetProfile,
  getCachedQuarters,
  getLatestBullSnapshotsForSymbol,
  getTransitionsForSymbol,
  isBullSymbol,
  STRATEGIES,
} from "@a3ro/oil-backend";
import { withErrorLog } from "../../_lib/errorLog";

type Db = Awaited<ReturnType<typeof createDb>>;
type Profile = NonNullable<Awaited<ReturnType<typeof getAssetProfile>>>;

/** Best-effort: details never break the drawer's core read. */
async function loadDetails(db: Db, symbol: string, lastClose: number | null, lastCloseDate: string | null) {
  let p: Profile | null = null;
  try {
    p = await getAssetProfile(db, symbol);
  } catch {
    return { details: null, earnings: null };
  }
  if (!p) return { details: null, earnings: null };

  // Equities: shares × latest scan close keeps market cap daily-fresh
  // on a weekly profile fetch. Crypto: CoinGecko's daily figure.
  const computedCap =
    p.provider === "finnhub" && p.sharesOutstanding !== null && lastClose !== null
      ? p.sharesOutstanding * lastClose
      : null;
  const details = {
    provider: p.provider,
    name: p.name,
    exchange: p.exchange,
    country: p.country,
    currency: p.currency,
    industry: p.industry,
    ipoDate: p.ipoDate,
    website: p.website,
    logoUrl: p.logoUrl,
    marketCap: computedCap ?? p.marketCap,
    marketCapAsOf: computedCap !== null ? lastCloseDate : p.fetchedAt.slice(0, 10),
    marketCapMethod: computedCap !== null ? "shares × last close" : "provider",
    sharesOutstanding: p.sharesOutstanding,
    week52High: p.week52High,
    week52Low: p.week52Low,
    peTtm: p.peTtm,
    beta: p.beta,
    dividendYieldPct: p.dividendYieldPct,
    circulatingSupply: p.circulatingSupply,
    totalSupply: p.totalSupply,
    maxSupply: p.maxSupply,
    volume24h: p.volume24h,
    ath: p.ath,
    athDate: p.athDate,
    athChangePct: p.athChangePct,
    marketCapRank: p.marketCapRank,
    nextEarningsDate: p.nextEarningsDate,
    nextEarningsHour: p.nextEarningsHour,
    fetchedAt: p.fetchedAt,
  };

  if (p.provider !== "finnhub") return { details, earnings: null };
  let quarters: {
    year: number; quarter: number; periodEnd: string | null; reportDate: string | null;
    epsActual: number | null; epsEstimate: number | null; epsSurprisePct: number | null;
    revenueActual: number | null; revenueEstimate: number | null; revenueSurprisePct: number | null;
  }[] = [];
  let source: "earnings-beat" | "finnhub" = "finnhub";
  try {
    const cached = await getCachedQuarters(db, p.providerId, 8);
    if (cached.length > 0) {
      source = "earnings-beat";
      quarters = cached.map((q) => ({
        year: q.fiscalYear, quarter: q.fiscalQuarter, periodEnd: q.fiscalDateEnding, reportDate: q.reportDate,
        epsActual: q.reportedEps, epsEstimate: q.estimatedEps, epsSurprisePct: q.epsSurprisePercent,
        revenueActual: q.reportedRevenue, revenueEstimate: q.estimatedRevenue, revenueSurprisePct: q.revenueSurprisePercent,
      }));
    }
  } catch {
    // Earnings-Beat cache unavailable — fall through to the profile's history.
  }
  if (quarters.length === 0) {
    quarters = p.earnings.map((q) => ({
      year: q.year, quarter: q.quarter, periodEnd: q.period, reportDate: null,
      epsActual: q.actual, epsEstimate: q.estimate, epsSurprisePct: q.surprisePct,
      revenueActual: null, revenueEstimate: null, revenueSurprisePct: null,
    }));
  }
  return {
    details,
    earnings: {
      source,
      fetchedAt: p.earningsFetchedAt,
      nextDate: p.nextEarningsDate,
      nextHour: p.nextEarningsHour,
      quarters,
    },
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLog("api:bull/asset", async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.trim() ?? "";
    if (!symbol) {
      return Response.json({ error: "symbol query param is required" }, { status: 400 });
    }
    if (!isBullSymbol(symbol)) {
      return Response.json({ error: "symbol is not in the scan universe" }, { status: 404 });
    }
    const raw = Number(url.searchParams.get("days") ?? "90");
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 365) : 90;

    const db = await createDb();
    const [lenses, transitions] = await Promise.all([
      getLatestBullSnapshotsForSymbol(db, symbol),
      getTransitionsForSymbol(db, symbol, days),
    ]);

    const base = lenses.find((l) => l.strategy === "ml-dw") ?? lenses[0] ?? null;
    const { details, earnings } = await loadDetails(
      db, symbol, base?.lastClose ?? null, base?.lastCloseDate ?? null,
    );

    return Response.json({
      symbol,
      runDate: lenses.length > 0 ? lenses[0].runDate : null,
      details,
      earnings,
      strategies: STRATEGIES.map(({ id, label, timeframe }) => ({ id, label, timeframe })),
      lenses,
      days,
      transitions,
    });
  } catch {
    return Response.json({ error: "Request could not be completed" }, { status: 500 });
  }
});
