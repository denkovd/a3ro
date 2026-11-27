/* ────────────────────────────────────────────────────────────────
   "What's flipped" for the weekly newsletter (Premium edition).

   Trend Finder, Money Line, Double Confirmed (strategy ml-dw): an asset
   flips bullish when daily and weekly both turn bullish, bearish when
   both turn bearish. Same universe as the platform.

     pattern  the week's flips grouped by asset class, with the biggest
              single-day wave: the headline of the section
     tables   the last 10 bullish and last 10 bearish flips, each with
              price at flip, % since, vs the S&P 500 and current status.
              A flip stays in the table after it fails (no survivorship).

   Ties on one scan date: macro tier first, then the biggest move since.
──────────────────────────────────────────────────────────────── */
import type { BullTransitionRow } from "../storage/bullRepo";
import { closeBefore, daysBetween, minusDays, pct, rawClose, type Closes, type Roll } from "./marketData";

export const BENCHMARK = "SPY";
export const FLIP_TABLE_SIZE = 10;
export const PATTERN_DAYS = 7;

export interface SnapshotLite { symbol: string; displayName: string; tier: string; assetClass: string; verdict: string }

export interface FlipRow {
  symbol: string; name: string; tier: string; assetClass: string;
  direction: "BULLISH" | "BEARISH";
  scanDate: string; flipDate: string | null; priceAtFlip: number | null;
  days: number | null; sincePct: number | null; vsBenchmark: number | null;
  status: string; isNew: boolean;
}

export interface FlipPattern {
  fromDate: string; toDate: string;
  bullish: number; bearish: number;
  byClass: { assetClass: string; bullish: number; bearish: number }[];
  biggestWave: { date: string; direction: "BULLISH" | "BEARISH"; count: number } | null;
  bullishNames: string[]; bearishNames: string[];
  summary: string;
}

export interface FlipsSection { pattern: FlipPattern; bullish: FlipRow[]; bearish: FlipRow[]; asOf: string | null; track?: TrackRecord | null }

const CLASS_LABEL: Record<string, string> = {
  equity: "stocks", etf: "ETFs", crypto: "crypto", index: "indices", fx: "currencies", rates: "bonds",
  metals: "metals", energy: "energy", ags: "agriculture",
};
export const classLabel = (c: string) => CLASS_LABEL[c] ?? c;

export const STATUS_LABEL: Record<string, string> = {
  BULLISH: "Bullish", BEARISH: "Bearish", CONFLICT_DAILY: "Conflicted (daily)", CONFLICT_WEEKLY: "Conflicted (weekly)", NEUTRAL: "Neutral",
};
export const statusLabel = (v: string | null | undefined) => (v ? STATUS_LABEL[v] ?? v : "—");

/** Real flips only: a verdict change into Bullish or Bearish (first appearances have no fromVerdict). */
export function realFlips(transitions: BullTransitionRow[]): BullTransitionRow[] {
  return transitions.filter((t) => t.fromVerdict != null && (t.toVerdict === "BULLISH" || t.toVerdict === "BEARISH") && t.fromVerdict !== t.toVerdict);
}

export function buildFlipRows(
  transitions: BullTransitionRow[],
  direction: "BULLISH" | "BEARISH",
  snapshots: Map<string, SnapshotLite>,
  closes: Map<string, Closes>,
  rolls: Map<string, Roll[]>,
  opts: { newSince: string; size?: number },
): FlipRow[] {
  const bench = closes.get(BENCHMARK) ?? [];
  const benchLast = bench[bench.length - 1];
  const rows = realFlips(transitions).filter((t) => t.toVerdict === direction).map((t): FlipRow => {
    const c = closes.get(t.symbol) ?? [];
    const last = c[c.length - 1];
    const at = closeBefore(c, t.runDate);
    const r = rolls.get(t.symbol);
    const atRaw = at ? rawClose(at.close, at.date, r) : null;
    const lastRaw = last ? rawClose(last.close, last.date, r) : null;
    const since = atRaw !== null && lastRaw !== null ? pct(lastRaw, atRaw) : null;
    const b0 = closeBefore(bench, t.runDate);
    const benchPct = b0 && benchLast ? pct(benchLast.close, b0.close) : null;
    const snap = snapshots.get(t.symbol);
    return {
      symbol: t.symbol, name: snap?.displayName ?? t.displayName, tier: t.tier, assetClass: snap?.assetClass ?? "",
      direction, scanDate: t.runDate, flipDate: at?.date ?? null, priceAtFlip: atRaw,
      days: at && last ? daysBetween(at.date, last.date) : null,
      sincePct: since, vsBenchmark: since !== null && benchPct !== null && t.symbol !== BENCHMARK ? Math.round((since - benchPct) * 10) / 10 : null,
      status: snap?.verdict ?? "—", isNew: t.runDate >= opts.newSince,
    };
  });
  rows.sort((a, b) => (a.scanDate !== b.scanDate ? (a.scanDate < b.scanDate ? 1 : -1)
    : (a.tier === "macro") !== (b.tier === "macro") ? (a.tier === "macro" ? -1 : 1)
    : Math.abs(b.sincePct ?? 0) - Math.abs(a.sincePct ?? 0)));
  return rows.slice(0, opts.size ?? FLIP_TABLE_SIZE);
}

