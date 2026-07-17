/* ────────────────────────────────────────────────────────────────
   Pure compute-layer tests (architecture spec §3, v2). Includes the
   spec's own "worked checks" (§3.3) verified exactly — these are the
   numbers the spec author claims were verified in-sandbox, so
   reproducing them here is the strongest possible regression guard
   against silently drifting the winsorization/weight constants.
──────────────────────────────────────────────────────────────── */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  compareRankings, computeBeatStreak, computeRankScore, computeTickerMetrics,
  computeTrailingAverages, winsor, RANKING_CONFIG,
} from "../src/earnings/engine";
import { QuarterSurprise } from "../src/earnings/types";

function q(fiscalYear: number, fiscalQuarter: number, eps: number | null, rev: number | null): QuarterSurprise {
  return { fiscalYear, fiscalQuarter, epsSurprisePercent: eps, revenueSurprisePercent: rev };
}

describe("RANKING_CONFIG", () => {
  test("all tunable knobs live in one exported object", () => {
    assert.deepEqual(RANKING_CONFIG.recencyWeights, [0.4, 0.3, 0.2, 0.1]);
    assert.equal(RANKING_CONFIG.winsorBound, 50);
    assert.equal(RANKING_CONFIG.epsBlendWeight, 0.6);
    assert.equal(RANKING_CONFIG.revenueBlendWeight, 0.4);
    assert.equal(RANKING_CONFIG.trailingWindow, 4);
  });
});

describe("winsor", () => {
  test("clamps to ±50", () => {
    assert.equal(winsor(900), 50);
    assert.equal(winsor(-900), -50);
    assert.equal(winsor(12.3), 12.3);
  });
});

describe("computeBeatStreak (§3.1) — walks ALL cached history, not capped at 4", () => {
  test("stops at first non-positive value", () => {
    const quarters = [q(2026, 1, 5, 2), q(2025, 4, 3, null), q(2025, 3, -2, 1), q(2025, 2, 8, 4)];
    assert.equal(computeBeatStreak(quarters), 2);
  });

  test("null breaks the streak (unknown surprise != beat)", () => {
    const quarters = [q(2026, 1, 5, 2), q(2025, 4, null, 1)];
    assert.equal(computeBeatStreak(quarters), 1);
  });

  test("all beats -> streak == length, streak_is_capped == true", () => {
    const quarters = [q(2026, 1, 1, 1), q(2025, 4, 2, 2), q(2025, 3, 3, 3), q(2025, 2, 4, 4), q(2025, 1, 5, 5)];
    const metrics = computeTickerMetrics(quarters);
    assert.equal(metrics.beatStreak, 5);
    assert.equal(metrics.quartersAvailable, 5);
    assert.equal(metrics.streakIsCapped, true);
  });

  test("streak > 4 with a miss at position 7 — walks past the old v1 4-quarter cap", () => {
    // 6 beats, then a miss at position 7, then more history behind it.
    const quarters = [
      q(2027, 2, 1, 1), q(2027, 1, 2, 2), q(2026, 4, 3, 3), q(2026, 3, 4, 4),
      q(2026, 2, 5, 5), q(2026, 1, 6, 6), q(2025, 4, -1, 1), q(2025, 3, 7, 7),
    ];
    const metrics = computeTickerMetrics(quarters);
    assert.equal(metrics.beatStreak, 6);
    assert.equal(metrics.quartersAvailable, 8);
    assert.equal(metrics.streakIsCapped, false); // 6 !== 8 — the cache saw the streak actually end
  });
});

describe("computeTrailingAverages (§3.2)", () => {
  test("excludes nulls from the mean, never counts them as 0", () => {
    const quarters = [q(2026, 1, 10, null), q(2025, 4, 6, 4)];
    const { epsSurpriseAvg, revenueSurpriseAvg } = computeTrailingAverages(quarters);
    assert.equal(epsSurpriseAvg, 8); // (10+6)/2
    assert.equal(revenueSurpriseAvg, 4); // only one non-null value, not (4+0)/2
  });

  test("all-null revenue -> avg is null, not 0", () => {
    const quarters = [q(2026, 1, 10, null), q(2025, 4, 6, null)];
    assert.equal(computeTrailingAverages(quarters).revenueSurpriseAvg, null);
  });
});

