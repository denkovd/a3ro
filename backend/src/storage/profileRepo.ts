/* ────────────────────────────────────────────────────────────────
   Repository for asset_profiles (migration 023) — the asset drawer's
   company / coin details. Writes come only from the GitHub Actions
   refresh (profiles/pipeline.ts); the API route only reads.
──────────────────────────────────────────────────────────────── */

import type { CoinMarket, CompanyMetrics, CompanyProfile, EarningsQuarter } from "../profiles/sources";
import { Queryable } from "./db";

export interface AssetProfileRow {
  symbol: string;
  provider: "finnhub" | "coingecko";
  providerId: string;
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
  week52High: number | null;
  week52Low: number | null;
  peTtm: number | null;
  beta: number | null;
  dividendYieldPct: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  volume24h: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePct: number | null;
  marketCapRank: number | null;
  earnings: EarningsQuarter[];
  nextEarningsDate: string | null;
  nextEarningsHour: string | null;
  fetchedAt: string;
  earningsFetchedAt: string | null;
}

/** Weekly equity/ETF refresh. Profile + metric fields mirror the
 *  provider (a field it stopped reporting becomes null); earnings are
 *  kept from the previous fetch when this one failed (null passed). */
export async function upsertEquityProfile(
  db: Queryable,
  symbol: string,
  providerId: string,
  profile: CompanyProfile | null,
  metrics: CompanyMetrics | null,
  earnings: EarningsQuarter[] | null,
  raw: unknown,
): Promise<void> {
  const p = profile;
  const m = metrics;
  await db.query(
    `insert into asset_profiles
       (symbol, provider, provider_id, name, exchange, country, currency, industry,
        ipo_date, website, logo_url, shares_outstanding, market_cap,
        week52_high, week52_low, pe_ttm, beta, dividend_yield_pct,
        earnings, earnings_fetched_at, fetched_at, raw)
     values ($1,'finnhub',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
             $18::jsonb, case when $18::jsonb is null then null else now() end, now(), $19::jsonb)
     on conflict (symbol) do update set
       provider = 'finnhub', provider_id = excluded.provider_id,
       name = excluded.name, exchange = excluded.exchange, country = excluded.country,
       currency = excluded.currency, industry = excluded.industry, ipo_date = excluded.ipo_date,
       website = excluded.website, logo_url = excluded.logo_url,
       shares_outstanding = excluded.shares_outstanding, market_cap = excluded.market_cap,
       week52_high = excluded.week52_high, week52_low = excluded.week52_low,
       pe_ttm = excluded.pe_ttm, beta = excluded.beta, dividend_yield_pct = excluded.dividend_yield_pct,
       earnings = coalesce(excluded.earnings, asset_profiles.earnings),
       earnings_fetched_at = coalesce(excluded.earnings_fetched_at, asset_profiles.earnings_fetched_at),
       fetched_at = now(), raw = excluded.raw`,
    [
      symbol, providerId,
      p?.name ?? null, p?.exchange ?? null, p?.country ?? null, p?.currency ?? null, p?.industry ?? null,
      p?.ipoDate ?? null, p?.website ?? null, p?.logoUrl ?? null, p?.sharesOutstanding ?? null, p?.marketCap ?? null,
      m?.week52High ?? null, m?.week52Low ?? null, m?.peTtm ?? null, m?.beta ?? null, m?.dividendYieldPct ?? null,
      earnings === null ? null : JSON.stringify(earnings),
      JSON.stringify(raw ?? null),
    ],
  );
}

/** Daily crypto refresh from CoinGecko /coins/markets. */
export async function upsertCryptoProfile(db: Queryable, symbol: string, c: CoinMarket): Promise<void> {
  await db.query(
    `insert into asset_profiles
       (symbol, provider, provider_id, name, logo_url, market_cap, market_cap_rank, volume_24h,
        circulating_supply, total_supply, max_supply, ath, ath_date, ath_change_pct, fetched_at, raw)
     values ($1,'coingecko',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), $14::jsonb)
     on conflict (symbol) do update set
       provider = 'coingecko', provider_id = excluded.provider_id, name = excluded.name,
       logo_url = excluded.logo_url, market_cap = excluded.market_cap,
       market_cap_rank = excluded.market_cap_rank, volume_24h = excluded.volume_24h,
       circulating_supply = excluded.circulating_supply, total_supply = excluded.total_supply,
       max_supply = excluded.max_supply, ath = excluded.ath, ath_date = excluded.ath_date,
       ath_change_pct = excluded.ath_change_pct, fetched_at = now(), raw = excluded.raw`,
    [
      symbol, c.id, c.name, c.imageUrl, c.marketCap, c.marketCapRank, c.volume24h,
      c.circulatingSupply, c.totalSupply, c.maxSupply, c.ath, c.athDate, c.athChangePct,
      JSON.stringify(c),
    ],
  );
}

/** Daily: write the next report date for equities (keyed by scan
 *  symbol) and clear dates that have passed without a new one. */
export async function setNextEarnings(
  db: Queryable,
  next: Map<string, { date: string; hour: string | null }>,
): Promise<number> {
  let written = 0;
  for (const [symbol, n] of next) {
    const res = await db.query(
      `update asset_profiles set next_earnings_date = $2, next_earnings_hour = $3
        where symbol = $1 and provider = 'finnhub'`,
      [symbol, n.date, n.hour],
    );
    written += res.rowCount ?? 0;
  }
  await db.query(
    `update asset_profiles set next_earnings_date = null, next_earnings_hour = null
      where provider = 'finnhub' and next_earnings_date < current_date`,
  );
  return written;
}

const toDate = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const toIso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);
const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function getAssetProfile(db: Queryable, symbol: string): Promise<AssetProfileRow | null> {
  const res = await db.query(`select * from asset_profiles where symbol = $1`, [symbol]);
  const r = res.rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    symbol: String(r.symbol),
    provider: r.provider === "coingecko" ? "coingecko" : "finnhub",
    providerId: String(r.provider_id),
    name: (r.name as string | null) ?? null,
    exchange: (r.exchange as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    currency: (r.currency as string | null) ?? null,
    industry: (r.industry as string | null) ?? null,
    ipoDate: toDate(r.ipo_date),
    website: (r.website as string | null) ?? null,
    logoUrl: (r.logo_url as string | null) ?? null,
    sharesOutstanding: toNum(r.shares_outstanding),
    marketCap: toNum(r.market_cap),
    week52High: toNum(r.week52_high),
    week52Low: toNum(r.week52_low),
    peTtm: toNum(r.pe_ttm),
    beta: toNum(r.beta),
    dividendYieldPct: toNum(r.dividend_yield_pct),
    circulatingSupply: toNum(r.circulating_supply),
    totalSupply: toNum(r.total_supply),
    maxSupply: toNum(r.max_supply),
    volume24h: toNum(r.volume_24h),
    ath: toNum(r.ath),
    athDate: toDate(r.ath_date),
    athChangePct: toNum(r.ath_change_pct),
    marketCapRank: toNum(r.market_cap_rank),
    earnings: Array.isArray(r.earnings) ? (r.earnings as EarningsQuarter[]) : [],
    nextEarningsDate: toDate(r.next_earnings_date),
    nextEarningsHour: (r.next_earnings_hour as string | null) ?? null,
    fetchedAt: toIso(r.fetched_at) ?? "",
    earningsFetchedAt: toIso(r.earnings_fetched_at),
  };
}
