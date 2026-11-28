/* ────────────────────────────────────────────────────────────────
   Public track record, part 2 (roadmap #11): score each logged
   signal 1, 3 and 6 months after it fired, by the market move it
   implies (signal_log rows come from signalLog.ts).

   The call each state makes:
     us-macro-quadrant  S&P 500 (^GSPC), using the regime map in
                        macro/vams.ts: Goldilocks/Reflation up,
                        Inflation/Deflation down
     macro-weather      S&P 500: Sunny/Partly cloudy up, Rain/Storm
                        down (a storm watch doesn't change the call)
     au-pulse           AUD/USD (AUDUSD=X): growth up → up, growth
                        down → down, mixed → no call. ASX 200 isn't
                        licensed yet (#22); the Aussie dollar is the
                        cyclical cross the codebase already uses.

   Rules, fixed so the record can't be tuned after the fact:
     · entry  first daily close on or after the day it fired (the
              macro cron runs at 07:15 UTC, before the US open, so
              that close comes after the call was on record)
     · due    fired_on + 1, 3 or 6 calendar months
     · exit   last close on or before the due date, scored only once
              the bars reach the due date
     · hit    the close moved in the called direction (a flat close
              is a miss); every call runs its full horizon even if
              the signal changed in the meantime
   Scoring only adds horizons that are missing from `outcomes`:
   a score, once written, is never recomputed.
──────────────────────────────────────────────────────────────── */
import { REGIME_AFFINITY } from "../macro/vams";
import { dateOnly, type Queryable } from "../storage/db";
import { loadBars } from "../storage/bullRepo";

export const HORIZONS = [
  { key: "1m", months: 1 },
  { key: "3m", months: 3 },
  { key: "6m", months: 6 },
] as const;
export type HorizonKey = (typeof HORIZONS)[number]["key"];

export type Direction = "up" | "down";

export interface Call { symbol: string; benchmark: string; direction: Direction | null }

export interface Bar { date: string; close: number }

export type Outcome =
  | { noCall: true; scoredOn: string }
  | {
    symbol: string; direction: Direction; due: string; scoredOn: string;
    entry: { date: string; close: number }; exit: { date: string; close: number };
    return: number; hit: boolean;
  };

export interface LogRow {
  id: number; signal: string; firedOn: string; state: string; previousState: string | null;
  label: string; outcomes: Partial<Record<HorizonKey, Outcome>>;
}

export const SIGNALS: Record<string, { name: string; symbol: string; benchmark: string }> = {
  "us-macro-quadrant": { name: "US economic regime", symbol: "^GSPC", benchmark: "S&P 500" },
  "macro-weather": { name: "Macro weather", symbol: "^GSPC", benchmark: "S&P 500" },
  "au-pulse": { name: "Australia Pulse", symbol: "AUDUSD=X", benchmark: "AUD/USD" },
};

/** The market call a logged state makes, or null for a signal we don't score. */
export function callFor(signal: string, state: string): Call | null {
  const meta = SIGNALS[signal];
  if (!meta) return null;
  let direction: Direction | null = null;
  if (signal === "us-macro-quadrant") {
    const map = REGIME_AFFINITY[meta.symbol];
    const has = (list: readonly string[]) => list.includes(state);
    direction = has(map.bullish) ? "up" : has(map.bearish) ? "down" : null;
  } else if (signal === "macro-weather") {
    const reading = state.replace(/\+WATCH$/, "");
    direction = reading === "SUNNY" || reading === "PARTLY_CLOUDY" ? "up" : reading === "RAIN" || reading === "STORM" ? "down" : null;
  } else if (signal === "au-pulse") {
    const growth = state.split("/")[0];
    direction = growth === "up" ? "up" : growth === "down" ? "down" : null;
  }
  return { symbol: meta.symbol, benchmark: meta.benchmark, direction };
}

/** Calendar months later, clamped to the month's last day (31 Jan + 1m = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * Scores one call at one horizon. Returns null while it can't be scored yet:
 * not due, or the bars haven't reached the due date. `bars` are oldest first.
 */
