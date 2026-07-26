import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeAllocation,
  weightOf,
  SLEEVES,
  SLEEVE_REGIME_SCORE,
  VAMS_MULTIPLIER,
  RISK_SLEEVES,
  MAX_CYCLE_DRAG,
  type AllocationInput,
} from "../src/macro/allocation";
import {
  runAllocationBacktest,
  DEFAULT_BENCHMARKS,
  type PriceSeries,
} from "../src/macro/allocationBacktest";
import { RegimeBar } from "../src/regime/types";
import { REGIME_UNIVERSE } from "../src/regime/universe";
import { computeVams } from "../src/macro/vams";

/* ── helpers ──────────────────────────────────────────────────── */

function input(over: Partial<AllocationInput> = {}): AllocationInput {
  return {
    date: "2026-01-01",
    marketRegime: "GOLDILOCKS",
    economicQuadrant: "GOLDILOCKS",
    headwinds: 0,
    states: { stocks: "BULLISH", gold: "BULLISH", bitcoin: "BULLISH" },
    ...over,
  };
}

/** Monthly bars compounding at `rate` per month. */
function monthlyBars(start: string, months: number, base: number, rate: number): RegimeBar[] {
  const [y0, m0] = start.split("-").map(Number);
  const out: RegimeBar[] = [];
  let v = base;
  for (let i = 0; i < months; i++) {
    const m = m0 - 1 + i;
    const y = y0 + Math.floor(m / 12);
    const date = `${y}-${String((m % 12) + 1).padStart(2, "0")}-01`;
    out.push({ date, open: v, high: v, low: v, close: v });
    v *= 1 + rate;
  }
  return out;
}

function monthlyInputs(start: string, months: number, over: Partial<AllocationInput> = {}): AllocationInput[] {
  return monthlyBars(start, months, 1, 0).map((b) => input({ date: b.date, ...over }));
}

/* ── caps and structure ───────────────────────────────────────── */

describe("allocation caps", () => {
  test("caps are 60/30/10 and sum to 1 within float tolerance", () => {
    assert.equal(SLEEVES.find((s) => s.key === "stocks")?.cap, 0.6);
    assert.equal(SLEEVES.find((s) => s.key === "gold")?.cap, 0.3);
    assert.equal(SLEEVES.find((s) => s.key === "bitcoin")?.cap, 0.1);
    // 0.6 + 0.3 + 0.1 === 0.9999999999999999 in IEEE754. The engine
    // rounds `invested` to 4dp before deriving cash, so this never
    // leaks into a weight — but it does mean "sums to exactly 1" is a
    // claim about intent, not about the arithmetic.
    assert.ok(Math.abs(SLEEVES.reduce((a, s) => a + s.cap, 0) - 1) < 1e-9);
  });

  test("no sleeve can ever exceed its cap, across every combination", () => {
    const quads = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"] as const;
    const states = ["BULLISH", "BEARISH", "NEUTRAL", "PENDING"] as const;
    for (const q of quads) {
      for (const st of states) {
        for (let h = 0; h <= 6; h++) {
          const a = computeAllocation(
            input({
              marketRegime: q,
              headwinds: h,
              states: { stocks: st, gold: st, bitcoin: st },
            }),
          );
          for (const s of SLEEVES) {
            assert.ok(
              weightOf(a, s.key) <= s.cap + 1e-9,
              `${s.key} ${weightOf(a, s.key)} > cap ${s.cap} (${q}/${st}/h${h})`,
            );
          }
          assert.ok(a.invested <= 1 + 1e-9, "never leveraged");
          assert.ok(a.cash >= -1e-9, "cash never negative");
          assert.ok(Math.abs(a.invested + a.cash - 1) < 1e-9, "weights and cash sum to 1");
        }
      }
    }
  });

  test("best case is exactly the caps — Goldilocks, all bullish, no headwinds", () => {
    const a = computeAllocation(input());
    assert.equal(weightOf(a, "stocks"), 0.6);
    assert.equal(weightOf(a, "bitcoin"), 0.1);
    assert.ok(Math.abs(a.cash - (1 - a.invested)) < 1e-9);
    // gold is deliberately not maxed in Goldilocks
    assert.ok(weightOf(a, "gold") < 0.3);
  });
});

/* ── the signal wiring ────────────────────────────────────────── */

