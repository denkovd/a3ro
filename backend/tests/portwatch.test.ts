import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PortWatchSource, tonsToMegatons } from "../src/sources/portwatch";
import { SourceError } from "../src/core/types";
import hormuzFixture from "./fixtures/portwatch-hormuz.json" with { type: "json" };
import malaccaFixture from "./fixtures/portwatch-malacca.json" with { type: "json" };

describe("PortWatchSource", () => {
  let originalFetch: typeof global.fetch;

  const setupTest = () => {
    originalFetch = global.fetch;
  };

  const teardownTest = () => {
    global.fetch = originalFetch;
  };

  /** Routes fetch by chokepoint portid in the query string
   *  (`where=portid='chokepoint6'` — URLSearchParams percent-encodes the
   *  quotes/equals, but the literal "chokepoint6"/"chokepoint5" substring
   *  passes through unencoded). */
  const stubFetchByChokepoint = () => {
    global.fetch = async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("chokepoint6")) {
        return new Response(JSON.stringify(hormuzFixture), { status: 200 });
      }
      if (urlStr.includes("chokepoint5")) {
        return new Response(JSON.stringify(malaccaFixture), { status: 200 });
      }
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    };
  };

  /** Tiny inline stub response reused for the "chokepoint1" (Suez) routing
   *  assertion below — a couple of rows is enough to prove the new gate
   *  maps to corridor "suez", without pulling in a full fixture file. */
  const suezStubResponse = {
    objectIdFieldName: "OBJECTID",
    fields: [
      { name: "date", type: "esriFieldTypeDateOnly" },
      { name: "n_tanker", type: "esriFieldTypeInteger" },
      { name: "capacity_tanker", type: "esriFieldTypeInteger" },
    ],
    exceededTransferLimit: true,
    features: [
      { attributes: { date: "2026-06-28", n_tanker: 22, capacity_tanker: 2_800_000 } },
      { attributes: { date: "2026-06-27", n_tanker: 19, capacity_tanker: 2_500_000 } },
    ],
  };

  test("tonsToMegatons divides by 1_000_000", () => {
    assert.equal(tonsToMegatons(2_400_000), 2.4);
    assert.equal(tonsToMegatons(0), 0);
  });

  test("fetchLatest maps daily tanker_transits records correctly (count, value, unit, corridor, meta.portid)", async () => {
    setupTest();
    try {
      stubFetchByChokepoint();
      const source = new PortWatchSource();
      const records = await source.fetchLatest();

      const hormuzTransits = records.filter(
        (r) => r.corridor === "hormuz" && r.metric === "tanker_transits",
      );
      // 9 fixture rows, 1 null day → 8 usable daily rows
      assert.equal(hormuzTransits.length, 8);

      const jun28 = hormuzTransits.find((r) => r.periodDate === "2026-06-28");
      assert.ok(jun28);
      assert.equal(jun28.value, 18);
      assert.equal(jun28.unit, "vessels/d");
      assert.equal(jun28.corridor, "hormuz");
      assert.equal(jun28.source, "portwatch");
      assert.equal(jun28.confidence, "aggregator");
      assert.equal(jun28.observedAt, "2026-06-28T00:00:00.000Z");
      assert.deepEqual(jun28.meta, { portid: "chokepoint6", portname: "Strait of Hormuz" });

      const singaporeTransits = records.filter(
        (r) => r.corridor === "singapore" && r.metric === "tanker_transits",
      );
      assert.equal(singaporeTransits.length, 8);
      const sgJun28 = singaporeTransits.find((r) => r.periodDate === "2026-06-28");
      assert.ok(sgJun28);
      assert.equal(sgJun28.value, 55);
      assert.deepEqual(sgJun28.meta, { portid: "chokepoint5", portname: "Malacca Strait" });
    } finally {
      teardownTest();
    }
  });

  test("descriptor.corridors covers all six live-gated chokepoints", () => {
    const source = new PortWatchSource();
    assert.deepEqual(source.descriptor.corridors, [
      "hormuz",
      "singapore",
      "suez",
      "bab_el_mandeb",
      "cape",
      "panama",
    ]);
  });

  test("stub response routed for chokepoint1 produces corridor \"suez\" records", async () => {
    setupTest();
    try {
      global.fetch = async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("chokepoint1")) {
          return new Response(JSON.stringify(suezStubResponse), { status: 200 });
        }
        return new Response(JSON.stringify({ features: [] }), { status: 200 });
      };

      const source = new PortWatchSource();
      const records = await source.fetchLatest();

      const suezTransits = records.filter(
        (r) => r.corridor === "suez" && r.metric === "tanker_transits",
      );
      assert.equal(suezTransits.length, 2);
      const jun28 = suezTransits.find((r) => r.periodDate === "2026-06-28");
      assert.ok(jun28);
      assert.equal(jun28.value, 22);
      assert.equal(jun28.corridor, "suez");
      assert.deepEqual(jun28.meta, { portid: "chokepoint1", portname: "Suez Canal" });

      const suezVolume = records.filter(
        (r) => r.corridor === "suez" && r.metric === "tanker_volume",
      );
      assert.equal(suezVolume.length, 2);
      assert.equal(suezVolume.find((r) => r.periodDate === "2026-06-28")?.value, tonsToMegatons(2_800_000));

      // No other configured chokepoint should have picked up suez rows.
      const nonSuez = records.filter((r) => r.corridor !== "suez");
      assert.equal(nonSuez.length, 0);
    } finally {
      teardownTest();
    }
  });

  test("tanker_volume = capacity_tanker / 1e6 with unit Mt/d, raw preserves mt value/unit", async () => {
    setupTest();
    try {
      stubFetchByChokepoint();
      const source = new PortWatchSource();
      const records = await source.fetchLatest();

      const hormuzVolume = records.filter(
        (r) => r.corridor === "hormuz" && r.metric === "tanker_volume",
      );
      assert.equal(hormuzVolume.length, 8);

      const jun28 = hormuzVolume.find((r) => r.periodDate === "2026-06-28");
      assert.ok(jun28);
      assert.equal(jun28.value, tonsToMegatons(2_400_000));
      assert.equal(jun28.value, 2.4);
      assert.equal(jun28.unit, "Mt/d");
      assert.equal(jun28.raw.value, 2_400_000);
      assert.equal(jun28.raw.unit, "mt/d");
    } finally {
      teardownTest();
    }
  });

  test("tanker_transits_7d: mean of 7 most recent valid days (null day excluded), rounded to 1 decimal", async () => {
    setupTest();
    try {
      stubFetchByChokepoint();
      const source = new PortWatchSource();
      const records = await source.fetchLatest();

      const hormuz7d = records.filter(
        (r) => r.corridor === "hormuz" && r.metric === "tanker_transits_7d",
      );
      assert.equal(hormuz7d.length, 1);
      const rec = hormuz7d[0];

      // Hand-computed: 7 most recent valid days excluding the null 06-24
      // row and the 8th-oldest valid day (06-20):
      // 06-28=18, 06-27=12, 06-26=20, 06-25=10, 06-23=15, 06-22=14, 06-21=17
      // mean = 106 / 7 = 15.142857... → 15.1
      assert.equal(rec.value, 15.1);
      assert.equal(rec.unit, "vessels/d");
      assert.equal(rec.periodDate, "2026-06-28"); // newest valid date
      assert.equal(rec.meta?.window, "7d");
      assert.equal(rec.meta?.portid, "chokepoint6");
      // raw preserves the pre-rounding mean
      assert.ok(Math.abs(rec.raw.value - 106 / 7) < 1e-9);

      const singapore7d = records.filter(
        (r) => r.corridor === "singapore" && r.metric === "tanker_transits_7d",
      );
      assert.equal(singapore7d.length, 1);
      // 06-28=55, 06-27=48, 06-26=60, 06-25=52, 06-23=45, 06-22=58, 06-21=50
      // mean = 368 / 7 = 52.5714... → 52.6
      assert.equal(singapore7d[0].value, 52.6);
      assert.equal(singapore7d[0].periodDate, "2026-06-28");
    } finally {
      teardownTest();
    }
  });

  test("tanker_volume_7d: mean of 7 most recent valid days' capacity_tanker/1e6, rounded to 2 decimals", async () => {
    setupTest();
    try {
      stubFetchByChokepoint();
      const source = new PortWatchSource();
      const records = await source.fetchLatest();

      const hormuzVol7d = records.filter(
        (r) => r.corridor === "hormuz" && r.metric === "tanker_volume_7d",
      );
      assert.equal(hormuzVol7d.length, 1);
      const rec = hormuzVol7d[0];

      // 2400000+1900000+2600000+1700000+2100000+2000000+2300000 = 15,000,000
      // mean tons = 15,000,000/7 = 2,142,857.14... → Mt = 2.142857... → 2.14
      assert.equal(rec.value, 2.14);
      assert.equal(rec.unit, "Mt/d");
      assert.equal(rec.periodDate, "2026-06-28");
      assert.equal(rec.meta?.window, "7d");

      const singaporeVol7d = records.filter(
        (r) => r.corridor === "singapore" && r.metric === "tanker_volume_7d",
      );
      assert.equal(singaporeVol7d.length, 1);
      // 3300000+2900000+3600000+3100000+2700000+3400000+3000000 = 22,000,000
      // mean tons = 22,000,000/7 = 3,142,857.14... → Mt = 3.142857... → 3.14
      assert.equal(singaporeVol7d[0].value, 3.14);
    } finally {
      teardownTest();
    }
  });

  test("HTTP 200 with error body throws SourceError with kind upstream_error", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: { code: 500, message: "Internal server error" } }), {
          status: 200,
        });

      const source = new PortWatchSource();

      await assert.rejects(
        () => source.fetchLatest(),
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

  test("bad date string (not a calendar date) throws bad_payload SourceError", async () => {
    setupTest();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            features: [{ attributes: { date: "2026-W03", n_tanker: 10, capacity_tanker: 2000000 } }],
          }),
          { status: 200 },
        );

      const source = new PortWatchSource();

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

  test("empty features array produces no records and does not throw", async () => {
    setupTest();
    try {
      global.fetch = async () => new Response(JSON.stringify({ features: [] }), { status: 200 });

      const source = new PortWatchSource();
      const records = await source.fetchLatest();

      assert.equal(records.length, 0);
    } finally {
      teardownTest();
    }
  });
});
