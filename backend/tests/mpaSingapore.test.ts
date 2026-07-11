import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MpaSingaporeSource, thousandTonnesToMt, MPA_DATASETS } from "../src/sources/mpaSingapore";
import { SourceError } from "../src/core/types";
import bunkerFixture from "./fixtures/mpa-bunker-sales.json" with { type: "json" };
import tankerFixture from "./fixtures/mpa-tanker-arrivals.json" with { type: "json" };

describe("MpaSingaporeSource", () => {
  let originalFetch: typeof global.fetch;

  const setup = () => {
    originalFetch = global.fetch;
  };
  const teardown = () => {
    global.fetch = originalFetch;
  };

  /** Routes fetch by resource_id in the query string. */
  const stubFetchByResource = () => {
    global.fetch = async (url: string | URL) => {
      const u = String(url);
      if (u.includes("d_89d2874dad74a273270369334f1e7d28")) {
        return new Response(JSON.stringify(bunkerFixture), { status: 200 });
      }
      if (u.includes("d_9adb5ace517591edd9a8c88291ac1f1c")) {
        return new Response(JSON.stringify(tankerFixture), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, result: { records: [] } }), {
        status: 200,
      });
    };
  };

  test("thousandTonnesToMt divides by 1000", () => {
    assert.equal(thousandTonnesToMt(4548.35), 4.54835);
    assert.equal(thousandTonnesToMt(0), 0);
  });

  test("covers both live-verified datasets", () => {
    assert.deepEqual(
      MPA_DATASETS.map((d) => d.resourceId).sort(),
      ["d_89d2874dad74a273270369334f1e7d28", "d_9adb5ace517591edd9a8c88291ac1f1c"].sort(),
    );
  });

  test("maps bunker sales rows (kt → Mt, month → first-of-month, null skipped)", async () => {
    setup();
    try {
      stubFetchByResource();
      const records = await new MpaSingaporeSource().fetchLatest();

      const bunker = records.filter((r) => r.metric === "bunker_sales");
      // 3 fixture rows, 1 null → 2 usable
      assert.equal(bunker.length, 2);

      const may = bunker.find((r) => r.periodDate === "2026-05-01");
      assert.ok(may);
      assert.equal(may.corridor, "singapore");
      assert.equal(may.value, 4.54835); // "4548.35" kt → Mt
      assert.equal(may.unit, "Mt");
      assert.equal(may.raw.value, 4548.35);
      assert.equal(may.raw.unit, "kt");
      assert.equal(may.source, "mpa-singapore");
      assert.equal(may.confidence, "official");
      assert.equal(may.observedAt, "2026-05-01T00:00:00.000Z");
      // newest month carries the preliminary flag; older months don't
      assert.equal((may.meta as Record<string, unknown>).preliminaryLatest, "true");
      const apr = bunker.find((r) => r.periodDate === "2026-04-01");
      assert.ok(apr);
      assert.equal((apr.meta as Record<string, unknown>).preliminaryLatest, undefined);
    } finally {
      teardown();
    }
  });

  test("maps tanker arrivals to two metrics; empty gross_tonnage skipped", async () => {
    setup();
    try {
      stubFetchByResource();
      const records = await new MpaSingaporeSource().fetchLatest();

      const arrivals = records.filter((r) => r.metric === "tanker_arrivals");
      const gt = records.filter((r) => r.metric === "tanker_arrivals_gt");
      assert.equal(arrivals.length, 2); // both months have counts
      assert.equal(gt.length, 1); // April's gross_tonnage is "" → skipped

      const may = arrivals.find((r) => r.periodDate === "2026-05-01");
      assert.ok(may);
      assert.equal(may.value, 2332);
      assert.equal(may.unit, "vessels");

      assert.equal(gt[0].periodDate, "2026-05-01");
      assert.equal(gt[0].value, 82.28092); // "82280.92" k GT → M GT
      assert.equal(gt[0].unit, "M GT");
    } finally {
      teardown();
    }
  });

  test("success:false body fails as bad_payload", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ success: false, error: { message: "not found" } }), {
          status: 200,
        });
      await assert.rejects(
        () => new MpaSingaporeSource().fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "bad_payload",
      );
    } finally {
      teardown();
    }
  });

  test("malformed month fails loud as bad_payload", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            result: { records: [{ month: "May 2026", bunker_sales: "4548.35" }] },
          }),
          { status: 200 },
        );
      await assert.rejects(
        () => new MpaSingaporeSource().fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "bad_payload",
      );
    } finally {
      teardown();
    }
  });

  test("HTTP 429 classifies as rate_limited", async () => {
    setup();
    try {
      global.fetch = async () => new Response("slow down", { status: 429 });
      await assert.rejects(
        () => new MpaSingaporeSource().fetchLatest(),
        (e: unknown) => e instanceof SourceError && e.kind === "rate_limited",
      );
    } finally {
      teardown();
    }
  });
});
