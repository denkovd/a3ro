import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FredSource } from "../src/sources/fred";
import { SourceError } from "../src/core/types";

const fredFixture = {
  observations: [
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

describe("FredSource", () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: string | undefined;

  const setupTest = () => {
    originalFetch = global.fetch;
    originalEnv = process.env.FRED_API_KEY;
    process.env.FRED_API_KEY = "test-key-fred";
  };

  const teardownTest = () => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.FRED_API_KEY = originalEnv;
    } else {
      delete process.env.FRED_API_KEY;
    }
  };

  test("fetchLatest returns parsed records with dot (.) values skipped", async () => {
    setupTest();
    try {
      // Mock both WTI and BRENT requests (parallel)
      global.fetch = async (url: string | URL) => {
        const urlStr = String(url);
        // Both series respond with the same fixture for this test
        if (urlStr.includes("DCOILWTICO") || urlStr.includes("DCOILBRENTEU")) {
          return new Response(JSON.stringify(fredFixture), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      };

      const source = new FredSource();
      const records = await source.fetchLatest(["WTI", "BRENT"]);

      // Should have 2 records (one WTI, one BRENT), the "." observation skipped
      assert.equal(records.length, 2);

      // Verify WTI record
      const wti = records.find((r) => r.benchmark === "WTI");
      assert.ok(wti);
      assert.equal(wti.benchmark, "WTI");
      assert.equal(wti.price, 78.5);
      assert.equal(wti.source, "fred");
      assert.equal(wti.kind, "settlement");

      // Verify BRENT record
      const brent = records.find((r) => r.benchmark === "BRENT");
      assert.ok(brent);
      assert.equal(brent.benchmark, "BRENT");
      assert.equal(brent.price, 78.5);
      assert.equal(brent.source, "fred");
    } finally {
      teardownTest();
    }
  });

  test("fetchLatest returns empty array when no supported benchmarks requested", async () => {
    setupTest();
    try {
      global.fetch = async () => new Response(JSON.stringify(fredFixture), { status: 200 });

      const source = new FredSource();
      const records = await source.fetchLatest([]);

      assert.equal(records.length, 0);
    } finally {
      teardownTest();
    }
  });

  test("missing API key throws auth SourceError", async () => {
    setupTest();
    try {
      delete process.env.FRED_API_KEY;
      global.fetch = async () => new Response(JSON.stringify(fredFixture), { status: 200 });

      const source = new FredSource();

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

  test("HTTP 400 with invalid API key text throws auth SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            error_code: 400,
            error_message: "Bad Request. The parameter apikey is invalid.",
          }),
          { status: 200 }
        );

      const source = new FredSource();

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

  test("malformed JSON response throws bad_payload SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response('{"observations": [invalid]}', { status: 200 });

      const source = new FredSource();

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

  test("missing observations array throws bad_payload SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ data: [] }), { status: 200 });

      const source = new FredSource();

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

  test("fetchRange returns historical records with dot values skipped", async () => {
    setupTest();
    try {
      const rangeFixture = {
        observations: [
          {
            date: "2024-01-10",
            value: "75.00",
          },
          {
            date: "2024-01-11",
            value: ".",
          },
          {
            date: "2024-01-12",
            value: "76.50",
          },
        ],
      };

      global.fetch = async () =>
        new Response(JSON.stringify(rangeFixture), { status: 200 });

      const source = new FredSource();
      const records = await source.fetchRange("WTI", "2024-01-10", "2024-01-12");

      // Should have 2 records (the "." is skipped)
      assert.equal(records.length, 2);
      assert.equal(records[0].kind, "historical");
      assert.equal(records[0].periodDate, "2024-01-10");
      assert.equal(records[1].periodDate, "2024-01-12");
    } finally {
      teardownTest();
    }
  });
});
