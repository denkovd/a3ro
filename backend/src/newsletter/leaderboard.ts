/* ────────────────────────────────────────────────────────────────
   YTD leaderboard for the weekly newsletter (Premium edition).

   Top 15 ranked by YTD return: the Core 10 (always shown) plus the
   top 5 Universe Leaders, then the Worst 5 from the universe. Each row
   carries its Trend Finder status, last Double Confirmed flip date and
   % since that flip.

   Rules:
   · YTD from the last close on or before 31 Dec of the previous year.
   · Leaders and Worst 5 skip the Core 10 and their direct proxies,
     leveraged and inverse products, assets with under ~6 months of
     history, and any series with a one-day move of 4× up or −75% down
     (bad prints, token migrations, spin-offs) — listed as excluded.
   · Futures are measured on the as-traded price (marketData.rawClose).
   · Core assets with no licensed series yet (ASX 200, iron ore) show
     as "not in the universe yet".
──────────────────────────────────────────────────────────────── */
import { closeOnOrBefore, minusDays, pct, rawClose, type Closes, type Roll } from "./marketData";

export interface CoreAsset { key: string; label: string; symbol: string | null; note?: string }

export const CORE_10: readonly CoreAsset[] = [
  { key: "gold", label: "Gold (GLD)", symbol: "GLD", note: "Gold uses the GLD ETF: the futures series is roll-adjusted." },
  { key: "btc", label: "Bitcoin", symbol: "BTC-USD" },
  { key: "asx200", label: "ASX 200", symbol: null, note: "Not in the Trend Finder universe yet (ASX data licence, #22)." },
  { key: "spx", label: "S&P 500", symbol: "^GSPC" },
  { key: "brent", label: "Brent crude", symbol: "BZ=F" },
  { key: "ndx", label: "Nasdaq 100 (QQQ)", symbol: "QQQ" },
  { key: "aud", label: "AUD/USD", symbol: "AUDUSD=X" },
  { key: "ironore", label: "Iron ore", symbol: null, note: "No licensed iron ore price series yet." },
  { key: "copper", label: "Copper", symbol: "HG=F" },
  { key: "tlt", label: "US Treasuries 20Y+ (TLT)", symbol: "TLT" },
];

/** Direct proxies of a core asset, kept out of the leader and worst lists. */
export const CORE_PROXIES = new Set(["GC=F", "IAU", "SPY", "VOO", "IVV", "^NDX", "^IXIC", "CL=F", "BNO", "USO", "IBIT"]);

const LEVERAGED = /\b(2x|3x|ultra|inverse|short|bear)\b/i;
export const MAX_UP_JUMP = 4;
export const MAX_DOWN_JUMP = 0.25;
export const MIN_HISTORY_DAYS = 180;

export interface UniverseAsset {
  symbol: string; name: string; verdict: string; alignedSince: string | null; assetClass?: string;
  firstBar: string | null; closes: Closes; rolls?: Roll[];
}

export interface BoardRow {
  rank: number | null; key: string; label: string; type: "Core" | "Leader" | "Worst"; sector?: string;
  price: number | null; d1: number | null; w1: number | null; ytd: number | null;
  status: string | null; flipDate: string | null; sinceFlip: number | null; note?: string;
  /** Text sparkline of the last 13 weekly closes (▁…█), email-safe; null when history is short. */
  spark?: string | null;
}

const SPARK = "▁▂▃▄▅▆▇█";
/** Unicode sparkline of values (no images, so every mail client shows it). */
export function sparkline(values: number[]): string | null {
  if (values.length < 4) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  return values.map((v) => SPARK[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * 7)]).join("");
}

/** The last `weeks` + 1 weekly closes (as traded), oldest first. */
export function weeklyCloses(a: UniverseAsset, weeks = 13): number[] {
  const last = a.closes[a.closes.length - 1];
  if (!last) return [];
  const out: number[] = [];
  for (let k = weeks; k >= 0; k--) {
    const c = closeOnOrBefore(a.closes, minusDays(last.date, 7 * k));
    if (c) out.push(rawClose(c.close, c.date, a.rolls));
  }
  return out;
}

export interface Leaderboard { top: BoardRow[]; worst: BoardRow[]; excluded: { symbol: string; name: string; reason: string }[]; asOf: string | null; ytdBase: string }

export function yearEnd(asOf: string): string {
  return `${Number(asOf.slice(0, 4)) - 1}-12-31`;
}

