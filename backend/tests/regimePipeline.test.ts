import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseYahooDaily } from "../src/regime/yahooHistory";
import { runRegimeCycle } from "../src/regime/pipeline";
import { RegimeBar, UniverseEntry } from "../src/regime/types";
import { Queryable } from "../src/storage/db";

/* ── parseYahooDaily fixtures ─────────────────────────────────── */

// 2026-06-29 → 2026-07-03 daily bars, epoch seconds at 13:30 UTC
// (Yahoo stamps a bar with its OPEN time).
const DAY = 86_400;
const t0 = Date.UTC(2026, 5, 29, 13, 30) / 1000;
const goodFixture = {
  chart: {
    result: [
      {
        meta: { symbol: "TEST" },
        timestamp: [t0, t0 + DAY, t0 + 2 * DAY, null, t0 + 4 * DAY],
        indicators: {
          quote: [
            {
              open: [10, 11, 12, 13, null],
              high: [11, 12, 13, 14, 15],
              low: [9, 10, 11, 12, 13],
              close: [10.5, 11.5, 12.5, 13.5, 14.5],
            },
          ],
        },
      },
    ],
    error: null,
  },
};

describe("parseYahooDaily", () => {
  test("maps timestamps to UTC dates and skips null-padded rows", () => {
    const bars = parseYahooDaily(goodFixture as never, "TEST");
    // Row 3 has a null timestamp, row 4 a null open → both skipped.
    assert.deepEqual(bars.map((b) => b.date), ["2026-06-29", "2026-06-30", "2026-07-01"]);
    assert.deepEqual(bars[0], {
      date: "2026-06-29", open: 10, high: 11, low: 9, close: 10.5,
    });
  });

  test("keeps the LAST row when Yahoo duplicates a trading date", () => {
    const dup = structuredClone(goodFixture);
    dup.chart.result[0].timestamp = [t0, t0 + 3600, t0 + DAY, null, null]; // two rows on 06-29
    const bars = parseYahooDaily(dup as never, "TEST");
    assert.deepEqual(bars.map((b) => b.date), ["2026-06-29", "2026-06-30"]);
    assert.equal(bars[0].close, 11.5); // second (later) row wins
  });

  test("throws on chart.error and on missing arrays", () => {
    assert.throws(
      () => parseYahooDaily({ chart: { error: { code: "Not Found", description: "No data" } } } as never, "X"),
      /Not Found/,
    );
    assert.throws(
      () => parseYahooDaily({ chart: { result: [{}] } } as never, "X"),
      /missing timestamp/,
    );
  });
});

/* ── cycle: per-symbol isolation + persistence ────────────────── */

/** Long flat-then-breakout series so DAILY establishes; weekly stays
 *  warm-up with default donLen=20 (only ~24 weeks) → verdict WARMUP
 *  is fine, the cycle test cares about plumbing, not signals. */
function syntheticHistory(): RegimeBar[] {
  const bars: RegimeBar[] = [];
  const d = new Date("2026-01-05T00:00:00Z");
  for (let i = 0; i < 120; i++) {
    const c = i < 100 ? 100 : 100 + (i - 99) * 3;
    bars.push({
      date: d.toISOString().slice(0, 10),
      open: c, high: c + 1, low: c - 1, close: c,
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return bars;
}

const UNIVERSE: UniverseEntry[] = [
  { symbol: "OK-1", displayName: "Ok One", assetClass: "crypto" },
  { symbol: "OK-2", displayName: "Ok Two", assetClass: "metals" },
  { symbol: "BAD", displayName: "Broken", assetClass: "fx" },
];

describe("runRegimeCycle", () => {
  test("one failing symbol never takes down the scan; snapshots are persisted ranked", async () => {
    const queries: { text: string; params?: unknown[] }[] = [];
    const stubDb: Queryable = {
      query: async (text, params) => {
        queries.push({ text, params });
        return { rows: [], rowCount: 1 };
      },
    };

    const report = await runRegimeCycle(stubDb, {
      universe: UNIVERSE,
      fetchHistory: async (symbol) => {
        if (symbol === "BAD") throw new Error("Yahoo error for BAD — Not Found");
        return syntheticHistory();
      },
      now: () => new Date("2026-07-06T06:00:00Z"),
    });

    assert.equal(report.runDate, "2026-07-06");
    assert.equal(report.universe, 3);
    assert.equal(report.scanned.length, 3);

    const bad = report.scanned.find((s) => s.symbol === "BAD");
    assert.equal(bad?.ok, false);
    assert.match(bad?.error ?? "", /Not Found/);
    assert.equal(report.scanned.filter((s) => s.ok).length, 2);

    // Two ok symbols upserted, ranks 1 and 2, keyed on the run date.
    assert.equal(report.written, 2);
    const inserts = queries.filter((q) => q.text.includes("insert into regime_snapshots"));
    assert.equal(inserts.length, 2);
    const ranks = inserts.map((q) => (q.params as unknown[])[5]).sort();
    assert.deepEqual(ranks, [1, 2]);
    for (const q of inserts) assert.equal((q.params as unknown[])[0], "2026-07-06");
  });

  test("forming bars are excluded: a bar dated the run day never enters the scan", async () => {
    const stubDb: Queryable = { query: async () => ({ rows: [], rowCount: 1 }) };
    const withForming = [
      ...syntheticHistory(),
      { date: "2026-07-06", open: 500, high: 501, low: 499, close: 500 }, // forming
    ];
    const report = await runRegimeCycle(stubDb, {
      universe: [UNIVERSE[0]],
      fetchHistory: async () => withForming,
      now: () => new Date("2026-07-06T06:00:00Z"),
    });
    const ok = report.scanned[0];
    assert.equal(ok.ok, true);
    assert.equal(ok.bars, 120); // 121st (forming) bar stripped
  });
});