describe("computeRankScore (§3.3) — spec's six worked checks, exact values", () => {
  test("1. Full 4Q: eps=[5,3,-2,8], rev=[2,null,1,4] -> rank_score = 2.90, beat_streak = 2", () => {
    const quarters = [q(2026, 1, 5, 2), q(2025, 4, 3, null), q(2025, 3, -2, 1), q(2025, 2, 8, 4)];
    assert.ok(Math.abs(computeRankScore(quarters)! - 2.9) < 1e-9);
    assert.equal(computeBeatStreak(quarters), 2);
  });

  test("2. Short history 2Q: eps=[10,4], rev=[5,null] -> weights [0.571,0.429], rank_score ≈ 6.29", () => {
    const quarters = [q(2026, 1, 10, 5), q(2025, 4, 4, null)];
    const score = computeRankScore(quarters)!;
    assert.ok(Math.abs(score - 6.2857142857) < 1e-6);
    // Weight renormalization check: [0.4,0.3] over 2 retained quarters -> [4/7, 3/7].
    assert.ok(Math.abs(4 / 7 - 0.571) < 1e-3);
    assert.ok(Math.abs(3 / 7 - 0.429) < 1e-3);
  });

  test("3. Outlier: eps1 = 900 -> winsorized to 50 before weighting", () => {
    const quarters = [q(2026, 1, 900, null)];
    // N=1 -> single weight renormalizes to 1.0; EPS-only fallback (no revenue).
    assert.equal(computeRankScore(quarters), 50);
  });

  test("4. EPS missing: eps1 = null, rev1 = 3 -> s1 = 3 (revenue-only fallback)", () => {
    const quarters = [q(2026, 1, null, 3)];
    assert.equal(computeRankScore(quarters), 3);
  });

  test("5. Interior gap: q2 both-null of 3 -> q2 dropped, weights [0.4,0.2] -> [0.667,0.333]", () => {
    // Deliberately distinct s1/s3 so the assertion actually pins the weight
    // RATIO (0.667/0.333), not just a degenerate equal-value case where any
    // weighting would coincidentally produce the same result.
    const quarters = [q(2026, 1, 10, null), q(2025, 4, null, null), q(2025, 3, null, 6)];
    // q1: eps10, rev null -> s1 = winsor(10) = 10 (EPS-only fallback).
    // q2: both null -> dropped entirely (not redistributed).
    // q3: eps null, rev6 -> s3 = winsor(6) = 6 (revenue-only fallback).
    // Weights before renorm: r1=0.4 (position 1), r3=0.2 (position 3) ->
    // renormalized to 0.4/0.6=0.667 and 0.2/0.6=0.333.
    const score = computeRankScore(quarters)!;
    const expected = (0.4 / 0.6) * 10 + (0.2 / 0.6) * 6;
    assert.ok(Math.abs(score - expected) < 1e-9);
    assert.ok(Math.abs(score - 8.6667) < 1e-3);
  });

  test("6. No signal at all: every quarter both-null -> rank_score = null, never 0", () => {
    const quarters = [q(2026, 1, null, null), q(2025, 4, null, null)];
    assert.equal(computeRankScore(quarters), null);
    const metrics = computeTickerMetrics(quarters);
    assert.equal(metrics.rankScore, null);
    assert.equal(metrics.confidence, null);
  });
});

