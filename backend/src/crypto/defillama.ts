/* ────────────────────────────────────────────────────────────────
   Crypto fundamentals (roadmap #82): DefiLlama's free API → one
   daily snapshot for the scorecard. No key; open data.

   Calls (api.llama.fi, stablecoins.llama.fi):
     /v2/chains                       TVL per chain, now
     /v2/historicalChainTvl[/{chain}] TVL history, all DeFi and per chain
     /stablecoinchains                stablecoins held per chain, now
     /stablecoincharts/{chain}        stablecoins held, history
     /overview/fees (fees, revenue)   find each project's slug
     /summary/fees/{slug}             daily fees / revenue history

   Fees and revenue for the last 30 days are summed from the daily
   history, so they do not depend on summary fields that the API may
   rename. Anything that can't be matched or fetched is listed in
   `problems` and shown as missing, never guessed.
──────────────────────────────────────────────────────────────── */
import { CRYPTO_PROJECTS, type CryptoProject } from "./projects";

export const LLAMA = "https://api.llama.fi";
export const STABLES = "https://stablecoins.llama.fi";

export interface MonthPoint { month: string; value: number }
export interface ProjectSnapshot {
  id: string;
  feesName: string | null;
  feesSlug: string | null;
  fees30d: number | null;
  revenue30d: number | null;
  feesMonthly: MonthPoint[];
  revenueMonthly: MonthPoint[];
  tvl: number | null;
  tvlShare: number | null;
  tvlShareMonthly: MonthPoint[];
  stablecoins: number | null;
  stablecoinShare: number | null;
  stablecoinsMonthly: MonthPoint[];
  /** Market data (CoinGecko, Premium only, #18): market cap, fully diluted value, and the ratios. */
  mcap: number | null;
  fdv: number | null;
  /** Market cap ÷ fees (or revenue) over the last 30 days, at a yearly pace. */
  priceToFees: number | null;
  priceToRevenue: number | null;
  /** Month-end market cap ÷ that month's fees (or revenue) × 12, complete months. */
  priceToFeesMonthly: MonthPoint[];
  priceToRevenueMonthly: MonthPoint[];
}
export interface CryptoSnapshot {
  asOf: string;
  generatedAt: string;
  totals: {
    defiTvl: number | null; stablecoins: number | null; defiTvlMonthly: MonthPoint[];
    /** All stablecoins (DefiLlama): month-end supply and the supply 30 and 365 days before the latest day. */
    stablecoinsMonthly: MonthPoint[]; stablecoins30dAgo: number | null; stablecoins365dAgo: number | null;
    /** Total crypto market cap (CoinGecko, Premium only). */
    cryptoMcap: number | null;
  };
  projects: ProjectSnapshot[];
  problems: string[];
  /** Premium (market data): Solana top 10 and memecoin top 5 baskets (#85, #86). */
  baskets?: import("./baskets").BasketSnapshot[];
  /** Privacy top 10 (#87): GitHub commit activity per project id. Open data. */
  privacyDev?: Record<string, import("./privacy").PrivacyDev>;
}

