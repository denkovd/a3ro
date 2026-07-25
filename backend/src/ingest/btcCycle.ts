/* ────────────────────────────────────────────────────────────────
   BTC price cycle — incremental Coinbase candle pull (always, cheap,
   keyless) + Coinbase spot live tick (also keyless — no budget guard
   needed, unlike goldCycle.ts's GoldAPI freshness gate) + the pure
   engine + upsert. Isolation posture matches every other cycle: never
   throw; SourceError is captured in the report, unknown throws
   wrapped as bad_payload.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { computeBtcSnapshot, BtcLiveTick } from "../btc/engine";
import { fetchBtcPriceSeries, fetchBtcSpot, BTC_INCREMENTAL_LOOKBACK_DAYS } from "../sources/coinbaseBtc";
import { getBtcPriceHistory, upsertBtcPrices, upsertBtcSnapshot } from "../storage/btcRepo";
import { Queryable } from "../storage/db";

/** Enough for a genuine 1y change plus buffer — this phase's engine
 *  only has a y1 leg, not gold's y5/y10. */
const HISTORY_LOOKBACK_DAYS = 400;

export interface BtcCycleReport {
  startedAt: string;
  runDate: string;
  price?: number | null;
  priceSource?: "coinbase-spot" | "coinbase-candle";
  spotError?: string;
  written: number;
  error?: string;
}

function daysAgoDateStr(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export async function runBtcCycle(
  db: Queryable,
  opts: { now?: () => Date } = {},
): Promise<BtcCycleReport> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runDate = startedAt.slice(0, 10);

  try {
    // Incremental Coinbase candle pull — cheap, keyless; catches up any new rows.
    const series = await fetchBtcPriceSeries({ now: started, lookbackDays: BTC_INCREMENTAL_LOOKBACK_DAYS });
    await upsertBtcPrices(db, series, "coinbase-candle");

    // Live spot tick — keyless, so unlike goldCycle.ts's hasLiveGoldTick
    // budget guard, this just runs every cycle.
    let live: BtcLiveTick | null = null;
    let spotError: string | undefined;
    try {
      live = await fetchBtcSpot();
    } catch (e) {
      spotError = e instanceof SourceError ? `${e.kind}: ${e.message}` : String(e);
    }

    const history = await getBtcPriceHistory(
      db,
      daysAgoDateStr(started, HISTORY_LOOKBACK_DAYS),
      runDate,
    );
    const snapshot = computeBtcSnapshot(history, live, runDate);
    const priceSource: "coinbase-spot" | "coinbase-candle" = live ? "coinbase-spot" : "coinbase-candle";
    const written = await upsertBtcSnapshot(db, snapshot, priceSource);

    return {
      startedAt,
      runDate,
      price: snapshot.price,
      priceSource,
      spotError,
      written,
    };
  } catch (e) {
    if (e instanceof SourceError) {
      return { startedAt, runDate, written: 0, error: `${e.kind}: ${e.message}` };
    }
    const err = new SourceError("btc-cycle", "bad_payload", String(e), { cause: e });
    return { startedAt, runDate, written: 0, error: err.message };
  }
}
