import type { BtcMarket, BtcMarketResponse } from "../app/components/projects/btc/marketData";

type Json = Record<string, unknown>;
function obj(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid market response");
  return value as Json;
}
function num(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function positive(value: unknown): number {
  const n = num(value);
  if (n === null || n <= 0) throw new Error("Missing market price");
  return n;
}
function nonnegative(value: unknown): number | null {
  const n = num(value);
  return n !== null && n >= 0 ? n : null;
}
function spread(bid: unknown, ask: unknown): number | null {
  const b = num(bid), a = num(ask);
  return b !== null && a !== null && b > 0 && a >= b ? (a - b) / ((a + b) / 2) * 10_000 : null;
}

export function parseCoinbaseMarket(ticker: unknown, stats: unknown): BtcMarket {
  const t = obj(ticker), s = obj(stats);
  const price = positive(t.price), open = num(s.open);
  if (typeof t.time !== "string" || !Number.isFinite(Date.parse(t.time))) throw new Error("Missing trade timestamp");
  return { locus: "coinbase", pair: "BTC-USD", quote: "USD", price,
    change24h: open !== null && open > 0 ? (price / open - 1) * 100 : null,
    volumeBtc: nonnegative(s.volume), turnover: null, spreadBps: spread(t.bid, t.ask),
    fundingPct: null, openInterest: null, nextFundingAt: null,
    // Last trade timestamp is preserved; fetching an old trade does not make it fresh.
    asOf: t.time, source: "Coinbase Exchange" };
}

export function parseBybitMarket(raw: unknown): BtcMarket {
  const body = obj(raw);
  if (body.retCode !== 0) throw new Error("Bybit market feed unavailable");
  const result = obj(body.result);
  const rows = result.list;
  if (!Array.isArray(rows)) throw new Error("Missing Bybit ticker");
  const t = rows.map(obj).find((r) => r.symbol === "BTCUSDT");
  if (!t) throw new Error("Missing BTCUSDT ticker");
  const time = positive(body.time);
  if (!Number.isFinite(new Date(time).getTime())) throw new Error("Invalid market timestamp");
  const change = num(t.price24hPcnt), funding = num(t.fundingRate), next = num(t.nextFundingTime);
  return { locus: "bybit", pair: "BTCUSDT perpetual", quote: "USDT", price: positive(t.lastPrice),
    change24h: change === null ? null : change * 100, volumeBtc: nonnegative(t.volume24h),
    turnover: nonnegative(t.turnover24h), spreadBps: spread(t.bid1Price, t.ask1Price),
    fundingPct: funding === null ? null : funding * 100, openInterest: nonnegative(t.openInterestValue),
    nextFundingAt: next !== null && next > 0 && Number.isFinite(new Date(next).getTime()) ? new Date(next).toISOString() : null,
    asOf: new Date(time).toISOString(), source: "Bybit public market API" };
}

type FetchJson = (url: string) => Promise<unknown>;
/** Isolate each venue so a restricted or failed provider cannot blank the other panel. */
export async function loadBtcMarkets(get: FetchJson): Promise<BtcMarketResponse> {
  const results = await Promise.allSettled([
    Promise.all([
      get("https://api.exchange.coinbase.com/products/BTC-USD/ticker"),
      get("https://api.exchange.coinbase.com/products/BTC-USD/stats"),
    ]).then(([ticker, stats]) => parseCoinbaseMarket(ticker, stats)),
    get("https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT").then(parseBybitMarket),
  ]);
  const markets: BtcMarket[] = [], errors: BtcMarketResponse["errors"] = {};
  results.forEach((result, i) => {
    if (result.status === "fulfilled") markets.push(result.value);
    else errors[i === 0 ? "coinbase" : "bybit"] = "Public market feed unavailable. Retrying automatically.";
  });
  return { markets, errors };
}
