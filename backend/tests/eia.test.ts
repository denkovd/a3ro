import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EiaSource } from "../src/sources/eia";
import { SourceError } from "../src/core/types";

const eiaFixture = {
  response: {
    total: 3,
    data: [
      {
        period: "2024-01-15",
        series: "RWTC",
        "series-description": "Crude Oil Prices: West Texas Intermediate (WTI) - Cushing, OK Spot Price FOB",
        value: 78.5,
        units: "$/BBL",
      },
      {
        period: "2024-01-15",
        series: "RBRTE",
        "series-description": "Crude Oil Prices: Brent Crude Oil - Europe Spot Price FOB",
        value: 82.25,
        units: "$/BBL",
      },
      {
        period: "2024-01-14",
        series: "RWTC",
        "series-description": "Crude Oil Prices: West Texas Intermediate (WTI) - Cushing, OK Spot Price FOB",
        value: null,
        units: "$/BBL",
      },
    ],
  },
};

describe("EiaSource", () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: string | undefined;

  const setupTest = () => {
    originalFetch = global.fetch;
    originalEnv = process.env.EIA_API_KEY;
    process.env.EIA_API_KEY = "test-key-12345";
  };

  const teardownTest = () => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.EIA_API_KEY = originalEnv;
    } else {
      delete process.env.EIA_API_KEY;
    }
  };

  test("fetchLatest returns parsed records with null values skipped", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify(eiaFixture), { status: 200 });

      const source = new EiaSource();
      const records = await source.fetchLatest(["WTI", "BRENT"]);

      // Should have 2 records (WTI and BRENT from 2024-01-15), null value skipped
      assert.equal(records.length, 2);

      // WTI record
      const wti = records.find((r) => r.benchmark === "WTI");
      assert.ok(wti);
      assert.equal(wti.benchmark, "WTI");
      assert.equal(wti.price, 78.5);
      assert.equal(wti.source, "eia");
      assert.equal(wti.kind, "settlement");
      assert.ok(wti.periodDate);

      // BRENT record
      const brent = records.find((r) => r.benchmark === "BRENT");
      assert.ok(brent);
      assert.equal(brent.benchmark, "BRENT");
      assert.equal(brent.price, 82.25);
      assert.equal(brent.source, "eia");
      assert.equal(brent.kind, "settlement");
    } finally {
      teardownTest();
    }
  });

  test("fetchLatest returns empty array when no supported benchmarks requested", async () => {
    setupTest();
    try {
      global.fetch = async () => new Response(JSON.stringify(eiaFixture), { status: 200 });

      const source = new EiaSource();
      const records = await source.fetchLatest([]);

      assert.equal(records.length, 0);
    } finally {
      teardownTest();
    }
  });

  test("missing API key throws auth SourceError", async () => {
    setupTest();
    try {
      delete process.env.EIA_API_KEY;
      global.fetch = async () => new Response(JSON.stringify(eiaFixture), { status: 200 });

      const source = new EiaSource();

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

  test("HTTP 403 with rate limit text throws rate_limited SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response("API key exceeded rate limit", { status: 403 });

      const source = new EiaSource();

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

  test("bad JSON response throws bad_payload SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response('{"invalid": json}', { status: 200 });

      const source = new EiaSource();

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

  test("fetchRange returns historical records for a date range", async () => {
    setupTest();
    try {
      const rangeFixture = {
        response: {
          total: 2,
          data: [
            {
              period: "2024-01-10",
              series: "RWTC",
              value: 75.0,
              units: "$/BBL",
            },
            {
              period: "2024-01-11",
              series: "RWTC",
              value: 76.5,
              units: "$/BBL",
            },
          ],
        },
      };

      global.fetch = async () =>
        new Response(JSON.stringify(rangeFixture), { status: 200 });

      const source = new EiaSource();
      const records = await source.fetchRange("WTI", "2024-01-10", "2024-01-11");

      assert.equal(records.length, 2);
      assert.equal(records[0].kind, "historical");
      assert.equal(records[1].kind, "historical");
      assert.equal(records[0].periodDate, "2024-01-10");
      assert.equal(records[1].periodDate, "2024-01-11");
    } finally {
      teardownTest();
    }
  });
});
