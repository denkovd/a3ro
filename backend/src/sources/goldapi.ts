/* ────────────────────────────────────────────────────────────────
   GoldAPI.io adapter — the freshest live gold tick, nothing else.

   GET https://www.goldapi.io/api/{symbol}/{currency}
     Headers: x-access-token: <key>
     → { price, ch, chp, timestamp, ... } (chp = today's % change)

   Keyed and tightly rate-limited (the project's plan caps at 100
   req/month, ~3/day) — GOLDAPI_KEY must stay a server-only env var
   (never NEXT_PUBLIC_*, never shipped to the browser bundle) and the
   ingest cycle (ingest/goldCycle.ts) self-guards to at most one call
   per day. Deep history/changes come from FRED instead (fredGold.ts);
   this adapter's only job is today's live price.

   Not a BaseSource/OilPriceSource — that contract is oil-specific
   (Benchmark, PriceRecord, USD/bbl). This reuses the shared HTTP
   plumbing (getJsonForSource) directly, same as CorridorBaseSource
   does for the corridor domain.
──────────────────────────────────────────────────────────────── */

import { SourceError } from "../core/types";
import { getJsonForSource } from "./http";

const SOURCE_ID = "goldapi";
const BASE_URL = "https://www.goldapi.io/api";

interface GoldApiResponse {
  price?: number;
  ch?: number; // absolute change on the day
  chp?: number; // percent change on the day
  timestamp?: number; // unix seconds
}

export interface GoldSpotTick {
  price: number;
  changeDayPct: number | null;
  asOf: string; // ISO-8601 UTC
}

export async function fetchGoldSpot(
  opts: { symbol?: string; currency?: string; apiKey?: string } = {},
): Promise<GoldSpotTick> {
  const apiKey = opts.apiKey ?? process.env.GOLDAPI_KEY ?? "";
  if (!apiKey) {
    throw new SourceError(SOURCE_ID, "auth", "GOLDAPI_KEY is not set");
  }
  const symbol = opts.symbol ?? "XAU";
  const currency = opts.currency ?? "USD";
  const url = `${BASE_URL}/${symbol}/${currency}`;

  const body = await getJsonForSource<GoldApiResponse>(SOURCE_ID, url, {
    headers: { "x-access-token": apiKey },
  });

  if (typeof body.price !== "number" || !Number.isFinite(body.price)) {
    throw new SourceError(SOURCE_ID, "bad_payload", `unexpected GoldAPI response shape: ${JSON.stringify(body).slice(0, 200)}`);
  }

  const asOf =
    typeof body.timestamp === "number"
      ? new Date(body.timestamp * 1000).toISOString()
      : new Date().toISOString();

  return {
    price: body.price,
    changeDayPct: typeof body.chp === "number" && Number.isFinite(body.chp) ? body.chp : null,
    asOf,
  };
}
