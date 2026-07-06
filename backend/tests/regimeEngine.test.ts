import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  runMoneyLine,
  closedDailyBars,
  resampleWeekly,
  weekStartOf,
  verdictOf,
  computeRegime,
  rankSnapshots,
} from "../src/regime/engine";
import { RegimeBar, RegimeSnapshot, UniverseEntry } from "../src/regime/types";

/* ── helpers ──────────────────────────────────────────────────── */

/** Bars with high = close+1, low = close−1 unless overridden. */
function mkBars(closes: number[], overrides: Record<number, Partial<RegimeBar>> = {}): RegimeBar[] {
  return closes.map((c, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`, // date only matters for flip stamps
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    ...overrides[i],
  }));
}

/** Weekday (Mon–Fri) dates starting at a Monday, oldest → newest. */
function weekdayDates(mondayStart: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${mondayStart}T00:00:00Z`);
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/* ── Money Line state machine (Pine port) ─────────────────────── */

describe("runMoneyLine — Donchian close-flip", () => {
  test("warm-up resolves on first close above the prior-bar channel", () => {
    // i=4: channel of bars 1..3 → hh=11; close 20 > 11 → bull, line = ll = 9
    const s = runMoneyLine(mkBars([10, 10, 10, 10, 20]), 3);
    assert.equal(s.trend, 1);
    assert.equal(s.line, 9);
    assert.equal(s.flips.length, 1);
    assert.equal(s.lastFlipPrice, 20);
    assert.equal(s.barsSinceFlip, 0);
  });

  test("stays warm-up while closes remain inside the channel", () => {
    const s = runMoneyLine(mkBars([10, 10, 10, 10, 10, 10]), 3);
    assert.equal(s.trend, 0);
    assert.equal(s.line, null);
    assert.equal(s.flips.length, 0);
  });

  test("bull → bear flip on close below the ratcheted floor", () => {
    // After bull at i=4 (line 9), i=6 channel bars 3..5 → hh=23, ll=9.
    // close 8 < 9 → bear; line resets to hh=23 of that bar's window.
    const s = runMoneyLine(mkBars([10, 10, 10, 10, 20, 22, 8]), 3);
    assert.equal(s.trend, -1);
    assert.equal(s.line, 23);
    assert.equal(s.flips.length, 2);
    assert.deepEqual(s.flips.map((f) => f.direction), [1, -1]);
    assert.equal(s.lastFlipPrice, 8);
  });

  test("ratchet holds the floor when a wick low enters the window; raw channel follows it down", () => {
    // Bull run to line 24; bar 8 prints a deep wick (low 19) but closes 25.
    // At i=9 the wick is in the window: raw ll drops to 19, ratchet holds 24.
    // Close 20 → ratcheted flips bear; raw stays bull.
    const closes = [10, 10, 10, 20, 30, 40, 25, 35, 25, 20];
    const overrides = { 8: { low: 19, high: 26 } };
    const ratcheted = runMoneyLine(mkBars(closes, overrides), 3, true);
    const raw = runMoneyLine(mkBars(closes, overrides), 3, false);
    assert.equal(ratcheted.trend, -1);
    assert.equal(ratcheted.line, 36); // hh of bars 6..8 = 35+1
    assert.equal(raw.trend, 1);
    assert.equal(raw.line, 19);
  });

  test("flip fires only on CLOSE crossing — an intrabar wick through the line does not flip", () => {
    // Bull with line 9; bar wicks to low 5 (through 9) but closes 15 → no flip.
    const closes = [10, 10, 10, 10, 20, 15];
    const s = runMoneyLine(mkBars(closes, { 5: { low: 5, high: 16 } }), 3);
    assert.equal(s.trend, 1);
    assert.equal(s.flips.length, 1);
  });
});

/* ── closed-bar hygiene + weekly resample ─────────────────────── */

describe("closed bars and weekly resample", () => {
  test("closedDailyBars strips the forming bar (date ≥ runDate)", () => {
    const bars = mkBars([1, 2, 3]);
    bars[0].date = "2026-07-04";
    bars[1].date = "2026-07-05";
    bars[2].date = "2026-07-06"; // forming on the 2026-07-06 run
    const closed = closedDailyBars(bars, "2026-07-06");
    assert.deepEqual(closed.map((b) => b.date), ["2026-07-04", "2026-07-05"]);
  });

  test("weekStartOf anchors to Monday", () => {
    assert.equal(weekStartOf("2026-07-06"), "2026-07-06"); // Monday
    assert.equal(weekStartOf("2026-07-05"), "2026-06-29"); // Sunday
    assert.equal(weekStartOf("2026-07-03"), "2026-06-29"); // Friday
  });

  test("aggregates Mon–Fri into one bar; excludes the week containing the run date", () => {
    const dates = weekdayDates("2026-06-22", 10); // two full weeks
    const bars: RegimeBar[] = dates.map((date, i) => ({
      date, open: 10 + i, high: 12 + i, low: 8 + i, close: 11 + i,
    }));
    // Run on Monday after both weeks → both closed.
    const w = resampleWeekly(bars, "2026-07-06");
    assert.equal(w.length, 2);
    assert.deepEqual(w[0], {
      date: "2026-06-26", open: 10, high: 16, low: 8, close: 15,
    });
    assert.equal(w[1].date, "2026-07-03");
    assert.equal(w[1].close, 20);
    // Run on Friday INSIDE week 2 → week 2 still forming.
    const partial = resampleWeekly(bars, "2026-07-03");
    assert.equal(partial.length, 1);
    assert.equal(partial[0].date, "2026-06-26");
  });

  test("crypto-style 7-day week closes on Sunday", () => {
    const bars: RegimeBar[] = [];
    const d = new Date("2026-06-22T00:00:00Z"); // Mon → Sun
    for (let i = 0; i < 7; i++) {
      bars.push({
        date: d.toISOString().slice(0, 10),
        open: 100, high: 110, low: 90, close: 100 + i,
      });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const w = resampleWeekly(bars, "2026-06-29");
    assert.equal(w.length, 1);
    assert.equal(w[0].date, "2026-06-28"); // Sunday close date
    assert.equal(w[0].close, 106);
  });
});

/* ── verdict mapping (the module's label spec) ────────────────── */

describe("verdictOf", () => {
  test("maps the four states + warm-up exactly per spec", () => {
    assert.equal(verdictOf(1, 1), "BULLISH");
    assert.equal(verdictOf(1, -1), "CONFLICT_DAILY");   // bullish daily only
    assert.equal(verdictOf(-1, 1), "CONFLICT_WEEKLY");  // bullish weekly only
    assert.equal(verdictOf(-1, -1), "BEARISH");
    assert.equal(verdictOf(0, 1), "WARMUP");
    assert.equal(verdictOf(1, 0), "WARMUP");
  });
});

/* ── end-to-end regime + newly-bullish detection ──────────────── */

const ENTRY: UniverseEntry = { symbol: "TEST", displayName: "Test", assetClass: "index" };

/** 12 Mon–Fri weeks engineered so the WEEKLY trend turns bull in
 *  week 5, the DAILY trend flips bear in week 11 (pullback) and
 *  back to bull on Monday of week 12 → freshly aligned BULLISH. */
function alignedBullSeries(): RegimeBar[] {
  const dates = weekdayDates("2026-04-13", 60);
  const closes: number[] = [];
  for (let i = 0; i < 20; i++) closes.push(100);              // wks 1–4 flat
  closes.push(104, 108, 112, 116, 120);                        // wk 5 breakout
  for (let k = 1; k <= 25; k++) closes.push(120 + 0.8 * k);    // wks 6–10 ramp → 140
  closes.push(133, 132, 132, 132, 133);                        // wk 11 pullback (daily bear)
  closes.push(136, 138, 140, 141, 142);                        // wk 12 recovery (daily bull)
  return dates.map((date, i) => ({
    date, open: closes[i], high: closes[i] + 1, low: closes[i] - 1, close: closes[i],
  }));
}

describe("computeRegime — daily + weekly confirmation", () => {
  test("fresh daily re-flip inside a weekly uptrend → newly bullish", () => {
    const snap = computeRegime(ENTRY, alignedBullSeries(), "2026-07-06", 3);

    assert.equal(snap.verdict, "BULLISH");
    assert.equal(snap.daily.trend, 1);
    assert.equal(snap.weekly.trend, 1);

    // Daily: establish wk5 Mon, bear wk11 Mon, bull wk12 Mon.
    assert.deepEqual(
      snap.daily.flips.map((f) => `${f.direction}@${f.date}`),
      ["1@2026-05-11", "-1@2026-06-22", "1@2026-06-29"],
    );
    // Weekly: single bull establishment on week 5's close.
    assert.deepEqual(
      snap.weekly.flips.map((f) => `${f.direction}@${f.date}`),
      ["1@2026-05-15"],
    );

    // Alignment = the later flip (daily, Mon wk12); 4 closed bars since.
    assert.equal(snap.alignedSince, "2026-06-29");
    assert.equal(snap.daysSinceAligned, 4);
    assert.equal(snap.newlyBullish, true);

    assert.equal(snap.lastClose, 142);
    assert.equal(snap.lastCloseDate, "2026-07-03");
    assert.ok(snap.strength !== null && snap.strength > 0);
  });

  test("same series scanned mid-pullback reads CONFLICT_WEEKLY (weekly bull, daily bear)", () => {
    // Run the Monday after week 11: daily is bear, weekly still bull.
    const bars = alignedBullSeries().filter((b) => b.date < "2026-06-29");
    const snap = computeRegime(ENTRY, bars, "2026-06-29", 3);
    assert.equal(snap.daily.trend, -1);
    assert.equal(snap.weekly.trend, 1);
    assert.equal(snap.verdict, "CONFLICT_WEEKLY");
    assert.equal(snap.newlyBullish, false);
    assert.equal(snap.alignedSince, null);
  });

  test("not enough history → WARMUP, never a false signal", () => {
    const snap = computeRegime(ENTRY, alignedBullSeries().slice(0, 8), "2026-07-06", 3);
    assert.equal(snap.verdict, "WARMUP");
    assert.equal(snap.newlyBullish, false);
  });
});

/* ── ranking: recency first, strength breaks ties ─────────────── */

function fakeSnap(p: {
  symbol: string; verdict: RegimeSnapshot["verdict"]; newly?: boolean;
  daysAligned?: number | null; dBarsSince?: number | null; wBarsSince?: number | null;
  strength?: number | null;
}): RegimeSnapshot {
  const tf = (barsSinceFlip: number | null) => ({
    trend: 1 as const, line: 100, lastFlipDate: "2026-06-01", lastFlipPrice: 100,
    barsSinceFlip, sinceFlipPct: 5, cushionPct: 5, bars: 500, flips: [],
  });
  return {
    symbol: p.symbol, displayName: p.symbol, assetClass: "index",
    runDate: "2026-07-06",
    daily: tf(p.dBarsSince ?? 3), weekly: tf(p.wBarsSince ?? 2),
    verdict: p.verdict,
    alignedSince: "2026-06-29", daysSinceAligned: p.daysAligned ?? null,
    newlyBullish: p.newly ?? false,
    lastClose: 100, lastCloseDate: "2026-07-03",
    strength: p.strength ?? 10, rank: 0,
  };
}

describe("rankSnapshots", () => {
  test("newly bullish first (most recent flip on top), then bullish, conflicted, bearish, warm-up", () => {
    const ranked = rankSnapshots([
      fakeSnap({ symbol: "WARM", verdict: "WARMUP" }),
      fakeSnap({ symbol: "BEAR", verdict: "BEARISH", daysAligned: 3 }),
      fakeSnap({ symbol: "CONF_W", verdict: "CONFLICT_WEEKLY", wBarsSince: 1 }),
      fakeSnap({ symbol: "CONF_D", verdict: "CONFLICT_DAILY", dBarsSince: 2 }),
      fakeSnap({ symbol: "BULL_OLD", verdict: "BULLISH", daysAligned: 60 }),
      fakeSnap({ symbol: "NEW_5", verdict: "BULLISH", newly: true, daysAligned: 5 }),
      fakeSnap({ symbol: "NEW_2", verdict: "BULLISH", newly: true, daysAligned: 2 }),
    ]);
    assert.deepEqual(
      ranked.map((s) => s.symbol),
      ["NEW_2", "NEW_5", "BULL_OLD", "CONF_D", "CONF_W", "BEAR", "WARM"],
    );
    assert.deepEqual(ranked.map((s) => s.rank), [1, 2, 3, 4, 5, 6, 7]);
  });

  test("equal recency → higher strength wins", () => {
    const ranked = rankSnapshots([
      fakeSnap({ symbol: "WEAK", verdict: "BULLISH", newly: true, daysAligned: 2, strength: 4 }),
      fakeSnap({ symbol: "STRONG", verdict: "BULLISH", newly: true, daysAligned: 2, strength: 9 }),
    ]);
    assert.deepEqual(ranked.map((s) => s.symbol), ["STRONG", "WEAK"]);
  });
});
