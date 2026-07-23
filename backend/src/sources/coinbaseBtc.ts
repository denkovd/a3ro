/* ────────────────────────────────────────────────────────────────
   Coinbase Exchange public BTC-USD adapter — keyless price backbone
   for BTC Tracker. Two roles, one source, no key at all (unlike
   Gold's goldapi.io tick, which is paid and capped at 100 req/month):

   Deep history (candles, plays yahooGold.ts's role):
     GET https://api.exchange.coinbase.com/products/BTC-USD/candles
       ?granularity=86400&start={iso}&end={iso}
       → [[time, low, high, open, close, volume], ...] (newest first,
         confirmed live 2026-07-23; candle order per Coinbase's docs is
         [time, low, high, open, close, volume] — verify against any
         future payload shape before trusting a re-ordered guess).
     Capped at 300 candles/request, so deeper backfills page across
     multiple windows.

   Live tick (spot, plays goldapi.ts's role):
     GET https://api.coinbase.com/v2/prices/BTC-USD/spot
       → { data: { amount, base, currency } }
     No day-change field of its own (unlike GoldAPI's chp) — asOf is
     just the fetch instant. btc/engine.ts computes every % change
     off the candle history instead of blending this in.

   Both endpoints are unofficial/undocumented SLA-wise but keyless and
   widely relied upon; confirmed reachable live during setup.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { getJsonForSource } from "./http";

const SOURCE_ID = "coinbase-btc";
const CANDLES_URL = "https://api.exchange.coinbase.com/products/BTC-USD/candles";
const SPOT_URL = "https://api.coinbase.com/v2/prices/BTC-USD/spot";
const GRANULARITY_SECONDS = 86_400;
const MAX_CANDLES_PER_REQUEST = 300;
const USER_AGENT = "Mozilla/5.0 (compatible; a3ro-btc-tracker/1.0)";

/** Incremental lookback — a cron run only needs to catch up the last
 *  few days' new rows. */
export const BTC_INCREMENTAL_LOOKBACK_DAYS = 10;

/** Backfill lookback — this phase's engine only needs up to a 1y
 *  change, so 400 days (1y + buffer) is enough; not the multi-year
 *  depth Gold backfills, since there's no y5/y10 leg here yet. */
export const BTC_BACKFILL_LOOKBACK_DAYS = 400;

export interface CoinbasePricePoint {
  date: string; // "YYYY-MM-DD"
  value: number;
}

type RawCandle = [number, number, number, number, number, number];

function toDateStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pure parse — fixture-tested. */
export function parseCoinbaseCandles(body: unknown): CoinbasePricePoint[] {
  if (!Array.isArray(body)) {
    throw new SourceError(SOURCE_ID, "bad_payload", "Coinbase candles response is not an array");
  }
  const byDate = new Map<string, number>();
  for (const row of body) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [time, , , , close] = row as RawCandle;
    if (typeof time !== "number" || typeof close !== "number" || !Number.isFinite(close)) continue;
    byDate.set(toDateStr(time), close);
  }
  if (byDate.size === 0) {
    throw new SourceError(SOURCE_ID, "bad_payload", "Coinbase candles response produced zero usable rows");
  }
  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchCandleWindow(startIso: string, endIso: string): Promise<CoinbasePricePoint[]> {
  const url = `${CANDLES_URL}?granularity=${GRANULARITY_SECONDS}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;
  const body = await getJsonForSource<unknown>(SOURCE_ID, url, {
    headers: { "User-Agent": USER_AGENT },
  });
  return parseCoinbaseCandles(body);
}

/** Pages across the 300-candle-per-request cap when the requested
 *  lookback needs more than one window; merges by date (last write
 *  wins on any overlap) and returns ascending. */
export async function fetchBtcPriceSeries(
  opts: { now?: Date; lookbackDays?: number } = {},
): Promise<CoinbasePricePoint[]> {
  const now = opts.now ?? new Date();
  const lookbackDays = opts.lookbackDays ?? BTC_INCREMENTAL_LOOKBACK_DAYS;
  const totalStart = new Date(now.getTime() - lookbackDays * 86_400_000);

  const windows: Array<{ start: Date; end: Date }> = [];
  let cursor = totalStart;
  while (cursor < now) {
    const windowEndMs = Math.min(
      cursor.getTime() + (MAX_CANDLES_PER_REQUEST - 1) * GRANULARITY_SECONDS * 1000,
      now.getTime(),
    );
    const windowEnd = new Date(windowEndMs);
    windows.push({ start: cursor, end: windowEnd });
    cursor = new Date(windowEnd.getTime() + GRANULARITY_SECONDS * 1000);
  }

  const byDate = new Map<string, number>();
  for (let i = 0; i < windows.length; i++) {
    const { start, end } = windows[i];
    const points = await fetchCandleWindow(start.toISOString(), end.toISOString());
    for (const p of points) byDate.set(p.date, p.value);
    if (i < windows.length - 1) await sleep(200); // polite pacing across paginated windows
  }

  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface BtcLiveTick {
  price: number;
  /** ISO-8601 UTC — the fetch instant; the spot endpoint carries no
   *  timestamp of its own. */
  asOf: string;
}

interface CoinbaseSpotResponse {
  data?: { amount?: string; base?: string; currency?: string };
}

export async function fetchBtcSpot(): Promise<BtcLiveTick> {
  const body = await getJsonForSource<CoinbaseSpotResponse>(SOURCE_ID, SPOT_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  const amount = body.data?.amount;
  const price = amount != null ? Number(amount) : NaN;
  if (!Number.isFinite(price)) {
    throw new SourceError(
      SOURCE_ID,
      "bad_payload",
      `unexpected Coinbase spot response shape: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }
  return { price, asOf: new Date().toISOString() };
}
