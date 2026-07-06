/* ────────────────────────────────────────────────────────────────
   Repository layer for regime snapshots — sibling to corridorRepo.
   The only module that writes SQL for regime_snapshots. The cycle
   calls upsertRegimeSnapshots; /api/regime/latest reads via
   getLatestRegimeSnapshots (all rows of the newest run_date,
   already rank-ordered by the engine).
──────────────────────────────────────────────────────────────── */

import { RegimeSnapshot } from "../regime/types";
import { Queryable } from "./db";

export async function upsertRegimeSnapshots(
  db: Queryable,
  snapshots: RegimeSnapshot[],
): Promise<number> {
  let written = 0;
  for (const s of snapshots) {
    const res = await db.query(
      `insert into regime_snapshots
         (run_date, symbol, display_name, asset_class, verdict, rank,
          newly_bullish, daily_trend, weekly_trend, daily_line, weekly_line,
          daily_flip_date, daily_flip_price, weekly_flip_date, weekly_flip_price,
          daily_since_flip_pct, weekly_since_flip_pct,
          daily_cushion_pct, weekly_cushion_pct,
          daily_bars_since_flip, weekly_bars_since_flip,
          aligned_since, days_since_aligned, strength,
          last_close, last_close_date, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               $18,$19,$20,$21,$22,$23,$24,$25,$26, now())
       on conflict (run_date, symbol) do update set
         display_name = excluded.display_name,
         asset_class = excluded.asset_class,
         verdict = excluded.verdict,
         rank = excluded.rank,
         newly_bullish = excluded.newly_bullish,
         daily_trend = excluded.daily_trend,
         weekly_trend = excluded.weekly_trend,
         daily_line = excluded.daily_line,
         weekly_line = excluded.weekly_line,
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
         strength = excluded.strength,
         last_close = excluded.last_close,
         last_close_date = excluded.last_close_date,
         updated_at = now()`,
      [
        s.runDate, s.symbol, s.displayName, s.assetClass, s.verdict, s.rank,
        s.newlyBullish, s.daily.trend, s.weekly.trend, s.daily.line, s.weekly.line,
        s.daily.lastFlipDate, s.daily.lastFlipPrice,
        s.weekly.lastFlipDate, s.weekly.lastFlipPrice,
        s.daily.sinceFlipPct, s.weekly.sinceFlipPct,
        s.daily.cushionPct, s.weekly.cushionPct,
        s.daily.barsSinceFlip, s.weekly.barsSinceFlip,
        s.alignedSince, s.daysSinceAligned, s.strength,
        s.lastClose, s.lastCloseDate,
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** Flat read shape for the API — one row per symbol, newest run. */
export interface RegimeSnapshotRow {
  runDate: string;
  symbol: string;
  displayName: string;
  assetClass: string;
  verdict: string;
  rank: number;
  newlyBullish: boolean;
  dailyTrend: number;
  weeklyTrend: number;
  dailyLine: number | null;
  weeklyLine: number | null;
  dailyFlipDate: string | null;
  dailyFlipPrice: number | null;
  weeklyFlipDate: string | null;
  weeklyFlipPrice: number | null;
  dailySinceFlipPct: number | null;
  weeklySinceFlipPct: number | null;
  dailyCushionPct: number | null;
  weeklyCushionPct: number | null;
  daysSinceAligned: number | null;
  alignedSince: string | null;
  strength: number | null;
  lastClose: number | null;
  lastCloseDate: string | null;
  updatedAt: string;
}

export async function getLatestRegimeSnapshots(db: Queryable): Promise<RegimeSnapshotRow[]> {
  const res = await db.query(
    `select * from regime_snapshots
      where run_date = (select max(run_date) from regime_snapshots)
      order by rank asc`,
  );
  return res.rows.map(rowToSnapshot);
}

/* ── row mapping helpers ──────────────────────────────────────── */

function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToSnapshot(r: Record<string, unknown>): RegimeSnapshotRow {
  return {
    runDate: toDateStr(r.run_date)!,
    symbol: String(r.symbol),
    displayName: String(r.display_name),
    assetClass: String(r.asset_class),
    verdict: String(r.verdict),
    rank: Number(r.rank),
    newlyBullish: Boolean(r.newly_bullish),
    dailyTrend: Number(r.daily_trend),
    weeklyTrend: Number(r.weekly_trend),
    dailyLine: toNum(r.daily_line),
    weeklyLine: toNum(r.weekly_line),
    dailyFlipDate: toDateStr(r.daily_flip_date),
    dailyFlipPrice: toNum(r.daily_flip_price),
    weeklyFlipDate: toDateStr(r.weekly_flip_date),
    weeklyFlipPrice: toNum(r.weekly_flip_price),
    dailySinceFlipPct: toNum(r.daily_since_flip_pct),
    weeklySinceFlipPct: toNum(r.weekly_since_flip_pct),
    dailyCushionPct: toNum(r.daily_cushion_pct),
    weeklyCushionPct: toNum(r.weekly_cushion_pct),
    daysSinceAligned: toNum(r.days_since_aligned),
    alignedSince: toDateStr(r.aligned_since),
    strength: toNum(r.strength),
    lastClose: toNum(r.last_close),
    lastCloseDate: toDateStr(r.last_close_date),
    updatedAt: r.updated_at instanceof Date
      ? r.updated_at.toISOString()
      : String(r.updated_at),
  };
}