describe("allocation signal", () => {
  test("prefers the market regime over the economic quadrant", () => {
    const a = computeAllocation(
      input({ marketRegime: "DEFLATION", economicQuadrant: "GOLDILOCKS" }),
    );
    assert.equal(a.regime, "DEFLATION");
    assert.equal(a.regimeSource, "market");
  });

  test("falls back to the economic quadrant when the matrix is pending", () => {
    const a = computeAllocation(input({ marketRegime: null, economicQuadrant: "REFLATION" }));
    assert.equal(a.regime, "REFLATION");
    assert.equal(a.regimeSource, "economic");
  });

  test("no regime at all means all cash, not a default risk position", () => {
    const a = computeAllocation(input({ marketRegime: null, economicQuadrant: null }));
    assert.equal(a.invested, 0);
    assert.equal(a.cash, 1);
    assert.equal(a.regimeSource, "none");
  });

  test("bearish VAMS cuts a sleeve hard but not to zero", () => {
    const bull = computeAllocation(input());
    const bear = computeAllocation(
      input({ states: { stocks: "BEARISH", gold: "BULLISH", bitcoin: "BULLISH" } }),
    );
    assert.ok(weightOf(bear, "stocks") < weightOf(bull, "stocks"));
    assert.equal(weightOf(bear, "stocks"), 0.6 * 1.0 * VAMS_MULTIPLIER.BEARISH);
  });

  test("PENDING is treated as neutral, not as bearish", () => {
    assert.equal(VAMS_MULTIPLIER.PENDING, VAMS_MULTIPLIER.NEUTRAL);
  });

  test("an unavailable sleeve is zero-weighted regardless of signal", () => {
    const a = computeAllocation(input({ unavailable: ["bitcoin"] }));
    assert.equal(weightOf(a, "bitcoin"), 0);
    assert.equal(a.weights.find((w) => w.key === "bitcoin")?.available, false);
    assert.ok(weightOf(a, "stocks") > 0, "other sleeves unaffected");
  });
});

/* ── the gold exemption — the easiest thing to get wrong ──────── */

describe("cycle drag", () => {
  test("applies to risk sleeves only — gold is exempt", () => {
    assert.deepEqual(RISK_SLEEVES, ["stocks", "bitcoin"]);
    const calm = computeAllocation(input({ headwinds: 0 }));
    const storm = computeAllocation(input({ headwinds: 6 }));

    assert.ok(weightOf(storm, "stocks") < weightOf(calm, "stocks"));
    assert.ok(weightOf(storm, "bitcoin") < weightOf(calm, "bitcoin"));
    assert.equal(
      weightOf(storm, "gold"),
      weightOf(calm, "gold"),
      "cutting the hedge when cycles turn hostile is the bug this guards",
    );
  });

  test("six headwinds halves the risk sleeves, never zeroes them", () => {
    const storm = computeAllocation(input({ headwinds: 6 }));
    const drag = storm.weights.find((w) => w.key === "stocks")?.cycleDrag;
    assert.equal(drag, 1 - MAX_CYCLE_DRAG);
    assert.ok(weightOf(storm, "stocks") > 0);
  });

  test("headwinds are clamped to 0..6", () => {
    const a = computeAllocation(input({ headwinds: 99 }));
    const b = computeAllocation(input({ headwinds: -5 }));
    assert.equal(a.weights.find((w) => w.key === "stocks")?.cycleDrag, 1 - MAX_CYCLE_DRAG);
    assert.equal(b.weights.find((w) => w.key === "stocks")?.cycleDrag, 1);
  });

  test("gold outweighs stocks in Inflation — the regime scores are not cosmetic", () => {
    const a = computeAllocation(input({ marketRegime: "INFLATION" }));
    assert.ok(SLEEVE_REGIME_SCORE.gold.INFLATION > SLEEVE_REGIME_SCORE.stocks.INFLATION);
    // gold's cap is half of stocks', so check the score ratio held up
    assert.ok(weightOf(a, "gold") / 0.3 > weightOf(a, "stocks") / 0.6);
  });
});

/* ── the backtest ─────────────────────────────────────────────── */

