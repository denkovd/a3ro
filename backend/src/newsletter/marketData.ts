/* ────────────────────────────────────────────────────────────────
   Market data reads for the Premium edition (Trend Finder flips and
   the YTD leaderboard). Market data (Yahoo), so Premium only (#18).

   Bars are the 'adj' series. Continuous futures (CL=F, BZ=F, GC=F)
   are back-adjusted additively (bull/rolls.ts), which shifts old
   LEVELS, so percentage changes on them are measured against the
   real traded price: raw = adj − Σ gaps of rolls after that date.
──────────────────────────────────────────────────────────────── */
import type { Queryable } from "../storage/db";

export type Closes = { date: string; close: number }[];
export interface Roll { rollDate: string; gap: number }

const day = (v: unknown) => (v instanceof Date
  ? `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`
  : String(v).slice(0, 10));

/** Adjusted closes since `since`, oldest first, for the given symbols (all symbols when null). */
export async function loadCloses(db: Queryable, symbols: string[] | null, since: string): Promise<Map<string, Closes>> {
  const res = symbols
    ? await db.query(`select symbol, date, close from market_bars where series = 'adj' and date >= $1 and symbol = any($2) order by symbol, date`, [since, symbols])
    : await db.query(`select symbol, date, close from market_bars where series = 'adj' and date >= $1 order by symbol, date`, [since]);
  const out = new Map<string, Closes>();
  for (const r of res.rows) {
    const s = String(r.symbol);
    const list = out.get(s) ?? [];
    list.push({ date: day(r.date), close: Number(r.close) });
    out.set(s, list);
  }
  return out;
}

/** Earliest stored bar per symbol: the history-length filter. */
export async function firstBarDates(db: Queryable): Promise<Map<string, string>> {
  const res = await db.query(`select symbol, min(date) as first from market_bars where series = 'adj' group by symbol`);
  return new Map(res.rows.map((r) => [String(r.symbol), day(r.first)]));
}

export async function loadRolls(db: Queryable, symbols: string[]): Promise<Map<string, Roll[]>> {
  if (!symbols.length) return new Map();
  const res = await db.query(`select symbol, roll_date, gap from futures_rolls where symbol = any($1) order by roll_date`, [symbols]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const out = new Map<string, Roll[]>();
  for (const r of res.rows) {
    const s = String(r.symbol);
    const list = out.get(s) ?? [];
    list.push({ rollDate: day(r.roll_date), gap: Number(r.gap) });
    out.set(s, list);
  }
  return out;
}

/** The as-traded price behind an adjusted close: adj minus every roll gap after that date. */
export function rawClose(adj: number, date: string, rolls: Roll[] | undefined): number {
  if (!rolls?.length) return adj;
  return adj - rolls.filter((r) => r.rollDate > date).reduce((s, r) => s + r.gap, 0);
}

/** The last close on or before `date`. */
export function closeOnOrBefore(closes: Closes, date: string): { date: string; close: number } | null {
  let hit: { date: string; close: number } | null = null;
  for (const c of closes) { if (c.date <= date) hit = c; else break; }
  return hit;
}

/** The last close strictly before `date` (a scan dated D scores the session before D). */
export function closeBefore(closes: Closes, date: string): { date: string; close: number } | null {
  let hit: { date: string; close: number } | null = null;
  for (const c of closes) { if (c.date < date) hit = c; else break; }
  return hit;
}

export const pct = (now: number, then: number): number | null =>
  Number.isFinite(now) && Number.isFinite(then) && then !== 0 ? Math.round(((now - then) / Math.abs(then)) * 1000) / 10 : null;

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const minusDays = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
