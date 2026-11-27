/* ────────────────────────────────────────────────────────────────
   Crypto baskets (roadmap #86 Solana high-beta, #85 memecoin index):
   the top 10 tokens of a CoinGecko category, as an equal-weight index
   measured against SOL and BTC. Market data (#18): Premium only.

   Equal weight, rebalanced daily: the index moves by the average daily
   log return of the members that have a price that day. Beta, correlation
   and R² come from OLS on daily log returns (basket on benchmark).
──────────────────────────────────────────────────────────────── */
import type { Fetcher } from "./defillama";
import { GECKO } from "./coingecko";

export interface BasketMember { id: string; symbol: string; name: string; mcap: number | null; return90d: number | null; betaToSol90d: number | null }
export interface BenchStats { beta: number | null; correlation: number | null; r2: number | null }
export interface BasketSnapshot {
  key: "solana" | "memes";
  label: string;
  members: BasketMember[];
  /** Index level, 100 at the start of the window, sampled weekly for the chart. */
  index: { t: number; v: number }[];
  returns: { basket: Record<"d30" | "d90" | "d365", number | null>; sol: Record<"d30" | "d90" | "d365", number | null>; btc: Record<"d30" | "d90" | "d365", number | null> };
  vsSol: { d90: BenchStats; d365: BenchStats };
  vsBtc: { d90: BenchStats; d365: BenchStats };
  maxDrawdown365d: number | null;
}

const DAY = 86_400;
const STABLE = new Set(["usdt", "usdc", "pyusd", "usds", "usde", "dai", "fdusd", "usd1", "eurc", "usdg", "tusd", "busd", "susd", "usdy"]);
const DERIVATIVE = new Set(["wsol", "jitosol", "msol", "bsol", "bnsol", "jupsol", "inf", "ssol", "hsol", "dsol", "vsol", "wbtc", "cbbtc", "weth", "tbtc", "zbtc"]);
/** Not a token in its own right: stablecoins, wrapped, bridged or staked versions, and the benchmark itself. */
export function isBasketCandidate(m: { id?: unknown; symbol?: unknown; name?: unknown }, exclude: string[]): boolean {
  const id = String(m.id ?? "").toLowerCase(), sym = String(m.symbol ?? "").toLowerCase(), name = String(m.name ?? "").toLowerCase();
  if (!id || exclude.includes(id) || STABLE.has(sym) || DERIVATIVE.has(sym)) return false;
  return !/(wrapped|bridged|staked|liquid staking|wormhole|\(portal\)|tokenized)/.test(name);
}

/** Daily closes keyed by UTC day from CoinGecko market_chart prices ([[ms, price]]). */
export function dailyCloses(chart: unknown): Map<number, number> {
  const prices = chart && typeof chart === "object" ? (chart as { prices?: unknown }).prices : null;
  const out = new Map<number, number>();
  if (!Array.isArray(prices)) return out;
  for (const row of prices) {
    if (!Array.isArray(row)) continue;
    const t = Math.floor(Number(row[0]) / 1000 / DAY) * DAY, v = Number(row[1]);
    if (Number.isFinite(t) && Number.isFinite(v) && v > 0) out.set(t, v);
  }
  return out;
}

/** Daily log returns keyed by day (day t = log(close t / close t-1)). */
export function logReturns(closes: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const [t, v] of closes) { const prev = closes.get(t - DAY); if (prev) out.set(t, Math.log(v / prev)); }
  return out;
}

/** OLS of y on x over the days both have, within the last `days` days ending at `end`. */
export function regress(y: Map<number, number>, x: Map<number, number>, end: number, days: number): BenchStats {
  const ys: number[] = [], xs: number[] = [];
  for (const [t, v] of y) if (t > end - days * DAY && t <= end && x.has(t)) { ys.push(v); xs.push(x.get(t)!); }
  const n = ys.length;
  if (n < Math.min(30, days / 2)) return { beta: null, correlation: null, r2: null };
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (sxx === 0 || syy === 0) return { beta: null, correlation: null, r2: null };
  const corr = sxy / Math.sqrt(sxx * syy);
  return { beta: sxy / sxx, correlation: corr, r2: corr * corr };
}

/** Equal-weight index: each day's return is the mean log return of members with a return that day. */
export function equalWeightReturns(members: Map<number, number>[]): Map<number, number> {
  const days = new Set<number>(); members.forEach((m) => m.forEach((_, t) => days.add(t)));
  const out = new Map<number, number>();
  for (const t of [...days].sort((a, b) => a - b)) {
    const rs = members.map((m) => m.get(t)).filter((v): v is number => v !== undefined);
    if (rs.length >= Math.min(3, members.length)) out.set(t, rs.reduce((a, b) => a + b, 0) / rs.length);
  }
  return out;
}

