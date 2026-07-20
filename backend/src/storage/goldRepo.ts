/* ────────────────────────────────────────────────────────────────
   Repository for gold_prices + gold_snapshots — the only module that
   writes SQL for the gold layer. goldCycle calls upsertGoldPrice (per
   FRED row) and upsertGoldSnapshot (once, the computed reading);
   app/api/gold/latest reads via getLatestGoldSnapshot. Mirrors
   macroRepo's shape.
──────────────────────────────────────────────────────────────── */

import { GoldEngineSnapshot, GoldIndicator, GoldPricePoint } from "../gold/engine";
import { Queryable } from "./db";

function toDateStr(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}
function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

/* ── gold_prices: pure FRED daily-close history ───────────────── */

export async function upsertGoldPrice(
  db: Queryable,
  point: GoldPricePoint,
  source: string,
): Promise<void> {
  await db.query(
    `insert into gold_prices (run_date, price, source, fetched_at)
     values ($1,$2,$3, now())
     on conflict (run_date) do update
       set price = excluded.price,
           source = excluded.source,
           fetched_at = now()`,
    [point.date, point.value, source],
  );
}

export async function upsertGoldPrices(
  db: Queryable,
  points: GoldPricePoint[],
  source: string,
): Promise<number> {
  for (const point of points) {
    await upsertGoldPrice(db, point, source);
  }
  return points.length;
}

/** Ascending by date, inclusive range — the series computeGoldSnapshot
 *  reads for trend/momentum/volatility/changes. */
export async function getGoldPriceHistory(
  db: Queryable,
  fromDate: string,
  toDate: string,
): Promise<GoldPricePoint[]> {
  const res = await db.query(
    `select run_date, price from gold_prices
      where run_date between $1 and $2
      order by run_date asc`,
    [fromDate, toDate],
  );
  return res.rows.map((r) => ({ date: toDateStr(r.run_date), value: Number(r.price) }));
}

/* ── gold_snapshots: the final computed reading ───────────────── */

export interface GoldSnapshotRow {
  runDate: string;
  price: number | null;
  priceCurrency: string;
  priceUnit: string;
  priceAsOf: string | null;
  priceSource: string;
  changes: GoldEngineSnapshot["changes"];
  indicators: GoldEngineSnapshot["indicators"];
  computedAt: string;
}

export async function upsertGoldSnapshot(
  db: Queryable,
  snapshot: GoldEngineSnapshot,
  priceSource: "goldapi" | "fred",
): Promise<number> {
  const res = await db.query(
    `insert into gold_snapshots
       (run_date, price, price_currency, price_unit, price_as_of, price_source, changes, indicators, computed_at)
     values ($1,$2,'USD','troy oz',$3,$4,$5,$6, now())
     on conflict (run_date) do update
       set price = excluded.price,
           price_as_of = excluded.price_as_of,
           price_source = excluded.price_source,
           changes = excluded.changes,
           indicators = excluded.indicators,
           computed_at = now()`,
    [
      snapshot.runDate,
      snapshot.price,
      snapshot.priceAsOf,
      priceSource,
      JSON.stringify(snapshot.changes),
      JSON.stringify(snapshot.indicators),
    ],
  );
  return res.rowCount ?? 0;
}

export async function getLatestGoldSnapshot(db: Queryable): Promise<GoldSnapshotRow | null> {
  const res = await db.query(`select * from gold_snapshots order by run_date desc limit 1`);
  const r = res.rows[0];
  return r ? rowToGoldSnapshot(r) : null;
}

/** Self-guard for the ingest cycle: has today's run already captured a
 *  live GoldAPI tick? If so, skip calling the (100 req/month) API
 *  again this run — mirrors seasonalCycle.ts's freshness self-guard. */
export async function hasLiveGoldTick(db: Queryable, runDate: string): Promise<boolean> {
  const res = await db.query(
    `select 1 from gold_snapshots where run_date = $1 and price_source = 'goldapi'`,
    [runDate],
  );
  return res.rows.length > 0;
}

function rowToGoldSnapshot(r: Record<string, unknown>): GoldSnapshotRow {
  const parseIndicators = (v: unknown): GoldEngineSnapshot["indicators"] => {
    const parsed = (typeof v === "string" ? JSON.parse(v) : v) as Record<string, GoldIndicator | null>;
    return {
      trend: parsed.trend ?? null,
      momentum: parsed.momentum ?? null,
      volatility: parsed.volatility ?? null,
      usdPressure: parsed.usdPressure ?? null,
      realYieldPressure: parsed.realYieldPressure ?? null,
    };
  };
  const parseChanges = (v: unknown): GoldEngineSnapshot["changes"] => {
    const parsed = (typeof v === "string" ? JSON.parse(v) : v) as Partial<GoldEngineSnapshot["changes"]>;
    return {
      d1: parsed.d1 ?? null,
      w1: parsed.w1 ?? null,
      y1: parsed.y1 ?? null,
      y5: parsed.y5 ?? null,
      y10: parsed.y10 ?? null,
    };
  };
  return {
    runDate: toDateStr(r.run_date),
    price: r.price === null ? null : Number(r.price),
    priceCurrency: String(r.price_currency),
    priceUnit: String(r.price_unit),
    priceAsOf: r.price_as_of === null ? null : toIso(r.price_as_of),
    priceSource: String(r.price_source),
    changes: parseChanges(r.changes),
    indicators: parseIndicators(r.indicators),
    computedAt: toIso(r.computed_at),
  };
}