/** Why a universe asset can't be a leader or in the worst 5, or null when it can. */
export function exclusionReason(a: UniverseAsset, ytdBase: string, asOf: string): string | null {
  if (LEVERAGED.test(a.name)) return "leveraged or inverse product";
  if (!a.firstBar || a.firstBar > minusDays(asOf, MIN_HISTORY_DAYS)) return "under 6 months of history";
  const since = a.closes.filter((c) => c.date >= ytdBase);
  for (let i = 1; i < since.length; i++) {
    const ratio = since[i].close / since[i - 1].close;
    if (ratio >= MAX_UP_JUMP || ratio <= MAX_DOWN_JUMP) return `one-day move of ${Math.round((ratio - 1) * 100)}% on ${since[i].date} (bad data or corporate action)`;
  }
  return null;
}

function row(a: UniverseAsset | null, base: { key: string; label: string; type: BoardRow["type"]; note?: string }, ytdBase: string): BoardRow {
  if (!a || !a.closes.length) return { rank: null, ...base, price: null, d1: null, w1: null, ytd: null, status: null, flipDate: null, sinceFlip: null };
  const raw = (c: { date: string; close: number }) => rawClose(c.close, c.date, a.rolls);
  const last = a.closes[a.closes.length - 1];
  const prev = a.closes[a.closes.length - 2];
  const wk = closeOnOrBefore(a.closes, minusDays(last.date, 7));
  const y0 = closeOnOrBefore(a.closes, ytdBase);
  const fl = a.alignedSince ? closeOnOrBefore(a.closes, a.alignedSince) : null;
  const aligned = a.verdict === "BULLISH" || a.verdict === "BEARISH";
  return {
    rank: null, ...base, price: raw(last),
    d1: prev ? pct(raw(last), raw(prev)) : null,
    w1: wk ? pct(raw(last), raw(wk)) : null,
    ytd: y0 ? pct(raw(last), raw(y0)) : null,
    status: a.verdict, flipDate: aligned ? a.alignedSince : null,
    sinceFlip: aligned && fl ? pct(raw(last), raw(fl)) : null,
    spark: sparkline(weeklyCloses(a)),
  };
}

/** The worst YTD per sector (asset class), worst first. One row per sector the universe tracks. */
export function worstPerSector(candidates: BoardRow[]): BoardRow[] {
  const bySector = new Map<string, BoardRow>();
  for (const r of candidates) {
    const k = r.sector || "other";
    const cur = bySector.get(k);
    if (!cur || (r.ytd ?? 0) < (cur.ytd ?? 0)) bySector.set(k, r);
  }
  return [...bySector.values()].sort((x, y) => (x.ytd ?? 0) - (y.ytd ?? 0)).map((r, i) => ({ ...r, type: "Worst" as const, rank: i + 1 }));
}

export function buildLeaderboard(universe: UniverseAsset[], asOf: string, opts: { leaders?: number } = {}): Leaderboard {
  const ytdBase = yearEnd(asOf);
  const bySymbol = new Map(universe.map((a) => [a.symbol, a]));
  const coreSymbols = new Set(CORE_10.map((c) => c.symbol).filter((s): s is string => !!s));
  const core = CORE_10.map((c) => row(c.symbol ? bySymbol.get(c.symbol) ?? null : null, { key: c.key, label: c.label, type: "Core", note: c.note }, ytdBase));

  const excluded: Leaderboard["excluded"] = [];
  const candidates: BoardRow[] = [];
  for (const a of universe) {
    if (coreSymbols.has(a.symbol) || CORE_PROXIES.has(a.symbol)) continue;
    const reason = exclusionReason(a, ytdBase, asOf);
    if (reason) { excluded.push({ symbol: a.symbol, name: a.name, reason }); continue; }
    const r = { ...row(a, { key: a.symbol, label: `${a.name} (${a.symbol})`, type: "Leader" }, ytdBase), sector: a.assetClass || "other" };
    if (r.ytd !== null) candidates.push(r);
  }
  candidates.sort((x, y) => (y.ytd ?? 0) - (x.ytd ?? 0));
  const leaders = candidates.slice(0, opts.leaders ?? 5);
  const worst = worstPerSector(candidates);

  const top = [...core, ...leaders].sort((x, y) => (x.ytd === null) !== (y.ytd === null) ? (x.ytd === null ? 1 : -1) : (y.ytd ?? 0) - (x.ytd ?? 0))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { top, worst, excluded, asOf, ytdBase };
}
