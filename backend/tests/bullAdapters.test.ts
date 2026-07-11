/* ────────────────────────────────────────────────────────────────
   Adapter layer — parser fixtures + the failure-mode suite the
   module spec requires: primary success · primary failure with
   fallback success · everything failing (log and skip, never crash).
──────────────────────────────────────────────────────────────── */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceError } from "../src/core/types";
import {
  binanceSymbolFor,
  fetchBarsWithFallback,
  isStale,
  parseAlphaVantageDaily,
  parseBinanceKlines,
  parseStooqCsv,
  stooqSymbolFor,
  AdapterRegistry,
} from "../src/bull/adapters";
import { BarSourceAdapter, BullUniverseEntry, RegimeBar } from "../src/bull/types";

const bar = (date: string, close = 100): RegimeBar =>
  ({ date, open: close, high: close + 1, low: close - 1, close });

const entry = (over: Partial<BullUniverseEntry> = {}): BullUniverseEntry => ({
  symbol: "AAPL", displayName: "Apple", tier: "us_large",
  assetClass: "equity", adapters: ["yahoo", "stooq"], ...over,
});

/* ── parsers ──────────────────────────────────────────────────── */

test("parseStooqCsv: header + rows → bars, junk rows skipped", () => {
  const csv = [
    "Date,Open,High,Low,Close,Volume",
    "2026-07-08,210.1,212.5,209.8,212.0,51234000",
    "2026-07-09,212.2,213.0,210.5,211.1,48000000",
    "not-a-date,1,2,3,4,5",
    "2026-07-10,211.5,214.0,211.0,213.9,",
  ].join("\n");
  const bars = parseStooqCsv(csv, "AAPL");
  assert.equal(bars.length, 3);
  assert.deepEqual(bars[0], { date: "2026-07-08", open: 210.1, high: 212.5, low: 209.8, close: 212.0 });
  assert.equal(bars[2].close, 213.9);
});

test("parseStooqCsv: non-CSV body (e.g. an HTML error page) throws", () => {
  assert.throws(() => parseStooqCsv("<html>No data</html>", "AAPL"), /not a daily CSV/);
});

test("parseBinanceKlines: kline arrays → bars", () => {
  const payload = [
    [1783641600000, "108000.1", "109500.0", "107200.5", "109100.2", "12345", 0, "0", 0, "0", "0", "0"],
    [1783728000000, "109100.2", "110000.0", "108800.0", "109800.9", "9876", 0, "0", 0, "0", "0", "0"],
  ];
  const bars = parseBinanceKlines(payload, "BTC-USD");
  assert.equal(bars.length, 2);
  assert.equal(bars[0].date, "2026-07-10");
  assert.ok(Math.abs(bars[1].close - 109800.9) < 1e-9);
});

test("parseAlphaVantageDaily: series → sorted bars; Note → rate_limited SourceError", () => {
  const payload = {
    "Time Series (Daily)": {
      "2026-07-09": { "1. open": "80.1", "2. high": "81.0", "3. low": "79.5", "4. close": "80.7", "5. volume": "1" },
      "2026-07-08": { "1. open": "79.0", "2. high": "80.2", "3. low": "78.8", "4. close": "80.0", "5. volume": "1" },
    },
  };
  const bars = parseAlphaVantageDaily(payload, "CL");
  assert.deepEqual(bars.map((b) => b.date), ["2026-07-08", "2026-07-09"]);

  try {
    parseAlphaVantageDaily({ Note: "API call frequency is 25 requests per day" }, "CL");
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof SourceError);
    assert.equal(e.kind, "rate_limited");
  }
});

/* ── symbol mappings ──────────────────────────────────────────── */

test("stooqSymbolFor: US tickers get .us, dots→dashes, indices remapped, futures via altSymbols", () => {
  assert.equal(stooqSymbolFor(entry()), "aapl.us");
  assert.equal(stooqSymbolFor(entry({ symbol: "BRK-B" })), "brk-b.us");
  assert.equal(stooqSymbolFor(entry({ symbol: "^GSPC", assetClass: "index" })), "^spx");
  assert.equal(stooqSymbolFor(entry({ symbol: "CL=F", altSymbols: { stooq: "cl.f" } })), "cl.f");
  assert.equal(stooqSymbolFor(entry({ symbol: "GC=F" })), null); // no default futures mapping
});

