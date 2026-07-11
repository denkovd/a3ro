import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EiaInventorySource, thousandBblToMillionBbl } from "../src/sources/eiaInventory";
import { SourceError } from "../src/core/types";
import usCrudeFixture from "./fixtures/eia-inventory-us-crude-stocks.json" with { type: "json" };
import cushingFixture from "./fixtures/eia-inventory-cushing-stocks.json" with { type: "json" };

describe("EiaInventorySource", () => {
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

  /** Routes fetch by series-id facet in the query string (both series
   *  share the petroleum/stoc/wstk catalog route, so the series id —
   *  which passes through URLSearchParams unencoded — is the router). */
  const stubFetchBySeries = () => {
    global.fetch = async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("petroleum/stoc/wstk/data") && urlStr.includes("WCESTUS1")) {
        return new Response(JSON.stringify(usCrudeFixture), { status: 200 });
      }
      if (
        urlStr.includes("petroleum/stoc/wstk/data") &&
        urlStr.includes("W_EPC0_SAX_YCUOK_MBBL")
      ) {
        return new Response(JSON.stringify(cushingFixture), { status: 200 });
      }
      return new Response(JSON.stringify({ response: { data: [] } }), { status: 200 });
    };
  };

  test("thousandBblToMillionBbl divides by 1000", () => {
    assert.equal(thousandBblToMillionBbl(411357), 411.357);
    assert.equal(thousandBblToMillionBbl(0), 0);
  });

  test("fetchLatest maps WCESTUS1 rows to us_crude_stocks (value = raw/1000, unit Mbbl)", async () => {
    setupTest();
    try {
      stubFetchBySeries();
      const source = new EiaInventorySource();
      const records = await source.fetchLatest();

      const usRecords = records.filter((r) => r.metric === "us_crude_stocks");
      // 3 fixture rows, 1 null → 2 usable rows
      assert.equal(usRecords.length, 2);

      const jul3 = usRecords.find((r) => r.periodDate === "2026-07-03");
      assert.ok(jul3);
      assert.equal(jul3.corridor, "usgulf");
      assert.equal(jul3.value, 411.357); // string "411357" parsed then ÷1000
      assert.equal(jul3.unit, "Mbbl");
      assert.equal(jul3.raw.value, 411357);
      assert.equal(jul3.raw.unit, "MBBL");
      assert.equal(jul3.source, "eia-inventories");
      assert.equal(jul3.confidence, "official");
      assert.equal(jul3.observedAt, "2026-07-03T00:00:00.000Z");
      assert.deepEqual(jul3.meta, { seriesId: "WCESTUS1", endpoint: "petroleum/stoc/wstk" });

      const jun26 = usRecords.find((r) => r.periodDate === "2026-06-26");
      assert.ok(jun26);
      assert.equal(jun26.value, 408.359); // numeric value path
    } finally {
      teardownTest();
    }
  });

  test("fetchLatest maps Cushing rows to cushing_stocks and skips stray-series echoes", async () => {
    setupTest();
    try {
      stubFetchBySeries();
      const source = new EiaInventorySource();
      const records = await source.fetchLatest();

      const cushing = records.filter((r) => r.metric === "cushing_stocks");
      // 3 fixture rows, 1 stray series id → 2 usable rows
      assert.equal(cushing.length, 2);
      assert.ok(cushing.every((r) => r.corridor === "usgulf"));
      assert.ok(!records.some((r) => r.raw.value === 99999)); // stray row skipped

      const jul3 = cushing.find((r) => r.periodDate === "2026-07-03");
      assert.ok(jul3);
      assert.equal(jul3.value, 19.614);
      assert.equal(jul3.unit, "Mbbl");
    } finally {
      teardownTest();
    }
  });

  test("fails with auth when EIA_API_KEY is not set", async () => {
    setupTest();
    try {
      delete process.env.EIA_API_KEY;
      const source = new EiaInventorySource();
      await assert.rejects(
        () => source.fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "auth",
      );
    } finally {
      teardownTest();
    }
  });

  test("classifies 403 throttle-text as rate_limited", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response("API key request rate exceeded, key temporarily suspended", { status: 403 });
      const source = new EiaInventorySource();
      await assert.rejects(
        () => source.fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "rate_limited",
      );
    } finally {
      teardownTest();
    }
  });

  test("classifies 200-with-error-body via textToKind (invalid key → auth)", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: "invalid api_key supplied" }), { status: 200 });
      const source = new EiaInventorySource();
      await assert.rejects(
        () => source.fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "auth",
      );
    } finally {
      teardownTest();
    }
  });

  test("maps the P5 series family: gasoline/distillate/SPR stocks + US-total utilization", async () => {
    setupTest();
    try {
      // One synthetic row per requested series, routed by series id.
      global.fetch = async (url: string | URL) => {
        const u = String(url);
        const row = (series: string, value: string, units: string) =>
          new Response(
            JSON.stringify({ response: { data: [{ period: "2026-07-03", series, value, units }] } }),
            { status: 200 },
          );
        if (u.includes("WGTSTUS1")) return row("WGTSTUS1", "212062", "MBBL");
        if (u.includes("WDISTUS1")) return row("WDISTUS1", "103619", "MBBL");
        if (u.includes("WCSSTUS1")) return row("WCSSTUS1", "319489", "MBBL");
        if (u.includes("WPULEUS3")) {
          assert.match(u, /petroleum\/pnp\/wiup\/data/); // utilization lives on its own route
          return row("WPULEUS3", "95.8", "%");
        }
        return new Response(JSON.stringify({ response: { data: [] } }), { status: 200 });
      };
      const records = await new EiaInventorySource().fetchLatest();

      const byMetric = new Map(records.map((r) => [r.metric, r]));
      assert.equal(byMetric.get("gasoline_stocks")?.value, 212.062);
      assert.equal(byMetric.get("gasoline_stocks")?.unit, "Mbbl");
      assert.equal(byMetric.get("distillate_stocks")?.value, 103.619);
      assert.equal(byMetric.get("spr_stocks")?.value, 319.489);
      assert.equal(byMetric.get("us_refinery_utilization")?.value, 95.8); // % passes through
      assert.equal(byMetric.get("us_refinery_utilization")?.unit, "%");
      assert.ok(records.every((r) => r.corridor === "usgulf"));
    } finally {
      teardownTest();
    }
  });

  test("rejects a non-calendar period as bad_payload", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            response: { data: [{ period: "2026-Q1", value: "1000", units: "MBBL" }] },
          }),
          { status: 200 },
        );
      const source = new EiaInventorySource();
      await assert.rejects(
        () => source.fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "bad_payload",
      );
    } finally {
      teardownTest();
    }
  });
});