describe("computeTickerMetrics — quarters_available reflects full cached history", () => {
  test("3 cached quarters -> quartersAvailable = 3 even though composite windows to min(4,3)", () => {
    const quarters = [q(2026, 1, 1, 1), q(2025, 4, 2, 2), q(2025, 3, 3, 3)];
    assert.equal(computeTickerMetrics(quarters).quartersAvailable, 3);
  });

  test("more than 4 cached quarters -> quartersAvailable reflects ALL of them, not capped at 4", () => {
    const quarters = [
      q(2027, 1, 1, 1), q(2026, 4, 2, 2), q(2026, 3, 3, 3),
      q(2026, 2, 4, 4), q(2026, 1, 5, 5), q(2025, 4, 6, 6),
    ];
    const metrics = computeTickerMetrics(quarters);
    assert.equal(metrics.quartersAvailable, 6);
    assert.equal(metrics.beatStreak, 6); // all positive -> full walk, not capped at 4
  });

  test("empty quarters -> rank_score null, beat_streak 0, confidence null, quarters_available 0", () => {
    const metrics = computeTickerMetrics([]);
    assert.deepEqual(metrics, {
      rankScore: null, beatStreak: 0, streakIsCapped: true, confidence: null,
      epsSurpriseAvg: null, revenueSurpriseAvg: null, quartersAvailable: 0,
    });
  });
});

describe("confidence (§3.3) — count of newest-window quarters with signal", () => {
  test("4 quarters with signal -> high", () => {
    const quarters = [q(2026, 1, 1, 1), q(2025, 4, 2, 2), q(2025, 3, 3, 3), q(2025, 2, 4, 4)];
    assert.equal(computeTickerMetrics(quarters).confidence, "high");
  });

  test("2-3 quarters with signal -> medium", () => {
    const quarters = [q(2026, 1, 1, null), q(2025, 4, null, null), q(2025, 3, 3, 3)];
    assert.equal(computeTickerMetrics(quarters).confidence, "medium");
  });

  test("1 quarter with signal -> low", () => {
    const quarters = [q(2026, 1, 1, null), q(2025, 4, null, null), q(2025, 3, null, null)];
    assert.equal(computeTickerMetrics(quarters).confidence, "low");
  });

  test("0 quarters with signal -> null (spec doesn't name a tier for this)", () => {
    const quarters = [q(2026, 1, null, null)];
    assert.equal(computeTickerMetrics(quarters).confidence, null);
  });
});

describe("compareRankings (§3.3 leaderboard tie-break order)", () => {
  test("rank_score desc, nulls always last", () => {
    const a = { ticker: "A", rankScore: 10, beatStreak: 0, epsSurpriseAvg: null };
    const b = { ticker: "B", rankScore: null, beatStreak: 99, epsSurpriseAvg: 99 };
    const sorted = [b, a].sort(compareRankings);
    assert.deepEqual(sorted.map((r) => r.ticker), ["A", "B"]); // null always sorts last, regardless of other fields
  });

  test("tie on rank_score -> beat_streak desc", () => {
    const a = { ticker: "A", rankScore: 5, beatStreak: 1, epsSurpriseAvg: 0 };
    const b = { ticker: "B", rankScore: 5, beatStreak: 3, epsSurpriseAvg: 0 };
    const sorted = [a, b].sort(compareRankings);
    assert.deepEqual(sorted.map((r) => r.ticker), ["B", "A"]);
  });

  test("tie on rank_score + beat_streak -> eps_surprise_avg desc, nulls last", () => {
    const a = { ticker: "A", rankScore: 5, beatStreak: 2, epsSurpriseAvg: null };
    const b = { ticker: "B", rankScore: 5, beatStreak: 2, epsSurpriseAvg: 3 };
    const sorted = [a, b].sort(compareRankings);
    assert.deepEqual(sorted.map((r) => r.ticker), ["B", "A"]);
  });

  test("full tie -> ticker asc", () => {
    const a = { ticker: "ZZZ", rankScore: 5, beatStreak: 2, epsSurpriseAvg: 3 };
    const b = { ticker: "AAA", rankScore: 5, beatStreak: 2, epsSurpriseAvg: 3 };
    const sorted = [a, b].sort(compareRankings);
    assert.deepEqual(sorted.map((r) => r.ticker), ["AAA", "ZZZ"]);
  });
});