test("binanceSymbolFor: BTC-USD → BTCUSDT; non-crypto → null", () => {
  assert.equal(binanceSymbolFor(entry({ symbol: "BTC-USD", assetClass: "crypto" })), "BTCUSDT");
  assert.equal(binanceSymbolFor(entry({ symbol: "AAPL" })), null);
});

/* ── staleness ────────────────────────────────────────────────── */

test("isStale: fresh within 7 days, stale beyond, empty always stale", () => {
  assert.equal(isStale([bar("2026-07-08")], "2026-07-10"), false);
  assert.equal(isStale([bar("2026-07-01")], "2026-07-10"), true);
  assert.equal(isStale([], "2026-07-10"), true);
});

/* ── fallback orchestration ───────────────────────────────────── */

function stubRegistry(behaviors: Record<string, () => Promise<RegimeBar[]>>): AdapterRegistry {
  return {
    get(id) {
      const adapter: BarSourceAdapter = {
        id,
        fetchDailyBars: () => {
          const fn = behaviors[id];
          if (!fn) throw new Error(`unexpected adapter ${id}`);
          return fn();
        },
      };
      return adapter;
    },
  };
}

const RUN = "2026-07-10";
const fresh = [bar("2026-07-08"), bar("2026-07-09")];

test("primary success: no fallback, health logs the primary", async () => {
  const calls: string[] = [];
  const reg = stubRegistry({
    yahoo: async () => { calls.push("yahoo"); return fresh; },
    stooq: async () => { calls.push("stooq"); return fresh; },
  });
  const r = await fetchBarsWithFallback(entry(), "1mo", RUN, reg);
  assert.deepEqual(calls, ["yahoo"]);
  assert.equal(r.bars?.length, 2);
  assert.equal(r.health.adapterUsed, "yahoo");
  assert.equal(r.health.fallbackReason, null);
  assert.equal(r.health.ok, true);
});

test("primary failure → fallback success, reason recorded for the outage audit", async () => {
  const reg = stubRegistry({
    yahoo: async () => { throw new SourceError("bull-yahoo", "upstream_error", "HTTP 502"); },
    stooq: async () => fresh,
  });
  const r = await fetchBarsWithFallback(entry(), "1mo", RUN, reg);
  assert.equal(r.health.adapterUsed, "stooq");
  assert.match(r.health.fallbackReason ?? "", /yahoo: upstream_error/);
  assert.equal(r.bars?.length, 2);
});

test("stale primary data also triggers the fallback", async () => {
  const reg = stubRegistry({
    yahoo: async () => [bar("2026-06-01")], // 5+ weeks old
    stooq: async () => fresh,
  });
  const r = await fetchBarsWithFallback(entry(), "1mo", RUN, reg);
  assert.equal(r.health.adapterUsed, "stooq");
  assert.match(r.health.fallbackReason ?? "", /yahoo: stale/);
});

test("every adapter failing → bars null, errors logged, NO throw", async () => {
  const reg = stubRegistry({
    yahoo: async () => { throw new SourceError("bull-yahoo", "network", "timeout"); },
    stooq: async () => { throw new Error("stooq exploded"); },
  });
  const r = await fetchBarsWithFallback(entry(), "1mo", RUN, reg);
  assert.equal(r.bars, null);
  assert.equal(r.health.ok, false);
  assert.equal(r.health.adapterUsed, null);
  assert.match(r.health.error ?? "", /yahoo: network/);
  assert.match(r.health.error ?? "", /stooq exploded/);
});

test("per-symbol chains differ: GC=F never consults Alpha Vantage", async () => {
  const gc = entry({
    symbol: "GC=F", assetClass: "metals",
    adapters: ["yahoo", "stooq"], altSymbols: { stooq: "gc.f" },
  });
  const consulted: string[] = [];
  const reg = stubRegistry({
    yahoo: async () => { consulted.push("yahoo"); throw new Error("down"); },
    stooq: async () => { consulted.push("stooq"); return fresh; },
    alphavantage: async () => { consulted.push("alphavantage"); return fresh; },
  });
  const r = await fetchBarsWithFallback(gc, "1mo", RUN, reg);
  assert.deepEqual(consulted, ["yahoo", "stooq"]);
  assert.equal(r.health.adapterUsed, "stooq");
});
