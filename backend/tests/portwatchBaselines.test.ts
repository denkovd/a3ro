import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fetchGateBaselines } from "../src/sources/portwatchBaselines";
import { tonsToMegatons } from "../src/sources/portwatch";
import { SourceError } from "../src/core/types";
import baselines1yFixture from "./fixtures/portwatch-baselines-1y.json" with { type: "json" };
import baselines5yFixture from "./fixtures/portwatch-baselines-5y.json" with { type: "json" };
import baselinesPriorFixture from "./fixtures/portwatch-baselines-prior.json" with { type: "json" };

const FIXED_NOW = new Date("2026-07-07T00:00:00.000Z");

describe("fetchGateBaselines (PortWatch statistics adapter)", () => {
  let originalFetch: typeof global.fetch;

  const setupTest = () => {
    originalFetch = global.fetch;
  };

  const teardownTest = () => {
    global.fetch = originalFetch;
  };

  /** Routes fetch by inspecting the (percent-encoded) `where` clause.
   *  URLSearchParams.toString() uses application/x-www-form-urlencoded,
   *  which encodes spaces as `+` (NOT `%20`) — decodeURIComponent alone
   *  leaves literal `+` characters untouched, so `+` must be converted
   *  to a space first before substring-matching on decoded SQL text.
   *  The prior-year query is the only one with an upper date bound
   *  (`date < DATE '...'`, i.e. a literal `<` once decoded); Q1 vs Q2
   *  are then told apart by their distinct lower-bound date string
   *  (from1y vs from5y, computed from FIXED_NOW below). */
  const stubFetchByWhereClause = (from1y: string, from5y: string) => {
    global.fetch = async (url: string | URL) => {
      const urlStr = decodeURIComponent(String(url).replace(/\+/g, " "));
      const hasUpperBound = urlStr.includes(" AND date < DATE ");
      if (hasUpperBound) {
        return new Response(JSON.stringify(baselinesPriorFixture), { status: 200 });
      }
      if (urlStr.includes(`DATE '${from1y}'`)) {
        return new Response(JSON.stringify(baselines1yFixture), { status: 200 });
      }
      if (urlStr.includes(`DATE '${from5y}'`)) {
        return new Response(JSON.stringify(baselines5yFixture), { status: 200 });
      }
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    };
  };

  // Hand-computed from FIXED_NOW = 2026-07-07 (UTC, matches computeWindow's math).
  const FROM_1Y = "2025-07-07";
  const FROM_5Y = "2021-07-08";
  const PRIOR_FROM = "2024-07-07";
  const PRIOR_TO = "2025-07-07"; // === FROM_1Y

  test("routes three distinct queries (1y / 5y / prior) and returns 24 rows (6 gates × 2 metrics × 2 windows)", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      assert.equal(rows.length, 24);

      const oneYearRows = rows.filter((r) => r.win === "1y");
      const fiveYearRows = rows.filter((r) => r.win === "5y");
      assert.equal(oneYearRows.length, 12);
      assert.equal(fiveYearRows.length, 12);

      // 6 known gates in the fixtures, unknown "chokepoint99" excluded
      const corridors = new Set(rows.map((r) => r.corridor));
      assert.deepEqual(
        [...corridors].sort(),
        ["bab_el_mandeb", "cape", "hormuz", "panama", "singapore", "suez"].sort(),
      );
    } finally {
      teardownTest();
    }
  });

  test("sampleFrom/sampleTo reflect the query window per row", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      const hormuz1y = rows.find((r) => r.corridor === "hormuz" && r.win === "1y" && r.metric === "tanker_transits");
      assert.ok(hormuz1y);
      assert.equal(hormuz1y.sampleFrom, FROM_1Y);
      assert.equal(hormuz1y.sampleTo, "2026-07-07");

      const hormuz5y = rows.find((r) => r.corridor === "hormuz" && r.win === "5y" && r.metric === "tanker_transits");
      assert.ok(hormuz5y);
      assert.equal(hormuz5y.sampleFrom, FROM_5Y);
      assert.equal(hormuz5y.sampleTo, "2026-07-07");
    } finally {
      teardownTest();
    }
  });

  test("tanker_transits rows carry raw avg/p10/p90 values (string-typed avg_transits coerced)", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      // hormuz 1y avg_transits arrives as the STRING "20" in the fixture
      const hormuzTransits1y = rows.find(
        (r) => r.corridor === "hormuz" && r.win === "1y" && r.metric === "tanker_transits",
      );
      assert.ok(hormuzTransits1y);
      assert.equal(hormuzTransits1y.meanValue, 20);
      assert.equal(typeof hormuzTransits1y.meanValue, "number");
      assert.equal(hormuzTransits1y.p10, 11);
      assert.equal(hormuzTransits1y.p90, 34);
    } finally {
      teardownTest();
    }
  });

  test("tanker_volume rows convert avg/p10/p90 through tonsToMegatons", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      const hormuzVolume1y = rows.find(
        (r) => r.corridor === "hormuz" && r.win === "1y" && r.metric === "tanker_volume",
      );
      assert.ok(hormuzVolume1y);
      assert.equal(hormuzVolume1y.meanValue, tonsToMegatons(2_600_000));
      assert.equal(hormuzVolume1y.meanValue, 2.6);
      assert.equal(hormuzVolume1y.p10, tonsToMegatons(900_000));
      assert.equal(hormuzVolume1y.p90, tonsToMegatons(4_100_000));

      const singaporeVolume5y = rows.find(
        (r) => r.corridor === "singapore" && r.win === "5y" && r.metric === "tanker_volume",
      );
      assert.ok(singaporeVolume5y);
      assert.equal(singaporeVolume5y.meanValue, tonsToMegatons(3_000_000));
    } finally {
      teardownTest();
    }
  });

  test("yoyPct hand-checked for hormuz: transits 25.0%, volume 30.0% (independent per-metric computation)", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      // hormuz 1y avg_transits=20, prior avg_transits=16 → (20-16)/16*100 = 25.0
      const hormuzTransits1y = rows.find(
        (r) => r.corridor === "hormuz" && r.win === "1y" && r.metric === "tanker_transits",
      );
      assert.ok(hormuzTransits1y);
      assert.equal(hormuzTransits1y.yoyPct, 25.0);

      // hormuz 1y avg_volume=2,600,000, prior avg_volume=2,000,000 → (2.6M-2M)/2M*100 = 30.0
      const hormuzVolume1y = rows.find(
        (r) => r.corridor === "hormuz" && r.win === "1y" && r.metric === "tanker_volume",
      );
      assert.ok(hormuzVolume1y);
      assert.equal(hormuzVolume1y.yoyPct, 30.0);
    } finally {
      teardownTest();
    }
  });

  test("yoyPct is always null on 5y rows", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      const fiveYearRows = rows.filter((r) => r.win === "5y");
      assert.ok(fiveYearRows.length > 0);
      for (const r of fiveYearRows) {
        assert.equal(r.yoyPct, null);
      }
    } finally {
      teardownTest();
    }
  });

  test("yoyPct is null when the prior-year avg is zero (bab_el_mandeb)", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      const babTransits1y = rows.find(
        (r) => r.corridor === "bab_el_mandeb" && r.win === "1y" && r.metric === "tanker_transits",
      );
      assert.ok(babTransits1y);
      assert.equal(babTransits1y.yoyPct, null);

      const babVolume1y = rows.find(
        (r) => r.corridor === "bab_el_mandeb" && r.win === "1y" && r.metric === "tanker_volume",
      );
      assert.ok(babVolume1y);
      assert.equal(babVolume1y.yoyPct, null);
    } finally {
      teardownTest();
    }
  });

  test("yoyPct is null when the gate is entirely missing from the prior-year query (cape)", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      const capeTransits1y = rows.find(
        (r) => r.corridor === "cape" && r.win === "1y" && r.metric === "tanker_transits",
      );
      assert.ok(capeTransits1y);
      assert.equal(capeTransits1y.yoyPct, null);
      // cape's own avg/p10/p90 should still be present — only yoy is affected
      assert.equal(capeTransits1y.meanValue, 9.2);
    } finally {
      teardownTest();
    }
  });

  test("unknown portid in the 1y fixture (chokepoint99) is skipped, not surfaced as a corridor", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      const unknownRows = rows.filter((r) => (r as unknown as { corridor: string }).corridor === "chokepoint99");
      assert.equal(unknownRows.length, 0);
      // exactly the 6 configured gates appear, never a 7th
      const corridors = new Set(rows.map((r) => r.corridor));
      assert.equal(corridors.size, 6);
    } finally {
      teardownTest();
    }
  });

  test("computedAt is stamped from the injected `now`", async () => {
    setupTest();
    try {
      stubFetchByWhereClause(FROM_1Y, FROM_5Y);
      const rows = await fetchGateBaselines(FIXED_NOW);

      for (const r of rows) {
        assert.equal(r.computedAt, FIXED_NOW.toISOString());
      }
    } finally {
      teardownTest();
    }
  });

  test("non-array features throws SourceError bad_payload with a response snippet", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ notFeatures: "oops" }), { status: 200 });

      await assert.rejects(
        () => fetchGateBaselines(FIXED_NOW),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "bad_payload" && err.message.includes("notFeatures");
          }
          return false;
        },
      );
    } finally {
      teardownTest();
    }
  });

  test("a feature missing attributes throws SourceError bad_payload", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ features: [{}] }), { status: 200 });

      await assert.rejects(
        () => fetchGateBaselines(FIXED_NOW),
        (err: unknown) => err instanceof SourceError && err.kind === "bad_payload",
      );
    } finally {
      teardownTest();
    }
  });

  test("an error body (200 + error) throws SourceError with a non-bad_payload kind", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: { code: 500, message: "Internal error" } }), { status: 200 });

      await assert.rejects(
        () => fetchGateBaselines(FIXED_NOW),
        (err: unknown) => {
          if (err instanceof SourceError) {
            return err.kind === "upstream_error";
          }
          return false;
        },
      );
    } finally {
      teardownTest();
    }
  });
});
