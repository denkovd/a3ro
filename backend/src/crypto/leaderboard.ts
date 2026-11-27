/* ────────────────────────────────────────────────────────────────
   Crypto valuation leaderboard (roadmap #124) and the apps on each
   chain, from DefiLlama's free API.

   Leaderboard (Premium: market caps are market data, #18): every
   protocol DefiLlama tracks with a token, grouped by token (Uniswap
   V2, V3 and V4 count as Uniswap), ranked by market cap against a
   year of fees, or a year of revenue. Fees and revenue are the last
   30 days × 365/30. Small or token-less protocols are left out so
   the list isn't topped by noise:
     · fees ≥ US$1M over 30 days and market cap ≥ US$100M
     · revenue ranking also needs revenue ≥ US$100k over 30 days
   Our tracked chains (from the main snapshot) join the list too.

   Stablecoin issuers (Tether, Circle) are left out of both: their
   'fees' are interest on reserves and they have no token.

   Chain apps (open data): the protocols earning the most fees on
   Solana and on Bitcoin, from DefiLlama's per-chain fee breakdown.
──────────────────────────────────────────────────────────────── */
import { LLAMA, type Fetcher, type ProjectSnapshot } from "./defillama";
import { CRYPTO_PROJECTS } from "./projects";

export const LEADER_MIN_FEES_30D = 1_000_000;
export const LEADER_MIN_MCAP = 100_000_000;
export const LEADER_MIN_REVENUE_30D = 100_000;
const KEEP = 40;
const YEAR = 365 / 30;
/** Issuers earn interest on reserves, not fees for a service, and have no token. */
const SKIP_CATEGORIES = new Set(["Stablecoin Issuer"]);

export interface LeaderRow {
  key: string; name: string; symbol: string | null; category: string | null; chain: boolean;
  mcap: number; fees30d: number; revenue30d: number | null;
  priceToFees: number; priceToRevenue: number | null;
}
export interface ChainApp { key: string; name: string; category: string | null; fees30d: number; revenue30d: number | null }

type Rec = Record<string, unknown>;
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const protocolsOf = (list: unknown): Rec[] => arr((list as Rec | null)?.protocols);
const idOf = (e: Rec) => str(e.defillamaId) ?? str(e.id);
const groupKey = (e: Rec) => str(e.parentProtocol) ?? `p:${idOf(e) ?? str(e.slug) ?? str(e.name)}`;

interface Group { key: string; name: string; category: string | null; topFees: number; fees30d: number; revenue30d: number | null; children: Rec[] }

/** Fees and revenue per token group (protocols only; chains are handled separately). */
export function groupFees(feesList: unknown, revenueList: unknown, chainKey?: string): Map<string, Group> {
  const rev = new Map<string, number>();
  for (const e of protocolsOf(revenueList)) {
    const id = idOf(e); if (!id) continue;
    const v = chainKey ? chainTotal(e, chainKey) : num(e.total30d);
    if (v !== null) rev.set(id, v);
  }
  const groups = new Map<string, Group>();
  for (const e of protocolsOf(feesList)) {
    if (e.protocolType === "chain" || SKIP_CATEGORIES.has(String(e.category))) continue;
    const fees = chainKey ? chainTotal(e, chainKey) : num(e.total30d);
    if (fees === null || fees <= 0) continue;
    const k = groupKey(e);
    const g = groups.get(k) ?? { key: k, name: str(e.displayName) ?? str(e.name) ?? k, category: null, topFees: -1, fees30d: 0, revenue30d: null, children: [] };
    g.fees30d += fees;
    const r = rev.get(idOf(e) ?? "");
    if (r !== undefined) g.revenue30d = (g.revenue30d ?? 0) + r;
    if (fees > g.topFees) { g.topFees = fees; g.category = str(e.category); }
    g.children.push(e);
    groups.set(k, g);
  }
  return groups;
}

/** A protocol's 30-day fees on one chain, from DefiLlama's breakdown30d ({ chain: { sub: value } }). */
export function chainTotal(e: Rec, chainKey: string): number | null {
  const b = (e.breakdown30d as Rec | undefined)?.[chainKey];
  if (!b || typeof b !== "object") return null;
  const vals = Object.values(b as Rec).map(num).filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, c) => a + c, 0) : null;
}

