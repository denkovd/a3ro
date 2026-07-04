import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AlphaVantageSource } from "../src/sources/alphavantage";
import { SourceError } from "../src/core/types";

const avFixture = {
  name: "Crude Oil Prices: West Texas Intermediate (WTI)",
  interval: "daily",
  unit: "dollars per barrel",
  data: [
    {
      date: "2024-01-15",
      value: "78.50",
    },
    {
      date: "2024-01-14",
      value: ".",
    },
    {
      date: "2024-01-12",
      value: "75.30",
    },
  ],
};

describe("AlphaVantageSource", () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: string | undefined;

  const setupTest = () => {
    originalFetch = global.fetch;
    originalEnv = process.env.ALPHAVANTAGE_API_KEY;
    process.env.ALPHAVANTAGE_API_KEY = "test-key-av";
  };

  const teardownTest = () => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.ALPHAVANTAGE_API_KEY = originalEnv;
    } else {
      delete process.env.ALPHAVANTAGE_API_KEY;
    }
  };

  test("fetchLatest returns parsed records with dot (.) values skipped", async () => {
    setupTest();
    try {
      global.fetch = async (url: string | URL) => {
        const urlStr = String(url);
        // Return WTI fixture
        if (urlStr.includes("function=WTI")) {
          return new Response(JSON.stringify(avFixture), { status: 200 });
        }
        // Return Brent fixture
        const brentFixture = {
          name: "Crude Oil Prices: Brent Crude Oil",
          interval: "daily",
          unit: "dollars per barrel",
          data: [
            {
              date: "2024-01-15",
              value: "82.25",
            },
          ],
        };
        return new Response(JSON.stringify(brentFixture), { status: 200 });
      };

      const source = new AlphaVantageSource();
      const records = await source.fetchLatest(["WTI", "BRENT"]);

      // Should have 2 records (WTI and BRENT), the "." observation skipped
      assert.equal(records.length, 2);

      // Verify WTI record
      const wti = records.find((r) => r.benchmark === "WTI");
      assert.ok(wti);
      assert.equal(wti.benchmark, "WTI");
      assert.equal(wti.price, 78.5);
      assert.equal(wti.source, "alphavantage");
      assert.equal(wti.kind, "settlement");
      assert.ok(wti.periodDate);

      // Verify BRENT record
      const brent = records.find((r) => r.benchmark === "BRENT");
      assert.ok(brent);
      assert.equal(brent.benchmark, "BRENT");
      assert.equal(brent.price, 82.25);
      assert.equal(brent.source, "alphavantage");
    } finally {
      teardownTest();
    }
  });

  test("fetchLatest returns empty array when no supported benchmarks requested", async () => {
    setupTest();
    try {
      global.fetch = async () => new Response(JSON.stringify(avFixture), { status: 200 });

      const source = new AlphaVantageSource();
      const records = await source.fetchLatest([]);

      assert.equal(records.length, 0);
    } finally {
      teardownTest();
    }
  });

  test("missing API key throws auth SourceError", async () => {
    setupTest();
    try {
      delete process.env.ALPHAVANTAGE_API_KEY;
      global.fetch = async () => new Response(JSON.stringify(avFixture), { status: 200 });

      const source = new AlphaVantageSource();

      await assert.rejects(
        () => source.fetchLatest(["WTI"]),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "auth";
          }
          return false;
        }
      );
    } finally {
      teardownTest();
    }
  });

  test("HTTP 200 with Information key containing rate limit throws rate_limited SourceError", async () => {
    setupTest();
    try {
      const rateLimitResponse = {
        Information:
          "Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute...",
        data: [],
      };

      global.fetch = async () =>
        new Response(JSON.stringify(rateLimitResponse), { status: 200 });

      const source = new AlphaVantageSource();

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

  test("Error Message key with apikey text throws auth SourceError", async () => {
    setupTest();
    try {
      const errorResponse = {
        "Error Message": "the parameter apikey is invalid",
      };

      global.fetch = async () =>
        new Response(JSON.stringify(errorResponse), { status: 200 });

      const source = new AlphaVantageSource();

      await assert.rejects(
        () => source.fetchLatest(["WTI"]),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "auth";
          }
          return false;
        }
      );
    } finally {
      teardownTest();
    }
  });

  test("Error Message key without apikey text throws bad_payload SourceError", async () => {
    setupTest();
    try {
      const errorResponse = {
        "Error Message": "Invalid function specified",
      };

      global.fetch = async () =>
        new Response(JSON.stringify(errorResponse), { status: 200 });

      const source = new AlphaVantageSource();

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

  test("missing data array throws bad_payload SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ name: "test" }), { status: 200 });

      const source = new AlphaVantageSource();

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
        new Response('{"name": "test", "data": [invalid]}', { status: 200 });

      const source = new AlphaVantageSource();

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

  test("fetchRange filters historical records by date range", async () => {
    setupTest();
    try {
      const fullHistoryFixture = {
        name: "Crude Oil Prices: West Texas Intermediate (WTI)",
        interval: "daily",
        unit: "dollars per barrel",
        data: [
          {
            date: "2024-01-15",
            value: "78.50",
          },
          {
            date: "2024-01-12",
            value: "75.30",
          },
          {
            date: "2024-01-10",
            value: "72.00",
          },
          {
            date: "2024-01-09",
            value: "71.50",
          },
        ],
      };

      global.fetch = async () =>
        new Response(JSON.stringify(fullHistoryFixture), { status: 200 });

      const source = new AlphaVantageSource();
      const records = await source.fetchRange("WTI", "2024-01-10", "2024-01-15");

      // Should have 3 records (2024-01-15, 2024-01-12, 2024-01-10), excluding 2024-01-09
      assert.equal(records.length, 3);
      assert.equal(records[0].kind, "historical");
      assert.equal(records[0].periodDate, "2024-01-15");
      assert.equal(records[1].periodDate, "2024-01-12");
      assert.equal(records[2].periodDate, "2024-01-10");
    } finally {
      teardownTest();
    }
  });
});
