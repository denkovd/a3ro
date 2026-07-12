import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EiaSpotProductsSource,
  dollarsPerGallonToPerBarrel,
  GALLONS_PER_BARREL,
} from "../src/sources/eiaSpotProducts";
import { SourceError } from "../src/core/types";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe("EiaSpotProductsSource", () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: string | undefined;

  const setup = () => {
    originalFetch = global.fetch;
    originalEnv = process.env.EIA_API_KEY;
    process.env.EIA_API_KEY = "test-key-12345";
  };
  const teardown = () => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) process.env.EIA_API_KEY = originalEnv;
    else delete process.env.EIA_API_KEY;
  };

  /** Route by series-id facet — all three share the pri/spt route. */
  const stub = () => {
    global.fetch = async (url: string | URL) => {
      const u = String(url);
      const row = (series: string, value: string, units: string) =>
        new Response(
          JSON.stringify({ response: { data: [{ period: "2026-07-06", series, value, units }] } }),
          { status: 200 },
        );
      if (u.includes("EER_EPMRU_PF4_Y35NY_DPG")) return row("EER_EPMRU_PF4_Y35NY_DPG", "3.006", "$/GAL");
      if (u.includes("EER_EPD2F_PF4_Y35NY_DPG")) return row("EER_EPD2F_PF4_Y35NY_DPG", "3.206", "$/GAL");
      if (u.includes("RWTC")) return row("RWTC", "69.6", "$/BBL");
      return new Response(JSON.stringify({ response: { data: [] } }), { status: 200 });
    };
  };

  test("dollarsPerGallonToPerBarrel multiplies by 42", () => {
    assert.equal(GALLONS_PER_BARREL, 42);
    assert.ok(near(dollarsPerGallonToPerBarrel(3), 126));
    assert.equal(dollarsPerGallonToPerBarrel(0), 0);
  });

  test("fetchLatest maps the three series to $/bbl under usgulf", async () => {
    setup();
    try {
      stub();
      const records = await new EiaSpotProductsSource().fetchLatest();
      const byMetric = new Map(records.map((r) => [r.metric, r]));

      const gas = byMetric.get("gasoline_spot");
      assert.ok(gas);
      assert.ok(near(gas.value, 3.006 * 42)); // $/gal → $/bbl
      assert.equal(gas.unit, "$/bbl");
      assert.equal(gas.corridor, "usgulf");
      assert.equal(gas.periodDate, "2026-07-06");
      assert.equal(gas.raw.value, 3.006);
      assert.equal(gas.source, "eia-spot-products");
      assert.deepEqual(gas.meta, { seriesId: "EER_EPMRU_PF4_Y35NY_DPG", endpoint: "petroleum/pri/spt" });

      assert.ok(near(byMetric.get("heating_oil_spot")!.value, 3.206 * 42));
      const wti = byMetric.get("wti_spot")!;
      assert.equal(wti.value, 69.6); // crude passes through unscaled
      assert.equal(wti.unit, "$/bbl");
      assert.ok(records.every((r) => r.corridor === "usgulf"));
    } finally {
      teardown();
    }
  });

  test("skips null-value rows (holiday gaps) without erroring", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            response: {
              data: [
                { period: "2026-07-06", series: "RWTC", value: null, units: "$/BBL" },
                { period: "2026-07-02", series: "RWTC", value: "69.73", units: "$/BBL" },
              ],
            },
          }),
          { status: 200 },
        );
      const records = await new EiaSpotProductsSource().fetchLatest();
      const wti = records.filter((r) => r.metric === "wti_spot");
      assert.equal(wti.length, 1);
      assert.equal(wti[0].periodDate, "2026-07-02");
    } finally {
      teardown();
    }
  });

  test("fails with auth when EIA_API_KEY is not set", async () => {
    setup();
    try {
      delete process.env.EIA_API_KEY;
      await assert.rejects(
        () => new EiaSpotProductsSource().fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "auth",
      );
    } finally {
      teardown();
    }
  });

  test("classifies 403 throttle-text as rate_limited", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response("API key request rate exceeded, key temporarily suspended", { status: 403 });
      await assert.rejects(
        () => new EiaSpotProductsSource().fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "rate_limited",
      );
    } finally {
      teardown();
    }
  });

  test("rejects a non-calendar period as bad_payload", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({ response: { data: [{ period: "2026-Q1", value: "3.0", units: "$/GAL" }] } }),
          { status: 200 },
        );
      await assert.rejects(
        () => new EiaSpotProductsSource().fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "bad_payload",
      );
    } finally {
      teardown();
    }
  });
});
