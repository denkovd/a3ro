/* ────────────────────────────────────────────────────────────────
   Repository for btc_prices + btc_snapshots — mirrors goldRepo.ts.
   btcCycle calls upsertBtcPrices (Coinbase candle catch-up) and
   upsertBtcSnapshot (once, the computed reading); app/api/btc/latest
   reads via getLatestBtcSnapshot.
──────────────────────────────────────────────────────────────── */

import { BtcEngineSnapshot, BtcPricePoint } from "../btc/engine";
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

/* ── btc_prices: daily-close history from Coinbase candles ───────── */

export async function upsertBtcPrice(db: Queryable, point: BtcPricePoint, source: string): Promise<void> {
  await db.query(
    `insert into btc_prices (run_date, price, source, fetched_at)
     values ($1,$2,$3, now())
     on conflict (run_date) do update
       set price = excluded.price,
           source = excluded.source,
           fetched_at = now()`,
    [point.date, point.value, source],
  );
}

export async function upsertBtcPrices(db: Queryable, points: BtcPricePoint[], source: string): Promise<number> {
  for (const point of points) {
    await upsertBtcPrice(db, point, source);
  }
  return points.length;
}

/** Ascending by date, inclusive range — the series computeBtcSnapshot
 *  reads for d1/w1/m1/y1 changes. */
export async function getBtcPriceHistory(
  db: Queryable,
  fromDate: string,
  toDate: string,
): Promise<BtcPricePoint[]> {
  const res = await db.query(
    `select run_date, price from btc_prices
      where run_date between $1 and $2
      order by run_date asc`,
    [fromDate, toDate],
  );
  return res.rows.map((r) => ({ date: toDateStr(r.run_date), value: Number(r.price) }));
}

/* ── btc_snapshots: the final computed reading ────────────────────── */

export interface BtcSnapshotRow {
  runDate: string;
  price: number | null;
  priceCurrency: string;
  priceAsOf: string | null;
  priceSource: string;
  changes: BtcEngineSnapshot["changes"];
  computedAt: string;
}

export async function upsertBtcSnapshot(
  db: Queryable,
  snapshot: BtcEngineSnapshot,
  priceSource: "coinbase-spot" | "coinbase-candle",
): Promise<number> {
  const res = await db.query(
    `insert into btc_snapshots
       (run_date, price, price_currency, price_as_of, price_source, changes, computed_at)
     values ($1,$2,'USD',$3,$4,$5, now())
     on conflict (run_date) do update
       set price = excluded.price,
           price_as_of = excluded.price_as_of,
           price_source = excluded.price_source,
           changes = excluded.changes,
           computed_at = now()`,
    [
      snapshot.runDate,
      snapshot.price,
      snapshot.priceAsOf,
      priceSource,
      JSON.stringify(snapshot.changes),
    ],
  );
  return res.rowCount ?? 0;
}

export async function getLatestBtcSnapshot(db: Queryable): Promise<BtcSnapshotRow | null> {
  const res = await db.query(`select * from btc_snapshots order by run_date desc limit 1`);
  const r = res.rows[0];
  return r ? rowToBtcSnapshot(r) : null;
}

function rowToBtcSnapshot(r: Record<string, unknown>): BtcSnapshotRow {
  const parseChanges = (v: unknown): BtcEngineSnapshot["changes"] => {
    const parsed = (typeof v === "string" ? JSON.parse(v) : v) as Partial<BtcEngineSnapshot["changes"]>;
    return {
      d1: parsed.d1 ?? null,
      w1: parsed.w1 ?? null,
      m1: parsed.m1 ?? null,
      y1: parsed.y1 ?? null,
    };
  };
  return {
    runDate: toDateStr(r.run_date),
    price: r.price === null ? null : Number(r.price),
    priceCurrency: String(r.price_currency),
    priceAsOf: r.price_as_of === null ? null : toIso(r.price_as_of),
    priceSource: String(r.price_source),
    changes: parseChanges(r.changes),
    computedAt: toIso(r.computed_at),
  };
}
