import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { YFinanceSource } from "../src/sources/yfinance";
import { SourceError } from "../src/core/types";

const yahooFixture = {
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: 79.45,
          regularMarketTime: 1705357200,
          currency: "USD",
          symbol: "CL=F",
          exchangeName: "NYMEX",
        },
        timestamp: [1705357200, 1705270800],
        indicators: {
          quote: [
            {
              close: [79.45, 78.5],
            },
          ],
        },
      },
    ],
    error: null,
  },
};

describe("YFinanceSource", () => {
  let originalFetch: typeof global.fetch;

  const setupTest = () => {
    originalFetch = global.fetch;
  };

  const teardownTest = () => {
    global.fetch = originalFetch;
  };

  test("fetchLatest returns live price records from Yahoo Finance", async () => {
    setupTest();
    try {
      global.fetch = async (url: string | URL) => {
        const urlStr = String(url);
        // Return different prices for WTI and Brent
        if (urlStr.includes("CL=F")) {
          return new Response(JSON.stringify(yahooFixture), { status: 200 });
        }
        // Brent fixture
        const brentFixture = {
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 84.25,
                  regularMarketTime: 1705357200,
                  currency: "USD",
                  symbol: "BZ=F",
                  exchangeName: "ICE",
                },
                timestamp: [1705357200],
                indicators: {
                  quote: [{ close: [84.25] }],
                },
              },
            ],
            error: null,
          },
        };
        return new Response(JSON.stringify(brentFixture), { status: 200 });
      };

      const source = new YFinanceSource();
      const records = await source.fetchLatest(["WTI", "BRENT"]);

      assert.equal(records.length, 2);

      // WTI record
      const wti = records.find((r) => r.benchmark === "WTI");
      assert.ok(wti);
      assert.equal(wti.benchmark, "WTI");
      assert.equal(wti.price, 79.45);
      assert.equal(wti.source, "yfinance");
      assert.equal(wti.kind, "live");
      assert.ok(wti.observedAt); // live records have observedAt, not periodDate
      assert.equal(wti.periodDate, undefined);

      // BRENT record
      const brent = records.find((r) => r.benchmark === "BRENT");
      assert.ok(brent);
      assert.equal(brent.benchmark, "BRENT");
      assert.equal(brent.price, 84.25);
      assert.equal(brent.source, "yfinance");
      assert.equal(brent.kind, "live");
    } finally {
      teardownTest();
    }
  });

  test("fetchLatest returns empty array when no supported benchmarks requested", async () => {
    setupTest();
    try {
      global.fetch = async () => new Response(JSON.stringify(yahooFixture), { status: 200 });

      const source = new YFinanceSource();
      const records = await source.fetchLatest([]);

      assert.equal(records.length, 0);
    } finally {
      teardownTest();
    }
  });

  test("chart.error non-null throws bad_payload SourceError", async () => {
    setupTest();
    try {
      const errorFixture = {
        chart: {
          result: [],
          error: {
            code: "No data",
            description: "No data found, symbol invalid [CL=Z].",
          },
        },
      };

      global.fetch = async () =>
        new Response(JSON.stringify(errorFixture), { status: 200 });

      const source = new YFinanceSource();

      await assert.rejects(
        () => source.fetchLatest(["WTI"]),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "bad_payload";
          }
          return false;
        }
      );
    } finally {
      teardownTest();
    }
  });

  test("chart.error with rate-limit text throws rate_limited SourceError", async () => {
    setupTest();
    try {
      const rateLimitFixture = {
        chart: {
          result: [],
          error: {
            code: "Rate Limit",
            description: "Too many requests, you have been rate limited.",
          },
        },
      };

      global.fetch = async () =>
        new Response(JSON.stringify(rateLimitFixture), { status: 200 });

      const source = new YFinanceSource();

      await assert.rejects(
        () => source.fetchLatest(["WTI"]),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "rate_limited";
          }
          return false;
        }
      );
    } finally {
      teardownTest();
    }
  });

  test("missing meta throws bad_payload SourceError", async () => {
    setupTest();
    try {
      const badFixture = {
        chart: {
          result: [
            {
              timestamp: [1705357200],
              indicators: {
                quote: [{ close: [79.45] }],
              },
              // missing meta
            },
          ],
          error: null,
        },
      };

      global.fetch = async () =>
        new Response(JSON.stringify(badFixture), { status: 200 });

      const source = new YFinanceSource();

      await assert.rejects(
        () => source.fetchLatest(["WTI"]),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "bad_payload";
          }
          return false;
        }
      );
    } finally {
      teardownTest();
    }
  });

  test("missing result array throws bad_payload SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ chart: { error: null } }), {
          status: 200,
        });

      const source = new YFinanceSource();

      await assert.rejects(
        () => source.fetchLatest(["WTI"]),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "bad_payload";
          }
          return false;
        }
      );
    } finally {
      teardownTest();
    }
  });

  test("malformed JSON response throws bad_payload SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response('{"chart": {invalid}}', { status: 200 });

      const source = new YFinanceSource();

      await assert.rejects(
        () => source.fetchLatest(["WTI"]),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "bad_payload";
          }
          return false;
        }
      );
    } finally {
      teardownTest();
    }
  });

  test("fetchRange returns empty array (not implemented)", async () => {
    setupTest();
    try {
      global.fetch = async () => new Response(JSON.stringify(yahooFixture), { status: 200 });

      const source = new YFinanceSource();
      const records = await source.fetchRange("WTI", "2024-01-10", "2024-01-15");

      // fetchRange is not implemented for Yahoo, returns empty
      assert.equal(records.length, 0);
    } finally {
      teardownTest();
    }
  });
});
