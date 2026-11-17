import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  nextEarningsBySymbol,
  parseCoinGeckoMarkets,
  parseFinnhubMetrics,
  parseFinnhubProfile,
  toEarningsQuarters,
  toFinnhubSymbol,
} from "../src/profiles/sources";
import { runDailyProfiles, runWeeklyProfiles } from "../src/profiles/pipeline";
import { COINGECKO_IDS } from "../src/profiles/coingeckoIds";
import { CRYPTO } from "../src/bull/universeData";
import type { BullUniverseEntry } from "../src/bull/types";

describe("Finnhub parsing", () => {
  test("profile2: converts millions to units, validates urls, null for empty payloads", () => {
    const p = parseFinnhubProfile({
      name: "Apple Inc", exchange: "NASDAQ NMS - GLOBAL MARKET", country: "US", currency: "USD",
      finnhubIndustry: "Technology", ipo: "1980-12-12", weburl: "https://www.apple.com/",
      logo: "javascript:alert(1)", shareOutstanding: 15204.137, marketCapitalization: 3500000.5,
    });
    assert.ok(p);
    assert.equal(p.sharesOutstanding, 15204.137 * 1e6);
    assert.equal(p.marketCap, 3500000.5 * 1e6);
    assert.equal(p.website, "https://www.apple.com/");
    assert.equal(p.logoUrl, null, "non-http(s) urls are dropped");
    assert.equal(p.ipoDate, "1980-12-12");
    assert.equal(parseFinnhubProfile({}), null);
  });

  test("metric: picks fallbacks, never coerces missing to 0", () => {
    const m = parseFinnhubMetrics({ metric: { "52WeekHigh": 260.1, "52WeekLow": 164.08, peBasicExclExtraTTM: 38.2, beta: 1.2 } });
    assert.deepEqual(m, { week52High: 260.1, week52Low: 164.08, peTtm: 38.2, beta: 1.2, dividendYieldPct: null });
    assert.equal(parseFinnhubMetrics({ metric: {} }), null);
    assert.equal(parseFinnhubMetrics(null), null);
  });

  test("earnings quarters: newest first, deduped, capped", () => {
    const row = (year: number, quarter: number, actual: number) =>
      ({ period: `${year}-0${quarter * 3}-30`, year, quarter, actual, estimate: 1, surprisePercent: (actual - 1) * 100 });
    const q = toEarningsQuarters([row(2025, 1, 1.1), row(2025, 3, 1.3), row(2025, 2, 1.2), row(2025, 3, 9)], 2);
    assert.deepEqual(q.map((x) => `${x.year}Q${x.quarter}`), ["2025Q3", "2025Q2"]);
    assert.equal(q[0].actual, 1.3, "first occurrence wins on duplicates");
  });

  test("next earnings: earliest upcoming per symbol, past dates ignored", () => {
    const m = nextEarningsBySymbol([
      { symbol: "AAPL", date: "2026-11-10", hour: "amc" },
      { symbol: "AAPL", date: "2027-01-29", hour: "amc" },
      { symbol: "AAPL", date: "2026-12-30", hour: null },
      { symbol: "BRK.B", date: "2026-11-20", hour: "bmo" },
    ], "2026-11-17");
    assert.deepEqual(m.get("AAPL"), { date: "2026-12-30", hour: null });
    assert.equal(m.get("BRK.B")?.date, "2026-11-20");
  });

  test("symbol notation", () => {
    assert.equal(toFinnhubSymbol("BRK-B"), "BRK.B");
    assert.equal(toFinnhubSymbol("NVDA"), "NVDA");
  });
});

describe("CoinGecko parsing + id map", () => {
  test("markets: maps fields, drops rows without id", () => {
    const [c, ...rest] = parseCoinGeckoMarkets([
      { id: "bitcoin", name: "Bitcoin", market_cap: 1.9e12, market_cap_rank: 1, total_volume: 3.1e10,
        circulating_supply: 19.9e6, total_supply: 19.9e6, max_supply: 21e6, ath: 126000,
        ath_date: "2025-10-06T18:57:42.558Z", ath_change_percentage: -24.5, image: "https://coin-images.coingecko.com/x.png" },
      { name: "no id" },
    ]);
    assert.equal(rest.length, 0);
    assert.equal(c.id, "bitcoin");
    assert.equal(c.athDate, "2025-10-06");
    assert.equal(c.maxSupply, 21e6);
    assert.deepEqual(parseCoinGeckoMarkets({ error: "x" }), []);
  });

  test("every crypto in the scan universe has a CoinGecko id", () => {
    for (const [sym] of CRYPTO) assert.ok(COINGECKO_IDS[sym], `missing id for ${sym}`);
    assert.ok(COINGECKO_IDS["BTC-USD"]);
    assert.equal(new Set(Object.values(COINGECKO_IDS)).size, Object.keys(COINGECKO_IDS).length, "ids are unique");
  });
});

