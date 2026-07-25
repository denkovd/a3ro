import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildRegimeTimeline,
  deriveAffinity,
  renderAffinityModule,
  MIN_CELL,
  MIN_LIFT,
  MIN_SAMPLES,
  MAX_CONFIRMS,
  type RegimeLabel,
} from "../src/macro/affinityBacktest";
import { affinityFor, REGIME_AFFINITY } from "../src/macro/vams";
import { MacroObservation } from "../src/sources/fredMacro";
import { RegimeBar } from "../src/regime/types";

/* ── helpers ──────────────────────────────────────────────────── */

/** Monthly observations from a start year, compounding at `rate`/mo. */
function monthly(start: string, count: number, base: number, rate: number): MacroObservation[] {
  const [y0, m0] = start.split("-").map(Number);
  const out: MacroObservation[] = [];
  let v = base;
  for (let i = 0; i < count; i++) {
    const m = m0 - 1 + i;
    const y = y0 + Math.floor(m / 12);
    out.push({ date: `${y}-${String((m % 12) + 1).padStart(2, "0")}-01`, value: v });
    v *= 1 + rate;
  }
  return out;
}

/** Daily bars from a start date, compounding at `rate`/day. */
function bars(start: string, count: number, base: number, rate: number): RegimeBar[] {
  const t0 = new Date(`${start}T00:00:00Z`).getTime();
  const out: RegimeBar[] = [];
  let v = base;
  for (let i = 0; i < count; i++) {
    out.push({
      date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10),
      open: v, high: v, low: v, close: v,
    });
    v *= 1 + rate;
  }
  return out;
}

/** A synthetic timeline alternating between two regimes in blocks. */
function timelineOf(pattern: RegimeLabel["quadrant"][], start = "2015-01-01"): RegimeLabel[] {
  const t0 = new Date(`${start}T00:00:00Z`).getTime();
  return pattern.map((quadrant, i) => ({
    date: new Date(t0 + i * 30 * 86_400_000).toISOString().slice(0, 10),
    quadrant,
  }));
}

/* ── timeline construction ────────────────────────────────────── */

describe("buildRegimeTimeline", () => {
  test("labels history with the live engine and skips the warm-up", () => {
    // growth accelerating, inflation cooling → Goldilocks territory
    const growth = monthly("2010-01", 120, 100, 0.004);
    const inflation = monthly("2010-01", 120, 100, 0.001);
    const tl = buildRegimeTimeline(growth, inflation);

    assert.ok(tl.length > 0, "produces labels");
    // 2y warm-up from the first observation
    assert.ok(tl[0].date >= "2012-01-01", `first label ${tl[0].date} is past warm-up`);
    assert.ok(tl.every((l) => l.quadrant !== ("PENDING" as never)), "no PENDING labels leak through");
  });

  test("empty inputs produce no labels rather than throwing", () => {
    assert.deepEqual(buildRegimeTimeline([], []), []);
    assert.deepEqual(buildRegimeTimeline(monthly("2015-01", 60, 100, 0.003), []), []);
  });

  test("stops at the shorter of the two series — no extrapolation", () => {
    const growth = monthly("2010-01", 120, 100, 0.004);
    const inflation = monthly("2010-01", 60, 100, 0.002); // ends 5y earlier
    const tl = buildRegimeTimeline(growth, inflation);
    assert.ok(tl[tl.length - 1].date <= inflation[inflation.length - 1].date);
  });
});

/* ── affinity derivation ──────────────────────────────────────── */

