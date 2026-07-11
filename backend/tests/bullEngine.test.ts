/* ────────────────────────────────────────────────────────────────
   Engine extensions (strength v2 / RS / ranking / transitions) and
   the universe builder.
──────────────────────────────────────────────────────────────── */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atrPct,
  computeTransitions,
  pctChange,
  rankBullSnapshots,
} from "../src/bull/engine";
import { BULL_UNIVERSE, benchmarkFor, toYahooSymbol } from "../src/bull/universe";
import { BullSnapshot, RegimeBar } from "../src/bull/types";

const bar = (date: string, close: number, spread = 2): RegimeBar =>
  ({ date, open: close, high: close + spread / 2, low: close - spread / 2, close });

/* ── ATR / pct change ─────────────────────────────────────────── */

test("atrPct: constant true range → exact ATR%", () => {
  const bars = Array.from({ length: 20 }, (_, i) =>
    bar(`2026-06-${String(i + 1).padStart(2, "0")}`, 100));
  const v = atrPct(bars, 14);
  assert.ok(v !== null && Math.abs(v - 2) < 1e-9);
  assert.equal(atrPct(bars.slice(0, 10), 14), null);
});

test("pctChange over lookback", () => {
  const bars = Array.from({ length: 64 }, (_, i) => bar(`d${i}`, 100 + i));
  const v = pctChange(bars, 63);
  assert.ok(v !== null && Math.abs(v - 63) < 1e-9);
});

/* ── ranking uses vol-normalized strength ─────────────────────── */

function snap(over: Partial<BullSnapshot>): BullSnapshot {
  return {
    symbol: "X", displayName: "X", assetClass: "equity", tier: "us_large",
    runDate: "2026-07-10",
    daily: { trend: 1, line: 1, lastFlipDate: null, lastFlipPrice: null,
      barsSinceFlip: 5, sinceFlipPct: 1, cushionPct: 1, bars: 100, flips: [] },
    weekly: { trend: 1, line: 1, lastFlipDate: null, lastFlipPrice: null,
      barsSinceFlip: 2, sinceFlipPct: 1, cushionPct: 1, bars: 40, flips: [] },
    verdict: "BULLISH", alignedSince: "2026-07-01", daysSinceAligned: 5,
    newlyBullish: true, lastClose: 100, lastCloseDate: "2026-07-09",
    strength: 2, atrPct: 2, strengthVol: 1, rs63: null, adjusted: false,
    rank: 0,
    ...over,
  };
}

test("equal recency: higher strengthVol outranks higher RAW strength", () => {
  const crypto = snap({ symbol: "SOL-USD", strength: 12, atrPct: 8, strengthVol: 1.5 });
  const index = snap({ symbol: "^GSPC", strength: 4, atrPct: 0.8, strengthVol: 5 });
  const ranked = rankBullSnapshots([crypto, index]);
  assert.equal(ranked[0].symbol, "^GSPC");
  assert.equal(ranked[0].rank, 1);
});

test("group order holds: newly bullish → bullish → conflicted D → conflicted W → bearish", () => {
  const ranked = rankBullSnapshots([
    snap({ symbol: "BEAR", verdict: "BEARISH", newlyBullish: false }),
    snap({ symbol: "CW", verdict: "CONFLICT_WEEKLY", newlyBullish: false }),
    snap({ symbol: "NEW", verdict: "BULLISH", newlyBullish: true }),
    snap({ symbol: "CD", verdict: "CONFLICT_DAILY", newlyBullish: false }),
    snap({ symbol: "OLD", verdict: "BULLISH", newlyBullish: false, daysSinceAligned: 90 }),
  ]);
  assert.deepEqual(ranked.map((s) => s.symbol), ["NEW", "OLD", "CD", "CW", "BEAR"]);
});

/* ── transitions ──────────────────────────────────────────────── */

test("computeTransitions: diffs verdicts, suppresses the first-ever scan", () => {
  const curr = [
    snap({ symbol: "A", verdict: "BULLISH" }),
    snap({ symbol: "B", verdict: "BEARISH", newlyBullish: false }),
    snap({ symbol: "C", verdict: "CONFLICT_DAILY", newlyBullish: false }),
  ];
  assert.deepEqual(computeTransitions(new Map(), curr), []);
  const prev = new Map([["A", "BULLISH"], ["B", "BULLISH"]]);
  const t = computeTransitions(prev, curr);
  assert.deepEqual(
    t.map((x) => [x.symbol, x.fromVerdict, x.toVerdict]),
    [["B", "BULLISH", "BEARISH"], ["C", null, "CONFLICT_DAILY"]],
  );
});

/* ── universe builder ─────────────────────────────────────────── */

test("universe: ~650 entries, unique, Yahoo notation, tiers populated", () => {
  const symbols = BULL_UNIVERSE.map((e) => e.symbol);
  assert.equal(new Set(symbols).size, symbols.length, "duplicate symbols");
  assert.ok(BULL_UNIVERSE.length >= 620 && BULL_UNIVERSE.length <= 720,
    `unexpected universe size ${BULL_UNIVERSE.length}`);
  assert.ok(symbols.includes("BRK-B"), "BRK.B must be dashed for Yahoo");
  // Equity-tier tickers must be dash notation (DX-Y.NYB in macro is
  // legitimate Yahoo notation and exempt).
  assert.ok(
    !BULL_UNIVERSE.some(
      (e) => (e.tier === "us_large" || e.tier === "ndx_extra") && e.symbol.includes("."),
    ),
    "no dotted equity tickers may survive",
  );
  for (const tier of ["macro", "us_large", "ndx_extra", "crypto", "etf"] as const) {
    assert.ok(BULL_UNIVERSE.some((e) => e.tier === tier), `tier ${tier} empty`);
  }
  assert.equal(BULL_UNIVERSE.find((e) => e.symbol === "BTC-USD")?.tier, "macro");
});

test("universe: futures config + per-symbol chains (AV for CL, never for GC)", () => {
  const cl = BULL_UNIVERSE.find((e) => e.symbol === "CL=F");
  const gc = BULL_UNIVERSE.find((e) => e.symbol === "GC=F");
  assert.ok(cl?.futures && gc?.futures);
  assert.equal(cl.futures.root, "CL");
  assert.equal(gc.futures.suffix, ".CMX");
  assert.equal(gc.futures.months, "GJMQVZ");
  assert.ok(cl.adapters.includes("alphavantage"));
  assert.ok(!gc.adapters.includes("alphavantage"), "AV has no gold endpoint");
});

test("benchmarks: equities vs ^GSPC, alts vs BTC, benchmarks themselves null", () => {
  const aapl = BULL_UNIVERSE.find((e) => e.symbol === "AAPL")!;
  const eth = BULL_UNIVERSE.find((e) => e.symbol === "ETH-USD")!;
  const btc = BULL_UNIVERSE.find((e) => e.symbol === "BTC-USD")!;
  const gold = BULL_UNIVERSE.find((e) => e.symbol === "GC=F")!;
  assert.equal(benchmarkFor(aapl), "^GSPC");
  assert.equal(benchmarkFor(eth), "BTC-USD");
  assert.equal(benchmarkFor(btc), null);
  assert.equal(benchmarkFor(gold), null);
});

test("toYahooSymbol", () => {
  assert.equal(toYahooSymbol("BRK.B"), "BRK-B");
  assert.equal(toYahooSymbol("AAPL"), "AAPL");
});