/* ── pipelines with a fake network + fake db ── */

type Call = { sql: string; params: unknown[] };
function fakeDb() {
  const calls: Call[] = [];
  return { calls, db: { query: async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return { rows: [], rowCount: 1 }; } } };
}

function withFetch(handler: (url: URL) => unknown, fn: () => Promise<void>) {
  return async () => {
    const original = global.fetch;
    const key = process.env.FINNHUB_API_KEY;
    process.env.FINNHUB_API_KEY = "test-key";
    global.fetch = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const body = handler(url);
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try { await fn(); } finally {
      global.fetch = original;
      if (key === undefined) delete process.env.FINNHUB_API_KEY; else process.env.FINNHUB_API_KEY = key;
    }
  };
}

const entry = (symbol: string, tier: BullUniverseEntry["tier"]) =>
  ({ symbol, displayName: symbol, tier, assetClass: tier === "etf" ? "etf" : "equity", adapters: ["yahoo"] }) as BullUniverseEntry;

test("weekly: equities get profile+metric+earnings, ETFs skip earnings, empty symbols are reported not written",
  withFetch((url) => {
    const sym = url.searchParams.get("symbol");
    if (url.pathname.endsWith("/stock/profile2")) return sym === "ZZZZ" ? {} : { name: sym, shareOutstanding: 10 };
    if (url.pathname.endsWith("/stock/metric")) return sym === "ZZZZ" ? { metric: {} } : { metric: { beta: 1.1 } };
    if (url.pathname.endsWith("/stock/earnings")) {
      if (sym === "ZZZZ") return [];
      return [{ symbol: sym, period: "2025-09-30", year: 2025, quarter: 3, actual: 1.2, estimate: 1, surprise: 0.2, surprisePercent: 20 }];
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const { db, calls } = fakeDb();
    const seen: string[] = [];
    const origFetch = global.fetch;
    global.fetch = (async (i: string | URL | Request) => { seen.push(String(i)); return origFetch(i); }) as typeof fetch;
    const r = await runWeeklyProfiles(db, {
      universe: [entry("BRK-B", "us_large"), entry("SPY", "etf"), entry("ZZZZ", "ndx_extra"), entry("BTC-USD", "macro")],
      sleep: async () => {},
    });
    assert.equal(r.attempted, 3, "macro tier is not a Finnhub target");
    assert.equal(r.written, 2);
    assert.deepEqual(r.empty, ["ZZZZ"]);
    assert.ok(seen.some((u) => u.includes("symbol=BRK.B")), "uses Finnhub notation");
    assert.ok(!seen.some((u) => u.includes("/stock/earnings") && u.includes("symbol=SPY")), "no earnings call for ETFs");
    const brk = calls.find((c) => c.params[0] === "BRK-B")!;
    assert.equal(brk.params[1], "BRK.B");
    assert.equal(brk.params[10], 10e6, "shares stored in units");
    assert.equal(JSON.parse(brk.params[17] as string)[0].surprisePct, 20);
    const spy = calls.find((c) => c.params[0] === "SPY")!;
    assert.equal(spy.params[17], null, "ETF earnings left untouched (coalesce keeps old)");
  }));

test("daily: next earnings + crypto, unmatched ids reported",
  withFetch((url) => {
    if (url.pathname.endsWith("/calendar/earnings")) {
      return { earningsCalendar: [
        { symbol: "BRK.B", date: "2026-11-20", hour: "bmo", year: 2026, quarter: 3 },
        { symbol: "NOTINUNIVERSE", date: "2026-11-21", hour: "amc", year: 2026, quarter: 3 },
      ] };
    }
    if (url.hostname === "api.coingecko.com") {
      assert.equal(url.searchParams.get("ids"), "bitcoin,ethereum");
      return [{ id: "bitcoin", name: "Bitcoin", market_cap: 1 }];
    }
    return new Response("not found", { status: 404 });
  }, async () => {
    const { db, calls } = fakeDb();
    const r = await runDailyProfiles(db, {
      universe: [entry("BRK-B", "us_large"), { ...entry("BTC-USD", "macro"), assetClass: "crypto" }, { ...entry("ETH-USD", "crypto"), assetClass: "crypto" }],
      today: "2026-11-17",
    });
    assert.equal(r.nextEarningsWritten, 1);
    assert.equal(r.written, 1);
    assert.deepEqual(r.cryptoUnmatched, ["ETH-USD→ethereum"]);
    assert.ok(calls.some((c) => c.sql.includes("next_earnings_date = $2") && c.params[0] === "BRK-B" && c.params[1] === "2026-11-20"));
    assert.deepEqual(r.failed, []);
  }));
