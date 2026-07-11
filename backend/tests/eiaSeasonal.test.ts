import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isoWeekOf } from "../src/core/time";
import { groupByIsoWeek, fetchSeasonalBaselines, SEASONAL_METRICS } from "../src/sources/eiaSeasonal";
import { SourceError } from "../src/core/types";

describe("isoWeekOf — ISO-8601 week of year (UTC)", () => {
  test("known anchors", () => {
    assert.equal(isoWeekOf("2026-01-01"), 1); // Thursday → week 1
    assert.equal(isoWeekOf("2026-07-03"), 27); // Friday, Thursday Jul 2 = wk 27
    assert.equal(isoWeekOf("2026-07-11"), 28); // Saturday, Thursday Jul 9 = wk 28
    assert.equal(isoWeekOf("2024-12-30"), 1); // Monday of ISO week 1 of 2025
    assert.equal(isoWeekOf("2021-01-01"), 53); // Friday in week 53 of 2020
  });
});

describe("groupByIsoWeek — 5y rows → week-of-year bands", () => {
  const computedAt = "2026-07-11T00:00:00.000Z";

  test("computes mean/min/max/sampleCount per ISO week across years", () => {
    // The Friday of ISO week 27 in each of 5 consecutive years — one
    // bucket by construction (each date's week is asserted below).
    const rows = [
      { period: "2022-07-08", value: 420 },
      { period: "2023-07-07", value: 440 },
      { period: "2024-07-05", value: 460 },
      { period: "2025-07-04", value: 400 },
      { period: "2026-07-03", value: 410 },
    ];
    const wk = isoWeekOf("2026-07-03"); // 27
    assert.ok(rows.every((r) => isoWeekOf(r.period) === wk)); // sanity: one bucket
    const out = groupByIsoWeek("us_crude_stocks", rows, computedAt);
    assert.equal(out.length, 1);
    const band = out[0];
    assert.equal(band.isoWeek, wk);
    assert.equal(band.sampleCount, 5);
    assert.equal(band.meanValue, (420 + 440 + 460 + 400 + 410) / 5);
    assert.equal(band.minValue, 400);
    assert.equal(band.maxValue, 460);
    assert.equal(band.sampleFrom, "2022-07-08");
    assert.equal(band.sampleTo, "2026-07-03");
    assert.equal(band.metric, "us_crude_stocks");
  });

  test("drops thin weeks (< 3 samples) instead of emitting fake bands", () => {
    const rows = [
      // week 53 exists in only some years — 2 samples
      { period: "2020-12-31", value: 100 }, // wk 53
      { period: "2021-01-01", value: 101 }, // wk 53
      // a healthy week (ISO wk 27) with 3 samples
      { period: "2024-07-05", value: 420 },
      { period: "2025-07-04", value: 440 },
      { period: "2026-07-03", value: 460 },
    ];
    const out = groupByIsoWeek("gasoline_stocks", rows, computedAt);
    assert.equal(out.length, 1);
    assert.notEqual(out[0].isoWeek, 53);
    assert.equal(out[0].sampleCount, 3);
  });

  test("empty input → empty output", () => {
    assert.deepEqual(groupByIsoWeek("us_crude_stocks", [], computedAt), []);
  });
});

describe("fetchSeasonalBaselines — EIA 5y fetch + grouping", () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: string | undefined;

  const setup = () => {
    originalFetch = global.fetch;
    originalEnv = process.env.EIA_API_KEY;
    process.env.EIA_API_KEY = "test-key";
  };
  const teardown = () => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) process.env.EIA_API_KEY = originalEnv;
    else delete process.env.EIA_API_KEY;
  };

  test("fetches every seasonal metric, converts MBBL→Mbbl, groups by week", async () => {
    setup();
    try {
      const urls: string[] = [];
      global.fetch = async (url: string | URL) => {
        urls.push(String(url));
        // Three same-week rows (≥ MIN_SAMPLES) per series, raw MBBL.
        const data = [
          { period: "2024-07-05", value: "400000" },
          { period: "2025-07-04", value: "410000" },
          { period: "2026-07-03", value: 420000 },
        ];
        return new Response(JSON.stringify({ response: { data } }), { status: 200 });
      };
      const out = await fetchSeasonalBaselines(new Date("2026-07-11T00:00:00Z"));

      assert.equal(urls.length, SEASONAL_METRICS.length); // one call per series
      assert.ok(urls.every((u) => u.includes("direction%5D=asc") || u.includes("direction]=asc")));
      assert.ok(urls.every((u) => u.includes("start=2021-07-11")));
      assert.equal(out.length, SEASONAL_METRICS.length); // one band each
      for (const band of out) {
        assert.equal(band.sampleCount, 3);
        assert.equal(band.minValue, 400); // MBBL → Mbbl
        assert.equal(band.maxValue, 420);
      }
      const metrics = new Set(out.map((b) => b.metric));
      assert.deepEqual([...metrics].sort(), [...SEASONAL_METRICS].sort());
    } finally {
      teardown();
    }
  });

  test("missing api key fails with auth", async () => {
    setup();
    try {
      delete process.env.EIA_API_KEY;
      await assert.rejects(
        () => fetchSeasonalBaselines(new Date()),
        (e: unknown) => e instanceof SourceError && e.kind === "auth",
      );
    } finally {
      teardown();
    }
  });

  test("403 throttle body classifies as rate_limited", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response("rate exceeded, key temporarily suspended", { status: 403 });
      await assert.rejects(
        () => fetchSeasonalBaselines(new Date()),
        (e: unknown) => e instanceof SourceError && e.kind === "rate_limited",
      );
    } finally {
      teardown();
    }
  });
});
