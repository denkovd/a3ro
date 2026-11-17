/* ────────────────────────────────────────────────────────────────
   Asset profiles — provider adapters (Finnhub + CoinGecko).

   The only module that speaks these providers' wire formats for the
   asset drawer. Fetchers are thin; parsers are exported pure functions
   so fixture tests run without a network (tests/assetProfiles.test.ts).

   Units: Finnhub reports marketCapitalization and shareOutstanding in
   MILLIONS — converted to plain units here, once. Every missing or
   non-finite value becomes null, never 0.

   Finnhub free tier: 60 req/min (no daily cap). CoinGecko public API:
   no key needed; set COINGECKO_API_KEY (a free "Demo" key) for a
   higher, steadier rate limit. CoinGecko's free terms ask for
   attribution — the drawer shows "Data: CoinGecko" on crypto details.
──────────────────────────────────────────────────────────────── */

import { getJsonForSource } from "../sources/http";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const text = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;
const isoDate = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const d = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};
const millions = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n * 1_000_000;
};
const httpsUrl = (v: unknown): string | null => {
  const s = text(v, 500);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/* ── symbol notation ──────────────────────────────────────────── */

/** Scan (Yahoo) notation → Finnhub/Earnings-Beat notation: BRK-B → BRK.B. */
export function toFinnhubSymbol(yahoo: string): string {
  return yahoo.replace(/-/g, ".");
}

function finnhubKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY is not set (see backend/.env.example)");
  return key;
}

/* ── Finnhub /stock/profile2 ──────────────────────────────────── */

export interface CompanyProfile {
  name: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  industry: string | null;
  ipoDate: string | null;
  website: string | null;
  logoUrl: string | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
}

/** null when the payload carries nothing usable (Finnhub returns {} for unknown / most ETFs). */
export function parseFinnhubProfile(raw: unknown): CompanyProfile | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const p: CompanyProfile = {
    name: text(o.name),
    exchange: text(o.exchange),
    country: text(o.country, 8),
    currency: text(o.currency, 8),
    industry: text(o.finnhubIndustry),
    ipoDate: isoDate(o.ipo),
    website: httpsUrl(o.weburl),
    logoUrl: httpsUrl(o.logo),
    sharesOutstanding: millions(o.shareOutstanding),
    marketCap: millions(o.marketCapitalization),
  };
  return Object.values(p).some((v) => v !== null) ? p : null;
}

export async function fetchFinnhubProfile(symbol: string): Promise<{ profile: CompanyProfile | null; raw: unknown }> {
  const url = `${FINNHUB_BASE}/stock/profile2?${new URLSearchParams({ symbol, token: finnhubKey() })}`;
  const raw = await getJsonForSource<unknown>("finnhub-profile", url);
  return { profile: parseFinnhubProfile(raw), raw };
}

/* ── Finnhub /stock/metric?metric=all ─────────────────────────── */

export interface CompanyMetrics {
  week52High: number | null;
  week52Low: number | null;
  peTtm: number | null;
  beta: number | null;
  dividendYieldPct: number | null;
}

export function parseFinnhubMetrics(raw: unknown): CompanyMetrics | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const m = (o.metric ?? {}) as Record<string, unknown>;
  const out: CompanyMetrics = {
    week52High: num(m["52WeekHigh"]),
    week52Low: num(m["52WeekLow"]),
    peTtm: num(m.peTTM) ?? num(m.peBasicExclExtraTTM) ?? num(m.peExclExtraTTM),
    beta: num(m.beta),
    dividendYieldPct: num(m.currentDividendYieldTTM) ?? num(m.dividendYieldIndicatedAnnual),
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}

