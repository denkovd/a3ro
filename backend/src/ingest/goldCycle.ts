/* ────────────────────────────────────────────────────────────────
   Gold cycle — incremental FRED history pull (always, cheap,
   keyless) + freshness-guarded GoldAPI live tick (skip if today's
   snapshot already has one — the 100 req/month budget only affords
   ~1 call/day) + the pure engine + upsert. Isolation posture matches
   every other cycle: never throw; SourceError is captured in the
   report, unknown throws wrapped as bad_payload.

   Runs from the daily cron after macro, so the fresh macro panel
   (dollar_broad, rates_10y, inflation_breakeven) is available for
   usdPressure/realYieldPressure without a second fetch.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { computeGoldSnapshot, GoldLiveTick } from "../gold/engine";
import { fetchGoldPriceSeries, GOLD_INCREMENTAL_LOOKBACK_DAYS } from "../sources/fredGold";
import { fetchGoldSpot } from "../sources/goldapi";
import { fetchMacroPanel } from "../sources/fredMacro";
import {
  getGoldPriceHistory,
  hasLiveGoldTick,
  upsertGoldPrices,
  upsertGoldSnapshot,
} from "../storage/goldRepo";
import { Queryable } from "../storage/db";

/** Enough for a genuine 10y change plus a little buffer. */
const HISTORY_LOOKBACK_DAYS = 15 * 365 + 30;

export interface GoldCycleReport {
  startedAt: string;
  runDate: string;
  price?: number | null;
  priceSource?: "goldapi" | "fred";
  goldapiSkipped?: string;
  goldapiError?: string;
  written: number;
  error?: string;
}

function daysAgoDateStr(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export async function runGoldCycle(
  db: Queryable,
  opts: { now?: () => Date } = {},
): Promise<GoldCycleReport> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runDate = startedAt.slice(0, 10);

  try {
    // Incremental FRED pull — cheap, keyless; catches up any new rows.
    const goldSeries = await fetchGoldPriceSeries({
      now: started,
      lookbackDays: GOLD_INCREMENTAL_LOOKBACK_DAYS,
    });
    await upsertGoldPrices(db, goldSeries.observations, "fred");

    // Freshness-guarded GoldAPI live tick — skip if today's snapshot
    // already captured one, so a manual rerun/retry never burns the
    // 100 req/month budget twice in a day.
    let live: GoldLiveTick | null = null;
    let goldapiSkipped: string | undefined;
    let goldapiError: string | undefined;
    if (await hasLiveGoldTick(db, runDate)) {
      goldapiSkipped = "already have a live tick for today";
    } else {
      try {
        live = await fetchGoldSpot();
      } catch (e) {
        // A failed GoldAPI call must never fail the cycle — the
        // engine falls back to FRED's own price for the headline.
        goldapiError = e instanceof SourceError ? `${e.kind}: ${e.message}` : String(e);
      }
    }

    const macroPanel = await fetchMacroPanel({ now: started });
    const history = await getGoldPriceHistory(
      db,
      daysAgoDateStr(started, HISTORY_LOOKBACK_DAYS),
      runDate,
    );
    const snapshot = computeGoldSnapshot(history, macroPanel, live, runDate);
    const priceSource: "goldapi" | "fred" = live ? "goldapi" : "fred";
    const written = await upsertGoldSnapshot(db, snapshot, priceSource);

    return {
      startedAt,
      runDate,
      price: snapshot.price,
      priceSource,
      goldapiSkipped,
      goldapiError,
      written,
    };
  } catch (e) {
    if (e instanceof SourceError) {
      return { startedAt, runDate, written: 0, error: `${e.kind}: ${e.message}` };
    }
    const err = new SourceError("gold-cycle", "bad_payload", String(e), { cause: e });
    return { startedAt, runDate, written: 0, error: err.message };
  }
}
