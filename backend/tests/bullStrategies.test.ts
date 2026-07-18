/* ────────────────────────────────────────────────────────────────
   Strategy lens tests (unified-module spec §1/§8): each lens derives
   verdict / recency / strength from ITS leg of the one base snapshot;
   recency is always expressed in daily bars (weekly ×5) so the shared
   ranking grammar means the same thing on every lens; consensus
   tallies conflicts as neutral, never as missing.
──────────────────────────────────────────────────────────────── */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rankBullSnapshots } from "../src/bull/engine";
import {
  deriveStrategySnapshots,
  isStrategyId,
  tallyConsensus,
  DEFAULT_STRATEGY,
  STRATEGIES,
  BullStrategySnapshot,
} from "../src/bull/strategies";
import { BullSnapshot } from "../src/bull/types";
import { TimeframeState, Trend } from "../src/regime/types";

function leg(
  trend: Trend,
  opts: Partial<Pick<TimeframeState, "barsSinceFlip" | "cushionPct" | "sinceFlipPct" | "lastFlipDate">> = {},
): TimeframeState {
  return {
    trend,
    line: trend === 0 ? null : 100,
    lastFlipDate: opts.lastFlipDate ?? (trend === 0 ? null : "2026-07-01"),
    lastFlipPrice: trend === 0 ? null : 100,
    barsSinceFlip: opts.barsSinceFlip ?? (trend === 0 ? null : 3),
    sinceFlipPct: opts.sinceFlipPct ?? null,
    cushionPct: opts.cushionPct ?? null,
    bars: 300,
    flips: [],
  };
}

function baseSnapshot(daily: TimeframeState, weekly: TimeframeState, atrPct: number | null = 2): BullSnapshot {
  // Verdict as computeRegime would produce it from the two legs.
  const verdict =
    daily.trend === 0 || weekly.trend === 0 ? "WARMUP"
      : daily.trend === 1 && weekly.trend === 1 ? "BULLISH"
        : daily.trend === 1 ? "CONFLICT_DAILY"
          : weekly.trend === 1 ? "CONFLICT_WEEKLY"
            : "BEARISH";
  return {
    symbol: "TEST", displayName: "Test Asset", assetClass: "equity",
    runDate: "2026-07-17",
    daily, weekly, verdict,
    alignedSince: null, daysSinceAligned: null, newlyBullish: false,
    lastClose: 110, lastCloseDate: "2026-07-16",
    strength: null, rank: 0,
    tier: "macro", atrPct, strengthVol: null, rs63: null, adjusted: false,
  };
}

function byId(rows: BullStrategySnapshot[]): Record<string, BullStrategySnapshot> {
  return Object.fromEntries(rows.map((r) => [r.strategy, r]));
}

