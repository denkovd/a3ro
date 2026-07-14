/* ────────────────────────────────────────────────────────────────
   Pure compute-layer tests (architecture spec §3). Includes the
   spec's own "worked checks" (§3.3) verified exactly — these are
   the numbers the spec author claims were verified in-sandbox, so
   reproducing them here is the strongest possible regression guard
   against silently drifting the winsorization/weight constants.
──────────────────────────────────────────────────────────────── */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeBeatStreak, computeRankScore, computeTickerMetrics, computeTrailingAverages, winsor,
} from "../src/earnings/engine";
import { QuarterSurprise } from "../src/earnings/types";

function q(fiscalYear: number, fiscalQuarter: number, eps: number | null, rev: number | null): QuarterSurprise {
  return { fiscalYear, fiscalQuarter, epsSurprisePercent: eps, revenueSurprisePercent: rev };
}

describe("winsor", () => {
  test("clamps to ±50", () => {
    assert.equal(winsor(900), 50);
    assert.equal(winsor(-900), -50);
    assert.equal(winsor(12.3), 12.3);
  });
});

describe("computeBeatStreak (§3.1)", () => {
  test("stops at first non-positive value", () => {
    const quarters = [q(2026, 1, 5, 2), q(2025, 4, 3, null), q(2025, 3, -2, 1), q(2025, 2, 8, 4)];
    assert.equal(computeBeatStreak(quarters), 2);
  });

  test("null breaks the streak (unknown surprise != beat)", () => {
    const quarters = [q(2026, 1, 5, 2), q(2025, 4, null, 1)];
    assert.equal(computeBeatStreak(quarters), 1);
  });

  test("all beats -> streak == length", () => {
    const quarters = [q(2026, 1, 1, 1), q(2025, 4, 2, 2)];
    assert.equal(computeBeatStreak(quarters), 2);
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

describe("computeRankScore (§3.3) — spec's worked checks", () => {
  test("4Q, eps=[5,3,-2,8], rev=[2,null,1,4] -> rank_score = 2.90, beat_streak = 2", () => {
    const quarters = [q(2026, 1, 5, 2), q(2025, 4, 3, null), q(2025, 3, -2, 1), q(2025, 2, 8, 4)];
    assert.ok(Math.abs(computeRankScore(quarters) - 2.9) < 1e-9);
    assert.equal(computeBeatStreak(quarters), 2);
  });

  test("2Q only, eps=[10,4], rev=[5,null] -> rank_score = 6.29 (weights renormalized)", () => {
    const quarters = [q(2026, 1, 10, 5), q(2025, 4, 4, null)];
    const score = computeRankScore(quarters);
    assert.ok(Math.abs(score - 6.2857142857) < 1e-6);
  });

  test("outlier eps=900 is clamped to 50 by winsor before weighting", () => {
    const quarters = [q(2026, 1, 900, null)];
    // N=1 -> single weight renormalizes to 1.0; EPS-only fallback (no revenue).
    assert.equal(computeRankScore(quarters), 50);
  });

  test("empty quarters -> rank_score 0, beat_streak 0, quarters_available 0", () => {
    const metrics = computeTickerMetrics([]);
    assert.deepEqual(metrics, {
      rankScore: 0, beatStreak: 0, epsSurpriseAvg: null, revenueSurpriseAvg: null, quartersAvailable: 0,
    });
  });
});

describe("computeTickerMetrics — quarters_available reflects N, not a hardcoded 4", () => {
  test("3 cached quarters -> quartersAvailable = 3", () => {
    const quarters = [q(2026, 1, 1, 1), q(2025, 4, 2, 2), q(2025, 3, 3, 3)];
    assert.equal(computeTickerMetrics(quarters).quartersAvailable, 3);
  });
});