describe("runAllocationBacktest", () => {
  const flatPrices = (months: number, rate: number): PriceSeries => ({
    stocks: monthlyBars("2015-01", months, 100, rate),
    gold: monthlyBars("2015-01", months, 100, rate),
    bitcoin: monthlyBars("2015-01", months, 100, rate),
  });

  test("a rising market with full exposure compounds toward the benchmark", () => {
    const months = 60;
    const r = runAllocationBacktest(
      monthlyInputs("2015-01", months),
      flatPrices(months, 0.01),
      { costBps: 0 },
    );
    assert.ok(r.metrics.totalReturn > 0);
    assert.ok(r.metrics.steps === months - 1, "last input earns no return");
    // invested < 1 (gold is not maxed in Goldilocks) so it should trail
    // a fully-invested benchmark in a uniformly rising market
    assert.ok(r.metrics.totalReturn < (r.benchmarks["100% S&P"]?.totalReturn ?? Infinity));
  });

  test("holds cash instead of losing money when there is no regime", () => {
    const months = 36;
    const r = runAllocationBacktest(
      monthlyInputs("2015-01", months, { marketRegime: null, economicQuadrant: null }),
      flatPrices(months, -0.02),
      { costBps: 0 },
    );
    assert.equal(r.metrics.totalReturn, 0, "all cash earns nothing and loses nothing");
    assert.ok((r.benchmarks["100% S&P"]?.totalReturn ?? 0) < -0.4, "benchmark takes the hit");
    assert.equal(r.metrics.averageInvested, 0);
  });

  test("costs reduce returns and scale with turnover", () => {
    // alternate the regime every month to force turnover
    const months = 48;
    const inputs = monthlyInputs("2015-01", months).map((i, idx) => ({
      ...i,
      marketRegime: (idx % 2 === 0 ? "GOLDILOCKS" : "DEFLATION") as const,
    }));
    const free = runAllocationBacktest(inputs, flatPrices(months, 0.005), { costBps: 0 });
    const costly = runAllocationBacktest(inputs, flatPrices(months, 0.005), { costBps: 100 });
    assert.ok(costly.metrics.totalReturn < free.metrics.totalReturn);
    assert.ok(free.metrics.totalTurnover > 0);
  });

  test("never reaches forward for a price", () => {
    // gold has no bars at all — its weight must contribute nothing
    // rather than borrowing another sleeve's return
    const months = 36;
    const prices: PriceSeries = {
      stocks: monthlyBars("2015-01", months, 100, 0.01),
      gold: [],
      bitcoin: [],
    };
    const r = runAllocationBacktest(monthlyInputs("2015-01", months), prices, { costBps: 0 });
    assert.deepEqual(r.missingSleeves.sort(), ["bitcoin", "gold"]);
    assert.ok(Number.isFinite(r.metrics.totalReturn));
  });

  test("reports a regime change as the rebalance reason", () => {
    const inputs = [
      ...monthlyInputs("2015-01", 3, { marketRegime: "GOLDILOCKS" }),
      ...monthlyInputs("2015-04", 3, { marketRegime: "DEFLATION" }),
    ];
    const r = runAllocationBacktest(inputs, flatPrices(12, 0.005), { costBps: 0 });
    assert.ok(r.steps.every((s) => ["monthly", "regime-change", "hold"].includes(s.reason)));
    assert.ok(r.steps.some((s) => s.rebalanced));
  });

  test("empty input produces zeroed metrics, not NaN", () => {
    const r = runAllocationBacktest([], {}, {});
    assert.equal(r.metrics.steps, 0);
    assert.equal(r.metrics.totalReturn, 0);
    assert.ok(Number.isFinite(r.metrics.returnToVol));
  });

  test("max drawdown is negative-or-zero and bounded by −100%", () => {
    const months = 60;
    const r = runAllocationBacktest(
      monthlyInputs("2015-01", months),
      flatPrices(months, -0.03),
      { costBps: 0 },
    );
    assert.ok(r.metrics.maxDrawdown <= 0);
    assert.ok(r.metrics.maxDrawdown >= -1);
  });

  test("default benchmarks are the two that matter", () => {
    assert.deepEqual(Object.keys(DEFAULT_BENCHMARKS).sort(), ["100% S&P", "static 60/30/10"]);
    assert.equal(DEFAULT_BENCHMARKS["static 60/30/10"].stocks, 0.6);
  });
});

/* ── the live wiring: sleeve symbols must exist in the universe ──
   The daily cycle reads each sleeve's VAMS state out of the risk
   matrix rather than scoring it twice. That only works if every sleeve
   symbol is in REGIME_UNIVERSE — if someone renames a ticker there,
   the sleeve silently becomes "no history" and drops to zero weight.
   These pin that contract. */

describe("sleeve / universe contract", () => {
  test("every sleeve symbol is in the scanned universe", () => {
    const universe = new Set(REGIME_UNIVERSE.map((e) => e.symbol));
    for (const s of SLEEVES) {
      assert.ok(
        universe.has(s.symbol),
        `${s.key} uses ${s.symbol}, which is not in REGIME_UNIVERSE — its VAMS state would never be found`,
      );
    }
  });

  test("sleeve symbols are the expected three", () => {
    assert.deepEqual(
      SLEEVES.map((s) => s.symbol),
      ["^GSPC", "GC=F", "BTC-USD"],
    );
  });

  test("a sleeve with no bar history is unavailable, not merely unsignalled", () => {
    // asOf === null is the "no history" marker the cycle keys on; a
    // short-but-present history yields PENDING with a real asOf and
    // must stay available (VAMS multiplier handles it as neutral).
    const noHistory = computeVams([], "GC=F", "Gold");
    assert.equal(noHistory.asOf, null);
    assert.equal(noHistory.state, "PENDING");

    const shortHistory = computeVams(
      monthlyBars("2025-01", 5, 100, 0.01),
      "GC=F",
      "Gold",
    );
    assert.notEqual(shortHistory.asOf, null, "has bars, so it is available");
    assert.equal(shortHistory.state, "PENDING", "but carries no signal yet");
  });
});
