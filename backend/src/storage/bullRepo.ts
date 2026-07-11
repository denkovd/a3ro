/* ────────────────────────────────────────────────────────────────
   Repository layer for Module 5 (Bull Market Finder) — the only
   module writing SQL for market_bars, bull_snapshots,
   bull_transitions, futures_rolls, bull_source_health.
──────────────────────────────────────────────────────────────── */

import { RegimeBar } from "../regime/types";
import {
  AdapterHealthEntry,
  BullSnapshot,
  BullTransition,
  RollEvent,
} from "../bull/types";
import { Queryable } from "./db";

export type BarSeries = "raw" | "adj";

/* ── market_bars ──────────────────────────────────────────────── */

/** Multi-row upsert, chunked to stay under parameter limits. */
export async function upsertBars(
  db: Queryable,
  symbol: string,
  series: BarSeries,
  bars: RegimeBar[],
): Promise<number> {
  let written = 0;
  const CHUNK = 200;
  for (let i = 0; i < bars.length; i += CHUNK) {
    const chunk = bars.slice(i, i + CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((b, j) => {
      const base = j * 7;
      values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`);
      params.push(symbol, series, b.date, b.open, b.high, b.low, b.close);
    });
    const res = await db.query(
      `insert into market_bars (symbol, series, date, open, high, low, close)
       values ${values.join(",")}
       on conflict (symbol, series, date) do update set
         open = excluded.open, high = excluded.high,
         low = excluded.low, close = excluded.close,
         updated_at = now()`,
      params,
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

export async function loadBars(
  db: Queryable,
  symbol: string,
  series: BarSeries,
): Promise<RegimeBar[]> {
  const res = await db.query(
    `select date, open, high, low, close from market_bars
      where symbol = $1 and series = $2 order by date asc`,
    [symbol, series],
  );
  return res.rows.map((r) => ({
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
    open: Number(r.open), high: Number(r.high),
    low: Number(r.low), close: Number(r.close),
  }));
}

export async function latestBarDate(
  db: Queryable,
  symbol: string,
  series: BarSeries,
): Promise<string | null> {
  const res = await db.query(
    `select max(date) as d from market_bars where symbol = $1 and series = $2`,
    [symbol, series],
  );
  const d = res.rows[0]?.d;
  if (d == null) return null;
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

/** Additive back-shift of every 'adj' bar strictly before rollDate.
 *  Raw is never touched — that's the audit baseline. */
export async function shiftAdjBarsBefore(
  db: Queryable,
  symbol: string,
  rollDate: string,
  gap: number,
): Promise<number> {
  const res = await db.query(
    `update market_bars
        set open = open + $3, high = high + $3,
            low = low + $3, close = close + $3, updated_at = now()
      where symbol = $1 and series = 'adj' and date < $2`,
    [symbol, rollDate, gap],
  );
  return res.rowCount ?? 0;
}

/* ── futures_rolls ────────────────────────────────────────────── */

export async function insertRoll(db: Queryable, roll: RollEvent): Promise<void> {
  await db.query(
    `insert into futures_rolls (symbol, roll_date, old_contract, new_contract, gap, cum_adjustment)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (symbol, roll_date) do nothing`,
    [roll.symbol, roll.rollDate, roll.oldContract, roll.newContract, roll.gap, roll.cumAdjustment],
  );
}

export async function getRolls(db: Queryable, symbol: string): Promise<RollEvent[]> {
  const res = await db.query(
    `select * from futures_rolls where symbol = $1 order by roll_date asc`,
    [symbol],
  );
  return res.rows.map((r) => ({
    symbol: String(r.symbol),
    rollDate: r.roll_date instanceof Date
      ? r.roll_date.toISOString().slice(0, 10) : String(r.roll_date).slice(0, 10),
    oldContract: String(r.old_contract),
    newContract: String(r.new_contract),
    gap: Number(r.gap),
    cumAdjustment: Number(r.cum_adjustment),
  }));
}

/* ── bull_snapshots ───────────────────────────────────────────── */

export async function upsertBullSnapshots(
  db: Queryable,
  snapshots: BullSnapshot[],
): Promise<number> {
  let written = 0;
  for (const s of snapshots) {
    const res = await db.query(
      `insert into bull_snapshots
         (run_date, symbol, display_name, tier, asset_class, verdict, rank,
          newly_bullish, daily_trend, weekly_trend, daily_line, weekly_line,
          daily_flip_date, daily_flip_price, weekly_flip_date, weekly_flip_price,
          daily_since_flip_pct, weekly_since_flip_pct,
          daily_cushion_pct, weekly_cushion_pct,
          daily_bars_since_flip, weekly_bars_since_flip,
          aligned_since, days_since_aligned, strength,
          atr_pct, strength_vol, rs_63, adjusted,
          last_close, last_close_date, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31, now())
       on conflict (run_date, symbol) do update set
         display_name = excluded.display_name, tier = excluded.tier,
         asset_class = excluded.asset_class, verdict = excluded.verdict,
         rank = excluded.rank, newly_bullish = excluded.newly_bullish,
         daily_trend = excluded.daily_trend, weekly_trend = excluded.weekly_trend,
         daily_line = excluded.daily_line, weekly_line = excluded.weekly_line,
         daily_flip_date = excluded.daily_flip_date,
         daily_flip_price = excluded.daily_flip_price,
         weekly_flip_date = excluded.weekly_flip_date,
         weekly_flip_price = excluded.weekly_flip_price,
         daily_since_flip_pct = excluded.daily_since_flip_pct,
         weekly_since_flip_pct = excluded.weekly_since_flip_pct,
         daily_cushion_pct = excluded.daily_cushion_pct,
         weekly_cushion_pct = excluded.weekly_cushion_pct,
         daily_bars_since_flip = excluded.daily_bars_since_flip,
         weekly_bars_since_flip = excluded.weekly_bars_since_flip,
         aligned_since = excluded.aligned_since,
         days_since_aligned = excluded.days_since_aligned,
         strength = excluded.strength, atr_pct = excluded.atr_pct,
         strength_vol = excluded.strength_vol, rs_63 = excluded.rs_63,
         adjusted = excluded.adjusted, last_close = excluded.last_close,
         last_close_date = excluded.last_close_date, updated_at = now()`,
      [
        s.runDate, s.symbol, s.displayName, s.tier, s.assetClass, s.verdict, s.rank,
        s.newlyBullish, s.daily.trend, s.weekly.trend, s.daily.line, s.weekly.line,
        s.daily.lastFlipDate, s.daily.lastFlipPrice,
        s.weekly.lastFlipDate, s.weekly.lastFlipPrice,
        s.daily.sinceFlipPct, s.weekly.sinceFlipPct,
        s.daily.cushionPct, s.weekly.cushionPct,
        s.daily.barsSinceFlip, s.weekly.barsSinceFlip,
        s.alignedSince, s.daysSinceAligned, s.strength,
        s.atrPct, s.strengthVol, s.rs63, s.adjusted,
        s.lastClose, s.lastCloseDate,
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** Previous run's verdict per symbol (for transition diffs). */
export async function getPreviousVerdicts(
  db: Queryable,
  beforeRunDate: string,
): Promise<Map<string, string>> {
  const res = await db.query(
    `select symbol, verdict from bull_snapshots
      where run_date = (select max(run_date) from bull_snapshots where run_date < $1)`,
    [beforeRunDate],
  );
  return new Map(res.rows.map((r) => [String(r.symbol), String(r.verdict)]));
}

export async function insertTransitions(
  db: Queryable,
  transitions: BullTransition[],
): Promise<number> {
  let written = 0;
  for (const t of transitions) {
    const res = await db.query(
      `insert into bull_transitions (run_date, symbol, display_name, tier, from_verdict, to_verdict)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (run_date, symbol) do update set
         from_verdict = excluded.from_verdict, to_verdict = excluded.to_verdict`,
      [t.runDate, t.symbol, t.displayName, t.tier, t.fromVerdict, t.toVerdict],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/* ── bull_source_health ───────────────────────────────────────── */

export async function insertHealthEntries(
  db: Queryable,
  entries: AdapterHealthEntry[],
): Promise<void> {
  for (const h of entries) {
    await db.query(
      `insert into bull_source_health
         (run_date, symbol, adapter_used, fallback_reason, ok, latency_ms, error)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (run_date, symbol) do update set
         adapter_used = excluded.adapter_used,
         fallback_reason = excluded.fallback_reason,
         ok = excluded.ok, latency_ms = excluded.latency_ms,
         error = excluded.error`,
      [h.runDate, h.symbol, h.adapterUsed, h.fallbackReason, h.ok, h.latencyMs, h.error],
    );
  }
}

/* ── read models for the API ──────────────────────────────────── */

export interface BullSnapshotRow {
  runDate: string;
  symbol: string;
  displayName: string;
  tier: string;
  assetClass: string;
  verdict: string;
  rank: number;
  newlyBullish: boolean;
  dailyFlipDate: string | null;
  weeklyFlipDate: string | null;
  dailySinceFlipPct: number | null;
  dailyCushionPct: number | null;
  daysSinceAligned: number | null;
  alignedSince: string | null;
  strength: number | null;
  atrPct: number | null;
  strengthVol: number | null;
  rs63: number | null;
  adjusted: boolean;
  lastClose: number | null;
  lastCloseDate: string | null;
}

const toDateStr = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function getLatestBullSnapshots(
  db: Queryable,
  tier?: string,
): Promise<BullSnapshotRow[]> {
  const res = tier
    ? await db.query(
        `select * from bull_snapshots
          where run_date = (select max(run_date) from bull_snapshots) and tier = $1
          order by rank asc`,
        [tier],
      )
    : await db.query(
        `select * from bull_snapshots
          where run_date = (select max(run_date) from bull_snapshots)
          order by rank asc`,
      );
  return res.rows.map((r) => ({
    runDate: toDateStr(r.run_date)!,
    symbol: String(r.symbol),
    displayName: String(r.display_name),
    tier: String(r.tier),
    assetClass: String(r.asset_class),
    verdict: String(r.verdict),
    rank: Number(r.rank),
    newlyBullish: Boolean(r.newly_bullish),
    dailyFlipDate: toDateStr(r.daily_flip_date),
    weeklyFlipDate: toDateStr(r.weekly_flip_date),
    dailySinceFlipPct: toNum(r.daily_since_flip_pct),
    dailyCushionPct: toNum(r.daily_cushion_pct),
    daysSinceAligned: toNum(r.days_since_aligned),
    alignedSince: toDateStr(r.aligned_since),
    strength: toNum(r.strength),
    atrPct: toNum(r.atr_pct),
    strengthVol: toNum(r.strength_vol),
    rs63: toNum(r.rs_63),
    adjusted: Boolean(r.adjusted),
    lastClose: toNum(r.last_close),
    lastCloseDate: toDateStr(r.last_close_date),
  }));
}

export interface BullTransitionRow {
  runDate: string;
  symbol: string;
  displayName: string;
  tier: string;
  fromVerdict: string | null;
  toVerdict: string;
}

export async function getRecentTransitions(
  db: Queryable,
  days: number,
): Promise<BullTransitionRow[]> {
  const res = await db.query(
    `select * from bull_transitions
      where run_date >= (current_date - ($1 || ' days')::interval)::date
      order by run_date desc, symbol asc`,
    [String(days)],
  );
  return res.rows.map((r) => ({
    runDate: toDateStr(r.run_date)!,
    symbol: String(r.symbol),
    displayName: String(r.display_name),
    tier: String(r.tier),
    fromVerdict: r.from_verdict == null ? null : String(r.from_verdict),
    toVerdict: String(r.to_verdict),
  }));
}