export function scoreCall(firedOn: string, call: Call, months: number, bars: readonly Bar[], today: string): Outcome | null {
  const due = addMonths(firedOn, months);
  if (today < due) return null;
  if (call.direction === null) return { noCall: true, scoredOn: today };
  if (bars.length === 0 || bars[bars.length - 1].date < due) return null;
  const entry = bars.find((b) => b.date >= firedOn);
  let exit: Bar | undefined;
  for (const b of bars) { if (b.date <= due) exit = b; else break; }
  if (!entry || !exit || exit.date <= entry.date || !(entry.close > 0)) return null;
  const ret = exit.close / entry.close - 1;
  return {
    symbol: call.symbol, direction: call.direction, due, scoredOn: today,
    entry: { date: entry.date, close: entry.close }, exit: { date: exit.date, close: exit.close },
    return: Number(ret.toFixed(6)), hit: call.direction === "up" ? ret > 0 : ret < 0,
  };
}

/** The horizons a row still needs, scored where possible. Never touches existing ones. */
export function newOutcomes(row: LogRow, bars: readonly Bar[], today: string): Partial<Record<HorizonKey, Outcome>> {
  const call = callFor(row.signal, row.state);
  const out: Partial<Record<HorizonKey, Outcome>> = {};
  if (!call) return out;
  for (const h of HORIZONS) {
    if (row.outcomes[h.key]) continue;
    const o = scoreCall(row.firedOn, call, h.months, bars, today);
    if (o) out[h.key] = o;
  }
  return out;
}

export interface HitRate { horizon: HorizonKey; scored: number; hits: number; rate: number | null; avgReturn: number | null }

/** Hit rate per horizon over the calls scored so far (no-call states are left out). */
export function hitRates(rows: readonly LogRow[]): HitRate[] {
  return HORIZONS.map(({ key }) => {
    const scored = rows.map((r) => r.outcomes[key]).filter((o): o is Extract<Outcome, { hit: boolean }> => !!o && !("noCall" in o));
    const hits = scored.filter((o) => o.hit).length;
    const signed = scored.map((o) => (o.direction === "up" ? o.return : -o.return));
    return {
      horizon: key, scored: scored.length, hits,
      rate: scored.length ? hits / scored.length : null,
      avgReturn: signed.length ? signed.reduce((a, b) => a + b, 0) / signed.length : null,
    };
  });
}

/** Every logged call, newest first. */
export async function getSignalLog(db: Queryable): Promise<LogRow[]> {
  const res = await db.query(
    `select id, signal, fired_on, state, previous_state, label, outcomes from signal_log order by fired_on desc, signal asc`);
  return res.rows.map((r) => ({
    id: Number(r.id), signal: String(r.signal), firedOn: dateOnly(r.fired_on), state: String(r.state),
    previousState: r.previous_state == null ? null : String(r.previous_state), label: String(r.label),
    outcomes: (r.outcomes && typeof r.outcomes === "object" ? r.outcomes : {}) as LogRow["outcomes"],
  }));
}

export interface ScoreResult { scored: number; rows: number; errors: string[] }

/** Adds any horizons now due. Bars are loaded once per symbol. Never throws. */
export async function scoreSignalLog(db: Queryable, opts: { now?: Date } = {}): Promise<ScoreResult> {
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const result: ScoreResult = { scored: 0, rows: 0, errors: [] };
  let rows: LogRow[];
  try { rows = await getSignalLog(db); } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }
  const pending = rows.filter((r) => SIGNALS[r.signal] && HORIZONS.some((h) => !r.outcomes[h.key] && addMonths(r.firedOn, h.months) <= today));
  const bars = new Map<string, Bar[]>();
  for (const row of pending) {
    try {
      const symbol = SIGNALS[row.signal].symbol;
      if (!bars.has(symbol)) bars.set(symbol, (await loadBars(db, symbol, "adj")).map((b) => ({ date: b.date, close: b.close })));
      const add = newOutcomes(row, bars.get(symbol)!, today);
      const n = Object.keys(add).length;
      if (!n) continue;
      // jsonb || only adds keys; the "not already there" filter keeps old scores untouched.
      await db.query(`update signal_log set outcomes = $2::jsonb || outcomes where id = $1`, [row.id, JSON.stringify(add)]);
      result.scored += n;
      result.rows += 1;
    } catch (e) {
      result.errors.push(`${row.signal} ${row.firedOn}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