describe("deriveAffinity", () => {
  test("an asset that only rises in one regime confirms that regime", () => {
    // 120 months alternating REFLATION / DEFLATION in 12-month blocks
    const pattern: RegimeLabel["quadrant"][] = [];
    for (let block = 0; block < 10; block++) {
      const q = block % 2 === 0 ? "REFLATION" : "DEFLATION";
      for (let i = 0; i < 12; i++) pattern.push(q);
    }
    const tl = timelineOf(pattern);

    // price rises through REFLATION blocks, falls through DEFLATION
    const out: RegimeBar[] = [];
    let v = 100;
    const t0 = new Date("2014-01-01T00:00:00Z").getTime();
    for (let d = 0; d < 4200; d++) {
      const date = new Date(t0 + d * 86_400_000).toISOString().slice(0, 10);
      const label = tl.filter((l) => l.date <= date).pop();
      const rising = label?.quadrant === "REFLATION";
      v *= rising ? 1.0015 : 0.9985;
      out.push({ date, open: v, high: v, low: v, close: v });
    }

    const ev = deriveAffinity(out, tl, "TEST");
    assert.ok(ev.sufficient, `${ev.samples} months should clear the floor of ${MIN_SAMPLES}`);
    assert.ok(ev.derived.bullish.includes("REFLATION"), "bullish confirms the regime it rises in");
    assert.ok(ev.derived.bearish.includes("DEFLATION"), "bearish confirms the regime it falls in");
    assert.ok(!ev.derived.bullish.includes("DEFLATION"));
  });

  test("an asset uncorrelated with regime confirms nothing", () => {
    // regime alternates monthly; price trends steadily up regardless,
    // so BULLISH is spread evenly across regimes → lift ≈ 1
    const pattern: RegimeLabel["quadrant"][] = [];
    for (let i = 0; i < 120; i++) {
      pattern.push(i % 2 === 0 ? "REFLATION" : "DEFLATION");
    }
    const tl = timelineOf(pattern);
    const steady = bars("2014-01-01", 4200, 100, 0.0004);

    const ev = deriveAffinity(steady, tl, "TEST");
    assert.ok(ev.sufficient);
    for (const s of ev.bullish) {
      assert.ok(s.lift < MIN_LIFT, `${s.quadrant} lift ${s.lift} should not clear ${MIN_LIFT}`);
    }
    assert.deepEqual(ev.derived.bullish, [], "no spurious affinity from a trend alone");
  });

  test("short history is marked insufficient and derives nothing", () => {
    const tl = timelineOf(Array.from({ length: 20 }, () => "REFLATION" as const));
    const ev = deriveAffinity(bars("2015-01-01", 700, 100, 0.001), tl, "TEST");
    assert.equal(ev.sufficient, false);
    assert.deepEqual(ev.derived.bullish, []);
    assert.deepEqual(ev.derived.bearish, []);
  });

  test("no bars at all is handled, not thrown on", () => {
    const tl = timelineOf(Array.from({ length: 120 }, () => "REFLATION" as const));
    const ev = deriveAffinity([], tl, "TEST");
    assert.equal(ev.samples, 0);
    assert.equal(ev.sufficient, false);
    assert.equal(ev.from, null);
  });

  test("never confirms more regimes than the cap", () => {
    const pattern: RegimeLabel["quadrant"][] = [];
    const qs = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"] as const;
    for (let i = 0; i < 160; i++) pattern.push(qs[i % 4]);
    const tl = timelineOf(pattern);
    const ev = deriveAffinity(bars("2014-01-01", 5500, 100, 0.0008), tl, "TEST");
    assert.ok(ev.derived.bullish.length <= MAX_CONFIRMS);
    assert.ok(ev.derived.bearish.length <= MAX_CONFIRMS);
  });

  test("base rate uses only months the asset was scored in", () => {
    // Asset starts late: its bars only cover the DEFLATION half. If the
    // base rate were computed over the whole timeline, REFLATION would
    // look impossibly rare and DEFLATION's lift would collapse toward 1.
    const pattern: RegimeLabel["quadrant"][] = [
      ...Array.from({ length: 60 }, () => "REFLATION" as const),
      ...Array.from({ length: 60 }, () => "DEFLATION" as const),
    ];
    const tl = timelineOf(pattern);
    // bars begin around the DEFLATION block
    const late = bars("2019-06-01", 2200, 100, -0.001);
    const ev = deriveAffinity(late, tl, "TEST");
    // every scored month is DEFLATION → base rate 100% → lift 1, not 2
    const defl = ev.bearish.find((s) => s.quadrant === "DEFLATION");
    if (defl) assert.ok(defl.lift <= 1.001, `lift ${defl.lift} should be ~1, not inflated`);
  });

  test("cells below the minimum count never confirm", () => {
    const ev = deriveAffinity(
      bars("2014-01-01", 4200, 100, 0.001),
      timelineOf([
        ...Array.from({ length: 118 }, () => "REFLATION" as const),
        // only 2 GOLDILOCKS months — below MIN_CELL even at high lift
        ...Array.from({ length: 2 }, () => "GOLDILOCKS" as const),
      ]),
      "TEST",
    );
    const g = ev.bullish.find((s) => s.quadrant === "GOLDILOCKS");
    if (g) assert.ok(g.n < MIN_CELL);
    assert.ok(!ev.derived.bullish.includes("GOLDILOCKS"));
  });
});