describe("deriveStrategySnapshots", () => {
  test("daily bull × weekly bear: D×W conflicts, daily lens is BULLISH, weekly lens is BEARISH", () => {
    const base = baseSnapshot(
      leg(1, { barsSinceFlip: 3, cushionPct: 2, sinceFlipPct: 5, lastFlipDate: "2026-07-14" }),
      leg(-1, { barsSinceFlip: 4, cushionPct: -3, sinceFlipPct: -6, lastFlipDate: "2026-06-20" }),
    );
    const s = byId(deriveStrategySnapshots(base));

    // ml-dw is the identity read — today's exact behavior.
    assert.equal(s["ml-dw"].verdict, "CONFLICT_DAILY");
    assert.equal(s["ml-dw"].strategy, "ml-dw");

    // Daily lens: bullish, newly (3 ≤ 10), leg-scoped strength ÷ ATR.
    assert.equal(s["ml-daily"].verdict, "BULLISH");
    assert.equal(s["ml-daily"].newlyBullish, true);
    assert.equal(s["ml-daily"].daysSinceAligned, 3);
    assert.equal(s["ml-daily"].alignedSince, "2026-07-14");
    assert.equal(s["ml-daily"].strength, 7);           // 2 + 5, daily leg only
    assert.equal(s["ml-daily"].strengthVol, 3.5);      // 7 ÷ 2 ATR%

    // Weekly lens: bearish, recency in DAILY bars (4 weekly × 5 = 20).
    assert.equal(s["ml-weekly"].verdict, "BEARISH");
    assert.equal(s["ml-weekly"].newlyBullish, false);
    assert.equal(s["ml-weekly"].daysSinceAligned, 20);
    assert.equal(s["ml-weekly"].alignedSince, "2026-06-20");
    assert.equal(s["ml-weekly"].strength, -9);         // −3 + −6, weekly leg only
    assert.equal(s["ml-weekly"].strengthVol, -4.5);
  });

  test("warm-up leg: weekly 0 → weekly lens WARMUP with honest nulls; other lenses unaffected", () => {
    const base = baseSnapshot(leg(1, { barsSinceFlip: 2 }), leg(0));
    const s = byId(deriveStrategySnapshots(base));
    assert.equal(s["ml-weekly"].verdict, "WARMUP");
    assert.equal(s["ml-weekly"].alignedSince, null);
    assert.equal(s["ml-weekly"].daysSinceAligned, null);
    assert.equal(s["ml-weekly"].newlyBullish, false);
    assert.equal(s["ml-daily"].verdict, "BULLISH");
    assert.equal(s["ml-dw"].verdict, "WARMUP"); // computeRegime semantics preserved
  });

  test("weekly newly-bullish boundary: 2 closed weeks (=10 daily bars) is newly, 3 weeks is not", () => {
    const fresh = byId(deriveStrategySnapshots(baseSnapshot(leg(1), leg(1, { barsSinceFlip: 2 }))));
    assert.equal(fresh["ml-weekly"].newlyBullish, true);
    assert.equal(fresh["ml-weekly"].daysSinceAligned, 10);

    const stale = byId(deriveStrategySnapshots(baseSnapshot(leg(1), leg(1, { barsSinceFlip: 3 }))));
    assert.equal(stale["ml-weekly"].newlyBullish, false);
    assert.equal(stale["ml-weekly"].daysSinceAligned, 15);
  });

  test("one-null strength composition matches computeRegime's (cushion ?? sinceFlip)", () => {
    const s = byId(deriveStrategySnapshots(
      baseSnapshot(leg(1, { cushionPct: 4, sinceFlipPct: null }), leg(1)),
    ));
    assert.equal(s["ml-daily"].strength, 4);
    // ATR null → strengthVol null, never a divide-by-null guess
    const noAtr = byId(deriveStrategySnapshots(
      baseSnapshot(leg(1, { cushionPct: 4, sinceFlipPct: 1 }), leg(1), null),
    ));
    assert.equal(noAtr["ml-daily"].strengthVol, null);
  });
});

describe("ranking across a lens", () => {
  test("single-leg lenses rank on the shared grammar: newly first, then recency", () => {
    const a = byId(deriveStrategySnapshots(
      baseSnapshot(leg(1), leg(1, { barsSinceFlip: 1, lastFlipDate: "2026-07-11" })),
    ))["ml-weekly"]; // recency 5, newly
    const b = byId(deriveStrategySnapshots(
      baseSnapshot(leg(1), leg(1, { barsSinceFlip: 8, lastFlipDate: "2026-05-22" })),
    ))["ml-weekly"]; // recency 40, not newly
    b.symbol = "OTHER";

    const ranked = rankBullSnapshots([b, a]);
    assert.equal(ranked[0].symbol, "TEST");
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[0].strategy, "ml-weekly"); // generic ranking keeps the lens tag
    assert.equal(ranked[1].symbol, "OTHER");
    assert.equal(ranked[1].rank, 2);
  });
});

describe("registry + consensus", () => {
  test("registry: default first, ids unique, isStrategyId guards", () => {
    assert.equal(STRATEGIES[0].id, DEFAULT_STRATEGY);
    assert.equal(new Set(STRATEGIES.map((s) => s.id)).size, STRATEGIES.length);
    assert.equal(isStrategyId("ml-weekly"), true);
    assert.equal(isStrategyId("trend-9000"), false);
    assert.equal(isStrategyId(null), false);
  });

  test("consensus: conflicts and warm-up are neutral, never missing", () => {
    assert.deepEqual(tallyConsensus(["BULLISH", "BEARISH", "CONFLICT_DAILY"]),
      { bull: 1, bear: 1, neutral: 1, of: 3 });
    assert.deepEqual(tallyConsensus(["BULLISH", "BULLISH", "WARMUP"]),
      { bull: 2, bear: 0, neutral: 1, of: 3 });
    assert.deepEqual(tallyConsensus([]), { bull: 0, bear: 0, neutral: 0, of: 0 });
  });
});