export async function fetchFinnhubMetrics(symbol: string): Promise<{ metrics: CompanyMetrics | null; raw: unknown }> {
  const url = `${FINNHUB_BASE}/stock/metric?${new URLSearchParams({ symbol, metric: "all", token: finnhubKey() })}`;
  const raw = await getJsonForSource<unknown>("finnhub-metric", url);
  // Keep only the fields we use in `raw` — the full metric payload is ~100 keys.
  const m = ((raw ?? {}) as Record<string, unknown>).metric as Record<string, unknown> | undefined;
  const kept = m
    ? Object.fromEntries(
        ["52WeekHigh", "52WeekLow", "peTTM", "peBasicExclExtraTTM", "peExclExtraTTM", "beta",
          "currentDividendYieldTTM", "dividendYieldIndicatedAnnual"]
          .filter((k) => k in m).map((k) => [k, m[k]]),
      )
    : null;
  return { metrics: parseFinnhubMetrics(raw), raw: kept };
}

/* ── earnings quarters (from fetchStockEarnings rows) ─────────── */

export interface EarningsQuarter {
  period: string;
  year: number;
  quarter: number;
  actual: number | null;
  estimate: number | null;
  surprisePct: number | null;
}

/** Newest first, de-duplicated by (year, quarter), at most `limit`. */
export function toEarningsQuarters(
  rows: { period: string; year: number; quarter: number; actual: number | null; estimate: number | null; surprisePercent: number | null }[],
  limit = 8,
): EarningsQuarter[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
    .filter((r) => {
      const k = `${r.year}Q${r.quarter}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit)
    .map((r) => ({
      period: r.period, year: r.year, quarter: r.quarter,
      actual: r.actual, estimate: r.estimate, surprisePct: r.surprisePercent,
    }));
}

/* ── next earnings date (whole-market /calendar/earnings) ─────── */

/** Earliest upcoming report per symbol (Finnhub notation) on/after `today`. */
export function nextEarningsBySymbol(
  rows: { symbol: string; date: string; hour: string | null }[],
  today: string,
): Map<string, { date: string; hour: string | null }> {
  const out = new Map<string, { date: string; hour: string | null }>();
  for (const r of rows) {
    if (r.date < today) continue;
    const cur = out.get(r.symbol);
    if (!cur || r.date < cur.date) out.set(r.symbol, { date: r.date, hour: r.hour });
  }
  return out;
}

/* ── CoinGecko /coins/markets ─────────────────────────────────── */

export interface CoinMarket {
  id: string;
  name: string | null;
  marketCap: number | null;
  marketCapRank: number | null;
  volume24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePct: number | null;
  imageUrl: string | null;
}

export function parseCoinGeckoMarkets(raw: unknown): CoinMarket[] {
  if (!Array.isArray(raw)) return [];
  const out: CoinMarket[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = text(o.id, 100);
    if (!id) continue;
    out.push({
      id,
      name: text(o.name),
      marketCap: num(o.market_cap),
      marketCapRank: num(o.market_cap_rank),
      volume24h: num(o.total_volume),
      circulatingSupply: num(o.circulating_supply),
      totalSupply: num(o.total_supply),
      maxSupply: num(o.max_supply),
      ath: num(o.ath),
      athDate: isoDate(o.ath_date),
      athChangePct: num(o.ath_change_percentage),
      imageUrl: httpsUrl(o.image),
    });
  }
  return out;
}

/** One call per 250 ids (the page cap). */
export async function fetchCoinGeckoMarkets(ids: string[]): Promise<CoinMarket[]> {
  const key = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers["x-cg-demo-api-key"] = key;
  const out: CoinMarket[] = [];
  for (let i = 0; i < ids.length; i += 250) {
    const params = new URLSearchParams({
      vs_currency: "usd", ids: ids.slice(i, i + 250).join(","), per_page: "250", page: "1",
    });
    const raw = await getJsonForSource<unknown>("coingecko", `${COINGECKO_BASE}/coins/markets?${params}`, {
      headers,
      classifyHttpError: (status) => (status === 429 ? "rate_limited" : status >= 500 ? "upstream_error" : undefined),
    });
    out.push(...parseCoinGeckoMarkets(raw));
  }
  return out;
}