/* ── the derived-over-handwritten seam ────────────────────────── */

describe("affinityFor", () => {
  test("falls back to the hand-written table when nothing is derived", () => {
    assert.deepEqual(affinityFor("^GSPC", {}), REGIME_AFFINITY["^GSPC"]);
  });

  test("prefers the derived entry when one exists", () => {
    const derived = { "^GSPC": { bullish: ["INFLATION" as const], bearish: [] } };
    assert.deepEqual(affinityFor("^GSPC", derived), derived["^GSPC"]);
  });

  test("an unmapped symbol confirms nothing either way", () => {
    assert.deepEqual(affinityFor("NOPE", {}), { bullish: [], bearish: [] });
  });

  test("a derived entry for one symbol does not disturb others", () => {
    const derived = { "^GSPC": { bullish: ["INFLATION" as const], bearish: [] } };
    assert.deepEqual(affinityFor("TLT", derived), REGIME_AFFINITY["TLT"]);
  });
});

/* ── generated module ─────────────────────────────────────────── */

describe("renderAffinityModule", () => {
  const meta = { generatedAt: "2026-07-25", timelineFrom: "2002-01-01", timelineTo: "2026-06-01", labels: 250 };

  test("emits only sufficient assets and records the rest", () => {
    const out = renderAffinityModule(
      [
        {
          symbol: "^GSPC", samples: 200, bullishN: 120, bearishN: 80,
          bullish: [{ quadrant: "REFLATION", n: 60, lift: 1.4 }],
          bearish: [{ quadrant: "DEFLATION", n: 40, lift: 1.5 }],
          derived: { bullish: ["REFLATION"], bearish: ["DEFLATION"] },
          sufficient: true, from: "2005-01-01", to: "2026-06-01",
        },
        {
          symbol: "SOL-USD", samples: 20, bullishN: 12, bearishN: 8,
          bullish: [], bearish: [],
          derived: { bullish: [], bearish: [] },
          sufficient: false, from: "2024-01-01", to: "2026-06-01",
        },
      ],
      meta,
    );

    assert.match(out, /"\^GSPC": \{ bullish: \["REFLATION"\], bearish: \["DEFLATION"\] \}/);
    assert.doesNotMatch(out, /"SOL-USD":/, "insufficient assets are not emitted as entries");
    assert.match(out, /SOL-USD — 20 months/, "but are recorded as skipped");
    assert.match(out, /1\.4×\/60/, "evidence is in the file for review");
    assert.match(out, /GENERATED — do not edit by hand/);
  });

  test("output is valid TypeScript shape with the expected exports", () => {
    const out = renderAffinityModule([], meta);
    assert.match(out, /export const REGIME_AFFINITY_DERIVED/);
    assert.match(out, /export const AFFINITY_GENERATED_AT: string \| null/);
    assert.match(out, /import \{ MacroQuadrant \} from "\.\/types";/);
  });
});
