import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EiaUsGulfSource, mbblPerDayToMbPerDay } from "../src/sources/eiaCorridor";
import { SourceError } from "../src/core/types";
import crudeExportsFixture from "./fixtures/eia-corridor-crude-exports.json" with { type: "json" };
import refineryUtilFixture from "./fixtures/eia-corridor-refinery-utilization.json" with { type: "json" };

describe("EiaUsGulfSource", () => {
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

  /** Routes fetch by catalog route + series-id facet in the query string.
   *  (URLSearchParams percent-encodes the facet brackets, so match on the
   *  raw series id, which passes through unencoded.) */
  const stubFetchBySeries = () => {
    global.fetch = async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("petroleum/move/wkly/data") && urlStr.includes("WCREXUS2")) {
        return new Response(JSON.stringify(crudeExportsFixture), { status: 200 });
      }
      if (urlStr.includes("petroleum/pnp/wiup/data") && urlStr.includes("W_NA_YUP_R30_PER")) {
        return new Response(JSON.stringify(refineryUtilFixture), { status: 200 });
      }
      return new Response(JSON.stringify({ response: { data: [] } }), { status: 200 });
    };
  };

  test("mbblPerDayToMbPerDay divides by 1000", () => {
    assert.equal(mbblPerDayToMbPerDay(4123.5), 4.1235);
    assert.equal(mbblPerDayToMbPerDay(0), 0);
  });

  test("fetchLatest maps WCREXUS2 rows to crude_exports (value = raw/1000, unit Mb/d)", async () => {
    setupTest();
    try {
      stubFetchBySeries();
      const source = new EiaUsGulfSource();
      const records = await source.fetchLatest();

      const exportsRecords = records.filter((r) => r.metric === "crude_exports");
      // 3 fixture rows, 1 null → 2 usable rows
      assert.equal(exportsRecords.length, 2);

      const jan19 = exportsRecords.find((r) => r.periodDate === "2024-01-19");
      assert.ok(jan19);
      assert.equal(jan19.corridor, "usgulf");
      assert.equal(jan19.value, 4.1235); // 4123.5 / 1000
      assert.equal(jan19.unit, "Mb/d");
      assert.equal(jan19.source, "eia-usgulf");
      assert.equal(jan19.confidence, "official");
    } finally {
      teardownTest();
    }
  });

  test("fetchLatest maps W_NA_YUP_R30_PER rows to refinery_utilization (% unchanged)", async () => {
    setupTest();
    try {
      stubFetchBySeries();
      const source = new EiaUsGulfSource();
      const records = await source.fetchLatest();

      const utilRecords = records.filter((r) => r.metric === "refinery_utilization");
      assert.equal(utilRecords.length, 2);

      const jan19 = utilRecords.find((r) => r.periodDate === "2024-01-19");
      assert.ok(jan19);
      assert.equal(jan19.corridor, "usgulf");
      assert.equal(jan19.value, 93.4); // unchanged
      assert.equal(jan19.unit, "%");
    } finally {
      teardownTest();
    }
  });

  test("null-value rows are skipped silently", async () => {
    setupTest();
    try {
      stubFetchBySeries();
      const source = new EiaUsGulfSource();
      const records = await source.fetchLatest();

      // Both fixtures have a 2024-01-05 row with value: null
      const jan05 = records.filter((r) => r.periodDate === "2024-01-05");
      assert.equal(jan05.length, 0);
    } finally {
      teardownTest();
    }
  });

  test("string values are coerced to numbers", async () => {
    setupTest();
    try {
      stubFetchBySeries();
      const source = new EiaUsGulfSource();
      const records = await source.fetchLatest();

      // 2024-01-12 rows arrive as string values in both fixtures
      const exportsJan12 = records.find(
        (r) => r.metric === "crude_exports" && r.periodDate === "2024-01-12",
      );
      assert.ok(exportsJan12);
      assert.equal(exportsJan12.value, mbblPerDayToMbPerDay(4055.2));
      assert.equal(typeof exportsJan12.value, "number");

      const utilJan12 = records.find(
        (r) => r.metric === "refinery_utilization" && r.periodDate === "2024-01-12",
      );
      assert.ok(utilJan12);
      assert.equal(utilJan12.value, 91.8);
      assert.equal(typeof utilJan12.value, "number");
    } finally {
      teardownTest();
    }
  });

  test("raw audit copy is preserved (pre-normalization value + unit)", async () => {
    setupTest();
    try {
      stubFetchBySeries();
      const source = new EiaUsGulfSource();
      const records = await source.fetchLatest();

      const jan19 = records.find(
        (r) => r.metric === "crude_exports" && r.periodDate === "2024-01-19",
      );
      assert.ok(jan19);
      // raw.value is the pre-÷1000 number; raw.unit is the source's unit string
      assert.equal(jan19.raw.value, 4123.5);
      assert.equal(jan19.raw.unit, "MBBL/D");
      assert.equal(jan19.value, mbblPerDayToMbPerDay(jan19.raw.value));

      assert.deepEqual(jan19.meta, { seriesId: "WCREXUS2", endpoint: "petroleum/move/wkly" });
    } finally {
      teardownTest();
    }
  });

  test("missing API key throws auth SourceError", async () => {
    setupTest();
    try {
      delete process.env.EIA_API_KEY;
      stubFetchBySeries();

      const source = new EiaUsGulfSource();

      await assert.rejects(
        () => source.fetchLatest(),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "auth";
          }
          return false;
        },
      );
    } finally {
      teardownTest();
    }
  });

  test("HTTP 200 with error body throws the classified SourceError kind", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: "API key exceeded rate limit" }), { status: 200 });

      const source = new EiaUsGulfSource();

      await assert.rejects(
        () => source.fetchLatest(),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "rate_limited";
          }
          return false;
        },
      );
    } finally {
      teardownTest();
    }
  });

  test("bad period (not a calendar date) throws bad_payload SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({ response: { data: [{ period: "2024-W03", value: 10, units: "MBBL/D" }] } }),
          { status: 200 },
        );

      const source = new EiaUsGulfSource();

      await assert.rejects(
        () => source.fetchLatest(),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "bad_payload";
          }
          return false;
        },
      );
    } finally {
      teardownTest();
    }
  });

  test("a series returning zero usable rows is not an error", async () => {
    setupTest();
    try {
      global.fetch = async () => new Response(JSON.stringify({ response: { data: [] } }), { status: 200 });

      const source = new EiaUsGulfSource();
      const records = await source.fetchLatest();

      assert.equal(records.length, 0);
    } finally {
      teardownTest();
    }
  });
});