export function flipPattern(transitions: BullTransitionRow[], snapshots: Map<string, SnapshotLite>, toDate: string, days = PATTERN_DAYS): FlipPattern {
  const fromDate = minusDays(toDate, days - 1);
  const week = realFlips(transitions).filter((t) => t.runDate >= fromDate && t.runDate <= toDate);
  const cls = (s: string) => snapshots.get(s)?.assetClass || "other";
  const byClassMap = new Map<string, { bullish: number; bearish: number }>();
  const perDay = new Map<string, number>();
  for (const t of week) {
    const k = cls(t.symbol);
    const e = byClassMap.get(k) ?? { bullish: 0, bearish: 0 };
    if (t.toVerdict === "BULLISH") e.bullish += 1; else e.bearish += 1;
    byClassMap.set(k, e);
    const dk = `${t.runDate}|${t.toVerdict}`;
    perDay.set(dk, (perDay.get(dk) ?? 0) + 1);
  }
  const byClass = [...byClassMap.entries()].map(([assetClass, v]) => ({ assetClass, ...v }))
    .sort((a, b) => b.bullish + b.bearish - (a.bullish + a.bearish));
  let biggestWave: FlipPattern["biggestWave"] = null;
  for (const [k, count] of perDay) {
    const [date, direction] = k.split("|") as [string, "BULLISH" | "BEARISH"];
    if (!biggestWave || count > biggestWave.count) biggestWave = { date, direction, count };
  }
  const bullishNames = week.filter((t) => t.toVerdict === "BULLISH").map((t) => snapshots.get(t.symbol)?.displayName ?? t.displayName);
  const bearishNames = week.filter((t) => t.toVerdict === "BEARISH").map((t) => snapshots.get(t.symbol)?.displayName ?? t.displayName);
  const bullish = bullishNames.length, bearish = bearishNames.length;
  const lead = (dir: "bullish" | "bearish") => {
    const top = [...byClass].filter((c) => c[dir] > 0).sort((a, b) => b[dir] - a[dir]).slice(0, 2).map((c) => `${classLabel(c.assetClass)} (${c[dir]})`);
    return top.length ? top.join(" and ") : "none";
  };
  const tilt = bullish === bearish ? "an even split" : bullish > bearish ? "a bullish tilt" : "a bearish tilt";
  const summary = bullish + bearish === 0
    ? "No assets flipped Double Confirmed this week."
    : `${bullish} bullish and ${bearish} bearish flips this week, ${tilt}. Bullish led by ${lead("bullish")}; bearish led by ${lead("bearish")}.`
      + (biggestWave && biggestWave.count >= 5 ? ` Biggest wave: ${biggestWave.count} ${biggestWave.direction.toLowerCase()} flips on the ${biggestWave.date} scan.` : "");
  return { fromDate, toDate, bullish, bearish, byClass, biggestWave, bullishNames, bearishNames, summary };
}

export interface TrackRecordSide { count: number; hits: number; avg: number | null; avgVsBench: number | null; best: { name: string; pct: number } | null; worst: { name: string; pct: number } | null }
export interface TrackRecord { fromDate: string; toDate: string; asOf: string | null; bullish: TrackRecordSide; bearish: TrackRecordSide }

/** How the flips from 5 to 1 weeks before the scan have done since. A bullish flip "works" when it is up, a bearish one when it is down. */
export function trackRecord(rows: FlipRow[], runDate: string, asOf: string | null): TrackRecord {
  const fromDate = minusDays(runDate, 35), toDate = minusDays(runDate, 7);
  const side = (dir: "BULLISH" | "BEARISH"): TrackRecordSide => {
    const r = rows.filter((x) => x.direction === dir && x.scanDate >= fromDate && x.scanDate <= toDate && x.sincePct !== null);
    const vals = r.map((x) => x.sincePct as number);
    const vs = r.map((x) => x.vsBenchmark).filter((v): v is number => v !== null);
    const avg = (a: number[]) => (a.length ? Math.round((a.reduce((t, v) => t + v, 0) / a.length) * 10) / 10 : null);
    const sorted = [...r].sort((a, b) => (b.sincePct as number) - (a.sincePct as number));
    const good = dir === "BULLISH" ? sorted : [...sorted].reverse();
    const pickRow = (x?: FlipRow) => (x ? { name: x.name, pct: x.sincePct as number } : null);
    return { count: r.length, hits: vals.filter((v) => (dir === "BULLISH" ? v > 0 : v < 0)).length, avg: avg(vals), avgVsBench: avg(vs), best: pickRow(good[0]), worst: pickRow(good[good.length - 1]) };
  };
  return { fromDate, toDate, asOf, bullish: side("BULLISH"), bearish: side("BEARISH") };
}
