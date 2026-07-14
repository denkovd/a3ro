import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fetchCalendarEarnings, fetchStockEarnings, safePct } from "../src/earnings/finnhub";

describe("safePct (§2/§5 edge cases)", () => {
  test("estimate = 0 -> null (avoids divide-by-zero / ±∞ surprise)", () => {
    assert.equal(safePct(5, 0), null);
  });
  test("estimate = null -> null (no estimate / undefined surprise)", () => {
    assert.equal(safePct(5, null), null);
  });
  test("actual = null -> null (defensive)", () => {
    assert.equal(safePct(null, 5), null);
  });
  test("normal case", () => {
    assert.ok(Math.abs(safePct(11, 10)! - 10) < 1e-9);
  });
  test("negative estimate uses abs(estimate) in the denominator", () => {
    // actual=-2, estimate=-4 -> ((-2)-(-4))/abs(-4) * 100 = 2/4*100 = 50
    assert.ok(Math.abs(safePct(-2, -4)! - 50) < 1e-9);
  });
});

describe("Finnhub adapter parsing", () => {
  let originalFetch: typeof global.fetch;
  let originalKey: string | undefined;

  const setup = () => {
    originalFetch = global.fetch;
    originalKey = process.env.FINNHUB_API_KEY;
    process.env.FINNHUB_API_KEY = "test-key";
  };
  const teardown = () => {
    global.fetch = originalFetch;
    if (originalKey !== undefined) process.env.FINNHUB_API_KEY = originalKey;
    else delete process.env.FINNHUB_API_KEY;
  };

  test("fetchCalendarEarnings: parses rows, drops malformed entries", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            earningsCalendar: [
              { symbol: "NVDA", date: "2026-05-28", hour: "amc", year: 2026, quarter: 1, epsActual: 0.96, epsEstimate: 0.88, revenueActual: 44060000000, revenueEstimate: 43310000000 },
              { symbol: "ACME", date: "2026-05-20", hour: "xyz", year: 2026, quarter: 1, epsActual: null, epsEstimate: 0.5, revenueActual: null, revenueEstimate: 1000 },
              { date: "missing-symbol" }, // malformed -> dropped
            ],
          }),
          { status: 200 },
        );
      const rows = await fetchCalendarEarnings("2026-05-20", "2026-05-28");
      assert.equal(rows.length, 2);
      assert.equal(rows[0].symbol, "NVDA");
      assert.equal(rows[0].hour, "amc");
      assert.equal(rows[1].hour, null); // unrecognized "xyz" -> null, never guessed
      assert.equal(rows[1].epsActual, null); // "not yet reported" shape preserved for pipeline to filter
    } finally {
      teardown();
    }
  });

  test("fetchStockEarnings: parses bare array response", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify([
            { symbol: "NVDA", period: "2026-04-30", year: 2026, quarter: 1, actual: 0.96, estimate: 0.88, surprise: 0.08, surprisePercent: 9.09 },
          ]),
          { status: 200 },
        );
      const rows = await fetchStockEarnings("NVDA");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].period, "2026-04-30");
      assert.equal(rows[0].surprisePercent, 9.09);
    } finally {
      teardown();
    }
  });
});