/** Total return over the last `days` days from daily log returns (null if too few days). */
export function periodReturn(r: Map<number, number>, end: number, days: number): number | null {
  let s = 0, n = 0;
  for (const [t, v] of r) if (t > end - days * DAY && t <= end) { s += v; n++; }
  return n >= days * 0.8 ? Math.exp(s) - 1 : null;
}

export function maxDrawdown(levels: number[]): number | null {
  if (levels.length < 2) return null;
  let peak = levels[0], worst = 0;
  for (const v of levels) { peak = Math.max(peak, v); worst = Math.min(worst, v / peak - 1); }
  return worst;
}

export function buildBasket(key: BasketSnapshot["key"], label: string, markets: unknown, charts: Record<string, unknown>, solChart: unknown, btcChart: unknown, exclude: string[], size = 10): BasketSnapshot | null {
  const list = (Array.isArray(markets) ? markets as Record<string, unknown>[] : [])
    .filter((m) => isBasketCandidate(m, exclude))
    .sort((a, b) => (Number(b.market_cap) || 0) - (Number(a.market_cap) || 0)).slice(0, size);
  const sol = logReturns(dailyCloses(solChart)), btc = logReturns(dailyCloses(btcChart));
  const end = Math.max(0, ...[...sol.keys()], ...[...btc.keys()]);
  const memberReturns = list.map((m) => logReturns(dailyCloses(charts[String(m.id)])));
  const usable = memberReturns.filter((r) => r.size > 20);
  if (!end || usable.length < 3) return null;
  const basket = equalWeightReturns(usable);
  const days = [...basket.keys()].filter((t) => t > end - 365 * DAY && t <= end).sort((a, b) => a - b);
  let level = 100; const levels: { t: number; v: number }[] = [];
  for (const t of days) { level *= Math.exp(basket.get(t)!); levels.push({ t, v: level }); }
  const ret = (r: Map<number, number>) => ({ d30: periodReturn(r, end, 30), d90: periodReturn(r, end, 90), d365: periodReturn(r, end, 365) });
  return {
    key, label,
    members: list.map((m, i) => ({
      id: String(m.id), symbol: String(m.symbol ?? "").toUpperCase(), name: String(m.name ?? m.id),
      mcap: Number.isFinite(Number(m.market_cap)) ? Number(m.market_cap) : null,
      return90d: periodReturn(memberReturns[i], end, 90), betaToSol90d: regress(memberReturns[i], sol, end, 90).beta,
    })),
    index: levels.filter((_, i) => i % 7 === 0 || i === levels.length - 1),
    returns: { basket: ret(basket), sol: ret(sol), btc: ret(btc) },
    vsSol: { d90: regress(basket, sol, end, 90), d365: regress(basket, sol, end, 365) },
    vsBtc: { d90: regress(basket, btc, end, 90), d365: regress(basket, btc, end, 365) },
    maxDrawdown365d: maxDrawdown(levels.map((l) => l.v)),
  };
}

export const BASKETS = [
  { key: "solana" as const, label: "Solana top 10", category: "solana-ecosystem", exclude: ["solana"] },
  { key: "memes" as const, label: "Memecoin top 10", category: "meme-token", exclude: [] as string[] },
];

/** Category lists and a year of daily prices per member. Spaced for CoinGecko's public limits. */
export async function fetchBasketInputs(get: Fetcher, spacingMs = 7000): Promise<{ markets: Record<string, unknown>; charts: Record<string, unknown>; problems: string[] }> {
  const problems: string[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const call = async (label: string, url: string): Promise<unknown> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const v = await get(url); await sleep(spacingMs); return v; }
      catch (e) { const msg = e instanceof Error ? e.message : String(e); if (attempt === 0 && /429/.test(msg)) { await sleep(60_000); continue; } problems.push(`${label}: ${msg}`); return null; }
    }
    return null;
  };
  const markets: Record<string, unknown> = {}, charts: Record<string, unknown> = {};
  for (const b of BASKETS) {
    markets[b.key] = await call(`${b.label} list`, `${GECKO}/coins/markets?vs_currency=usd&category=${b.category}&order=market_cap_desc&per_page=40&page=1`);
    const ids = (Array.isArray(markets[b.key]) ? markets[b.key] as Record<string, unknown>[] : [])
      .filter((m) => isBasketCandidate(m, b.exclude)).sort((a, c) => (Number(c.market_cap) || 0) - (Number(a.market_cap) || 0)).slice(0, 10).map((m) => String(m.id));
    for (const id of ids) if (!charts[id]) charts[id] = await call(`${id} prices`, `${GECKO}/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`);
  }
  return { markets, charts, problems };
}