/** Market caps and symbols: parent protocols (lite/protocols2) and single protocols (/protocols). */
export function marketCaps(protocols: unknown, lite: unknown): Map<string, { mcap: number; symbol: string | null; name: string; gecko: string | null }> {
  const out = new Map<string, { mcap: number; symbol: string | null; name: string; gecko: string | null }>();
  for (const p of arr((lite as Rec | null)?.parentProtocols)) {
    const id = str(p.id), mcap = num(p.mcap);
    if (id && mcap && mcap > 0) out.set(id, { mcap, symbol: str(p.symbol), name: str(p.name) ?? id, gecko: str(p.gecko_id) });
  }
  for (const p of arr(protocols)) {
    const id = str(p.id), mcap = num(p.mcap);
    if (id && mcap && mcap > 0 && !p.parentProtocol) out.set(`p:${id}`, { mcap, symbol: str(p.symbol), name: str(p.name) ?? id, gecko: str(p.gecko_id) });
  }
  return out;
}

export function buildLeaderboard(feesList: unknown, revenueList: unknown, protocols: unknown, lite: unknown, tracked: ProjectSnapshot[] = []): LeaderRow[] {
  const caps = marketCaps(protocols, lite);
  const rows: LeaderRow[] = [];
  const seenGecko = new Set<string>();
  for (const g of groupFees(feesList, revenueList).values()) {
    const cap = caps.get(g.key);
    if (!cap || cap.mcap < LEADER_MIN_MCAP || g.fees30d < LEADER_MIN_FEES_30D) continue;
    if (cap.gecko) seenGecko.add(cap.gecko);
    const revOk = g.revenue30d !== null && g.revenue30d >= LEADER_MIN_REVENUE_30D;
    rows.push({
      key: g.key, name: cap.name, symbol: cap.symbol, category: g.category, chain: false,
      mcap: cap.mcap, fees30d: g.fees30d, revenue30d: g.revenue30d,
      priceToFees: cap.mcap / (g.fees30d * YEAR),
      priceToRevenue: revOk ? cap.mcap / (g.revenue30d! * YEAR) : null,
    });
  }
  for (const s of tracked) {
    const def = CRYPTO_PROJECTS.find((p) => p.id === s.id);
    if (!def?.chain || !s.mcap || s.fees30d === null || s.mcap < LEADER_MIN_MCAP || s.fees30d < LEADER_MIN_FEES_30D) continue;
    if (def.gecko && seenGecko.has(def.gecko)) continue;
    const revOk = s.revenue30d !== null && s.revenue30d >= LEADER_MIN_REVENUE_30D;
    rows.push({
      key: `chain:${s.id}`, name: def.name, symbol: def.symbol, category: "Chain", chain: true,
      mcap: s.mcap, fees30d: s.fees30d, revenue30d: s.revenue30d,
      priceToFees: s.mcap / (s.fees30d * YEAR), priceToRevenue: revOk ? s.mcap / (s.revenue30d! * YEAR) : null,
    });
  }
  const byPf = [...rows].sort((a, b) => a.priceToFees - b.priceToFees).slice(0, KEEP);
  const byPr = rows.filter((r) => r.priceToRevenue !== null).sort((a, b) => a.priceToRevenue! - b.priceToRevenue!).slice(0, KEEP);
  const keep = new Map([...byPf, ...byPr].map((r) => [r.key, r]));
  return [...keep.values()].sort((a, b) => a.priceToFees - b.priceToFees);
}

/** The apps earning the most fees on one chain (DefiLlama chain key, e.g. "solana"). */
export function chainApps(feesList: unknown, revenueList: unknown, chainKey: string, limit = 10): ChainApp[] {
  return [...groupFees(feesList, revenueList, chainKey).values()]
    .sort((a, b) => b.fees30d - a.fees30d).slice(0, limit)
    .map((g) => ({ key: g.key, name: g.children.length > 1 && g.key.startsWith("parent#") ? parentName(g) : g.name, category: g.category, fees30d: g.fees30d, revenue30d: g.revenue30d }));
}
const parentName = (g: Group) => {
  // "parent#jupiter" → the shortest child name is usually the brand ("Jupiter Aggregator" vs "Jupiter Perpetual Exchange").
  const words = g.children.map((c) => (str(c.displayName) ?? str(c.name) ?? "").split(" ")[0]);
  return words.every((w) => w === words[0]) && words[0] ? words[0] : g.name;
};

export async function fetchLeaderboardInputs(get: Fetcher): Promise<{ revenueList: unknown; protocols: unknown; lite: unknown; problems: string[] }> {
  const problems: string[] = [];
  const safe = async (label: string, url: string) => { try { return await get(url); } catch (e) { problems.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); return null; } };
  const revenueList = await safe("revenue list", `${LLAMA}/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue`);
  const protocols = await safe("protocols", `${LLAMA}/protocols`);
  const lite = await safe("parent protocols", `${LLAMA}/lite/protocols2?b=2`);
  return { revenueList, protocols, lite, problems };
}