type Json = unknown;
export type Fetcher = (url: string) => Promise<Json>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
/** Stablecoin amounts come as a number or as {peggedUSD, peggedEUR, ...}: add the parts. */
export const usdAmount = (v: unknown): number | null => {
  const n = num(v);
  if (n !== null) return n;
  if (v && typeof v === "object") {
    const parts = Object.values(v as Record<string, unknown>).map(num).filter((x): x is number => x !== null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }
  return null;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const monthOf = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 7);

/** Daily [time, value] pairs from DefiLlama's chart formats: [[t, v]] or [{date, ...}]. */
export function dailyPoints(chart: unknown, pick: (row: Record<string, unknown>) => unknown = (r) => r.tvl): { t: number; v: number }[] {
  if (!Array.isArray(chart)) return [];
  const out: { t: number; v: number }[] = [];
  for (const row of chart) {
    if (Array.isArray(row)) {
      const t = num(row[0]), v = usdAmount(row[1]);
      if (t !== null && v !== null) out.push({ t, v });
    } else if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      const t = num(r.date), v = usdAmount(pick(r));
      if (t !== null && v !== null) out.push({ t, v });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Sum of the last `days` daily values ending at the latest point; null when the series is short. */
export function lastDaysSum(points: { t: number; v: number }[], days: number): number | null {
  if (points.length === 0) return null;
  const end = points[points.length - 1].t;
  const from = end - (days - 1) * 86_400;
  const window = points.filter((p) => p.t >= from);
  return window.length >= Math.min(days, 20) ? window.reduce((a, p) => a + p.v, 0) : null;
}

/** Monthly totals (sum) or month-end levels (last) for the last `months` complete-or-current months. */
export function monthly(points: { t: number; v: number }[], how: "sum" | "last", months = 13): MonthPoint[] {
  const map = new Map<string, number>();
  for (const p of points) {
    const m = monthOf(p.t);
    map.set(m, how === "sum" ? (map.get(m) ?? 0) + p.v : p.v);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([month, value]) => ({ month, value }));
}

/** First fees-list entry whose name (or display name) matches one of the project's names, in order. */
export function matchFeesEntry(project: Pick<CryptoProject, "fees">, entries: Record<string, unknown>[]): { name: string; slug: string } | null {
  for (const wanted of project.fees) {
    const w = norm(wanted);
    const hit = entries.find((e) => [e.name, e.displayName].some((n) => typeof n === "string" && norm(n) === w));
    if (hit) {
      const slug = typeof hit.slug === "string" && hit.slug ? hit.slug : typeof hit.name === "string" ? hit.name.toLowerCase().replace(/\s+/g, "-") : null;
      if (slug) return { name: String(hit.name), slug };
    }
  }
  return null;
}

const protocolsOf = (body: Json): Record<string, unknown>[] =>
  body && typeof body === "object" && Array.isArray((body as { protocols?: unknown }).protocols) ? (body as { protocols: Record<string, unknown>[] }).protocols : [];

export interface Inputs {
  chains: Json;
  stableChains: Json;
  feesList: Json;
  defiTvlHistory: Json;
  chainTvlHistory: Record<string, Json>;
  stableHistory: Record<string, Json>;
  feesHistory: Record<string, Json>;
  revenueHistory: Record<string, Json>;
  /** /stablecoincharts/all */
  stablecoinsAll?: Json;
  /** CoinGecko (market data): /coins/markets, /global, and /coins/{id}/market_chart per id. */
  markets?: Json;
  global?: Json;
  mcapCharts?: Record<string, Json>;
}

/** The value `days` before the latest point (nearest earlier point), or null. */
export function valueDaysAgo(points: { t: number; v: number }[], days: number): number | null {
  if (!points.length) return null;
  const target = points[points.length - 1].t - days * 86_400;
  let hit: { t: number; v: number } | null = null;
  for (const p of points) if (p.t <= target) hit = p;
  return hit && target - hit.t < 10 * 86_400 ? hit.v : null;
}

/** Ratio of a month-end level to a month's flow × 12, over months present in both (complete months only). */
export function monthlyRatio(levels: MonthPoint[], flows: MonthPoint[], beforeMonth: string): MonthPoint[] {
  const flow = new Map(flows.map((m) => [m.month, m.value]));
  return levels.filter((m) => m.month < beforeMonth && (flow.get(m.month) ?? 0) > 0).map((m) => ({ month: m.month, value: m.value / (flow.get(m.month)! * 12) }));
}

/** CoinGecko market_chart: { market_caps: [[ms, v]] } → daily points in seconds. */
const mcapPoints = (chart: Json) => {
  const caps = chart && typeof chart === "object" ? (chart as { market_caps?: unknown }).market_caps : null;
  return dailyPoints(Array.isArray(caps) ? caps.map((r) => Array.isArray(r) ? [Number(r[0]) / 1000, r[1]] : r) : []);
};

/** Turns the raw API answers into the snapshot. Pure: tested on fixtures. */
export function buildSnapshot(inputs: Inputs, now = new Date(), projects = CRYPTO_PROJECTS, fetchProblems: string[] = []): CryptoSnapshot {
  const problems = [...fetchProblems];
  const chains = Array.isArray(inputs.chains) ? (inputs.chains as Record<string, unknown>[]) : [];
  const stableChains = Array.isArray(inputs.stableChains) ? (inputs.stableChains as Record<string, unknown>[]) : [];
  const defiTvl = chains.length ? chains.reduce((a, c) => a + (num(c.tvl) ?? 0), 0) : null;
  const stablesTotal = stableChains.length ? stableChains.reduce((a, c) => a + (usdAmount(c.totalCirculatingUSD) ?? 0), 0) : null;
  const defiMonthly = monthly(dailyPoints(inputs.defiTvlHistory), "last");
  const feesEntries = protocolsOf(inputs.feesList);
  const stableAll = dailyPoints(inputs.stablecoinsAll, (r) => r.totalCirculatingUSD ?? r.totalCirculating);
  const markets = Array.isArray(inputs.markets) ? (inputs.markets as Record<string, unknown>[]) : [];
  const globalData = inputs.global && typeof inputs.global === "object" ? (inputs.global as { data?: { total_market_cap?: Record<string, unknown> } }).data : undefined;
  const cryptoMcap = num(globalData?.total_market_cap?.usd);
  const thisMonth = now.toISOString().slice(0, 7);

  const out = projects.map((p): ProjectSnapshot => {
    const match = matchFeesEntry(p, feesEntries);
    if (!match) problems.push(`${p.name}: no match in DefiLlama's fees list for ${p.fees.join(" / ")}`);
    const feesPts = match ? dailyPoints((inputs.feesHistory[match.slug] as { totalDataChart?: unknown } | undefined)?.totalDataChart) : [];
    const revPts = match ? dailyPoints((inputs.revenueHistory[match.slug] as { totalDataChart?: unknown } | undefined)?.totalDataChart) : [];

    let tvl: number | null = null, tvlShare: number | null = null, stablecoins: number | null = null, stablecoinShare: number | null = null;
    let tvlShareMonthly: MonthPoint[] = [], stablecoinsMonthly: MonthPoint[] = [];
    if (p.chain) {
      const c = chains.find((x) => typeof x.name === "string" && norm(x.name) === norm(p.chain!));
      if (c) { tvl = num(c.tvl); tvlShare = tvl !== null && defiTvl ? tvl / defiTvl : null; }
      else if (chains.length) problems.push(`${p.name}: chain "${p.chain}" not in DefiLlama's chain list`);
      const s = stableChains.find((x) => typeof x.name === "string" && norm(x.name) === norm(p.chain!));
      if (s) { stablecoins = usdAmount(s.totalCirculatingUSD); stablecoinShare = stablecoins !== null && stablesTotal ? stablecoins / stablesTotal : null; }
      const chainMonthly = monthly(dailyPoints(inputs.chainTvlHistory[p.chain]), "last");
      const defiByMonth = new Map(defiMonthly.map((m) => [m.month, m.value]));
      tvlShareMonthly = chainMonthly.filter((m) => defiByMonth.get(m.month)).map((m) => ({ month: m.month, value: m.value / defiByMonth.get(m.month)! }));
      stablecoinsMonthly = monthly(dailyPoints(inputs.stableHistory[p.chain], (r) => r.totalCirculatingUSD ?? r.totalCirculating), "last");
    }
    const fees30d = lastDaysSum(feesPts, 30), revenue30d = lastDaysSum(revPts, 30);
    const feesMonthly = monthly(feesPts, "sum"), revenueMonthly = monthly(revPts, "sum");
    const mkt = p.gecko ? markets.find((m) => m.id === p.gecko) : undefined;
    const mcap = num(mkt?.market_cap), fdv = num(mkt?.fully_diluted_valuation);
    const mcapMonthly = p.gecko ? monthly(mcapPoints(inputs.mcapCharts?.[p.gecko]), "last") : [];
    const yearly = (v: number | null) => (v !== null && v > 0 ? (v * 365) / 30 : null);
    const ratio = (cap: number | null, flow: number | null) => (cap !== null && flow ? cap / flow : null);
    return {
      id: p.id, feesName: match?.name ?? null, feesSlug: match?.slug ?? null,
      fees30d, revenue30d, feesMonthly, revenueMonthly,
      tvl, tvlShare, tvlShareMonthly, stablecoins, stablecoinShare, stablecoinsMonthly,
      mcap, fdv,
      priceToFees: ratio(mcap, yearly(fees30d)), priceToRevenue: ratio(mcap, yearly(revenue30d)),
      priceToFeesMonthly: monthlyRatio(mcapMonthly, feesMonthly, thisMonth),
      priceToRevenueMonthly: monthlyRatio(mcapMonthly, revenueMonthly, thisMonth),
    };
  });

  return {
    asOf: now.toISOString().slice(0, 10), generatedAt: now.toISOString(),
    totals: {
      defiTvl, stablecoins: stablesTotal, defiTvlMonthly: defiMonthly,
      stablecoinsMonthly: monthly(stableAll, "last"), stablecoins30dAgo: valueDaysAgo(stableAll, 30), stablecoins365dAgo: valueDaysAgo(stableAll, 365),
      cryptoMcap,
    },
    projects: out, problems,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetches everything the snapshot needs, a little apart so DefiLlama's free tier isn't hammered. */
export async function fetchInputs(get: Fetcher, projects = CRYPTO_PROJECTS, spacingMs = 400): Promise<{ inputs: Inputs; problems: string[] }> {
  const problems: string[] = [];
  const safe = async (label: string, url: string): Promise<Json> => {
    try { const v = await get(url); await sleep(spacingMs); return v; }
    catch (e) { problems.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); return null; }
  };
  const chains = await safe("chains", `${LLAMA}/v2/chains`);
  const stableChains = await safe("stablecoin chains", `${STABLES}/stablecoinchains`);
  const feesList = await safe("fees list", `${LLAMA}/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyFees`);
  const defiTvlHistory = await safe("DeFi TVL history", `${LLAMA}/v2/historicalChainTvl`);
  const stablecoinsAll = await safe("stablecoin history", `${STABLES}/stablecoincharts/all`);
  const chainTvlHistory: Record<string, Json> = {}, stableHistory: Record<string, Json> = {};
  const feesHistory: Record<string, Json> = {}, revenueHistory: Record<string, Json> = {};
  const entries = protocolsOf(feesList);
  for (const p of projects) {
    if (p.chain) {
      chainTvlHistory[p.chain] = await safe(`${p.name} TVL history`, `${LLAMA}/v2/historicalChainTvl/${encodeURIComponent(p.chain)}`);
      // Only chains that hold stablecoins have a history (Bitcoin answers 404).
      const holds = Array.isArray(stableChains) && (stableChains as Record<string, unknown>[]).some((c) => typeof c.name === "string" && norm(c.name) === norm(p.chain!));
      if (holds) stableHistory[p.chain] = await safe(`${p.name} stablecoin history`, `${STABLES}/stablecoincharts/${encodeURIComponent(p.chain)}`);
    }
    const match = matchFeesEntry(p, entries);
    if (match) {
      feesHistory[match.slug] = await safe(`${p.name} fees`, `${LLAMA}/summary/fees/${encodeURIComponent(match.slug)}?dataType=dailyFees`);
      revenueHistory[match.slug] = await safe(`${p.name} revenue`, `${LLAMA}/summary/fees/${encodeURIComponent(match.slug)}?dataType=dailyRevenue`);
    }
  }
  return { inputs: { chains, stableChains, feesList, defiTvlHistory, chainTvlHistory, stableHistory, feesHistory, revenueHistory, stablecoinsAll }, problems };
}

/** Names in the fees list that look like a project's, for fixing a missed match from the job log. */
export function nearMatches(project: Pick<CryptoProject, "name" | "fees">, feesList: Json, limit = 6): string[] {
  const keys = [project.name, ...project.fees].map((s) => norm(s).slice(0, 5)).filter(Boolean);
  return protocolsOf(feesList).map((e) => String(e.name ?? "")).filter((n) => keys.some((k) => norm(n).includes(k))).slice(0, limit);
}
