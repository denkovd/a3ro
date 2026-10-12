import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { parseCoinbaseMarket, parseBybitMarket, loadBtcMarkets } = await load("../lib/btcMarkets.ts");
const { freshness, sumSessions, venueInMode } = await load("../app/components/projects/btc/marketData.ts");
const ticker = { price: "60000", bid: "59999", ask: "60001", time: "2026-10-10T12:00:00Z" };
const stats = { open: "50000", volume: "123.5" };
const bybit = { retCode: 0, time: Date.parse(ticker.time), result: { list: [{ symbol: "BTCUSDT", lastPrice: "60000", price24hPcnt: "0.02", volume24h: "100", turnover24h: "6000000", fundingRate: "-0.0001", openInterestValue: "1200000", bid1Price: "59999", ask1Price: "60001", nextFundingTime: String(Date.parse("2026-10-10T16:00:00Z")) }] } };

test("Coinbase preserves trade time and reports BTC volume without inventing USD turnover", () => {
  const m = parseCoinbaseMarket(ticker, stats);
  assert.equal(m.asOf, ticker.time);
  assert.ok(Math.abs(m.change24h - 20) < 1e-10);
  assert.equal(m.volumeBtc, 123.5);
  assert.equal(m.turnover, null);
  assert.ok(Math.abs(m.spreadBps - 1 / 3) < 1e-10);
});

test("Bybit converts fractional change and funding to percent and preserves quote units", () => {
  const m = parseBybitMarket(bybit);
  assert.equal(m.change24h, 2);
  assert.equal(m.fundingPct, -0.01);
  assert.equal(m.openInterest, 1200000);
  assert.equal(m.quote, "USDT");
  assert.equal(m.nextFundingAt, "2026-10-10T16:00:00.000Z");
});

test("missing numeric fields stay missing and malformed provider results are rejected", () => {
  assert.equal(parseCoinbaseMarket(ticker, { open: "", volume: null }).change24h, null);
  assert.equal(parseCoinbaseMarket({ ...ticker, ask: "1" }, stats).spreadBps, null);
  assert.throws(() => parseCoinbaseMarket({ ...ticker, price: "NaN" }, stats));
  assert.throws(() => parseBybitMarket({ ...bybit, retCode: 10001 }));
  assert.throws(() => parseBybitMarket({ ...bybit, result: { list: [] } }));
});

test("one blocked provider cannot discard the other venue's readings", async () => {
  const result = await loadBtcMarkets(async (url) => {
    if (url.includes("bybit")) throw new Error("403");
    return url.endsWith("stats") ? stats : ticker;
  });
  assert.deepEqual(result.markets.map((m) => m.locus), ["coinbase"]);
  assert.ok(result.errors.bybit);
  assert.equal(result.errors.coinbase, undefined);
});

test("rolling ETF totals require complete reported-session counts and deduplicate dates", () => {
  const rows = [{ periodDate: "2026-10-02", value: 10 }, { periodDate: "2026-10-05", value: -5 }, { periodDate: "2026-10-05", value: -8 }];
  assert.equal(sumSessions(rows, 2), 2);
  assert.equal(sumSessions(rows, 5), null);
  assert.equal(sumSessions([...rows, { periodDate: "2026-10-06", value: NaN }], 3), null);
});

test("old prices never become live on refresh and future timestamps are rejected", () => {
  const now = Date.parse("2026-10-10T12:01:00Z");
  assert.equal(freshness(ticker.time, now), "live");
  assert.equal(freshness("2026-07-03T12:00:00Z", now), "delayed");
  assert.equal(freshness("2026-12-03T12:00:00Z", now), "unavailable");
  assert.equal(freshness(undefined, now), "unavailable");
});

test("modes place Bybit in derivatives and ETF and mining views exclude spot venues", () => {
  assert.equal(venueInMode("exchange", "bybit", "spot"), false);
  assert.equal(venueInMode("exchange", "bybit", "derivatives"), true);
  assert.equal(venueInMode("exchange", "coinbase", "etfs"), false);
  assert.equal(venueInMode("etf", "etf_us", "etfs"), true);
  assert.equal(venueInMode("exchange", "coinbase", "mining"), false);
});
