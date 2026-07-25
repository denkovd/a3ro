import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  realizedVol,
  percentileRank,
  rollingVol,
  netLiquiditySeries,
  computeNominalGrowth,
  computeLiquidityStress,
} from "../src/macro/engine";
import { computeVams, computeRiskMatrix, dailyLogVol } from "../src/macro/vams";
import {
  policyCycle,
  profitsCycle,
  liquidityCycle,
  positioningCycle,
  computeSixCycles,
} from "../src/macro/cycles";
import { readGlobalBonds } from "../src/macro/globalBonds";
import {
  fetchMacroPanel,
  MACRO_SERIES,
  REQUIRED_SERIES_KEYS,
  MacroObservation,
  MacroSeries,
} from "../src/sources/fredMacro";
import { RegimeBar } from "../src/regime/types";

/* ── helpers ──────────────────────────────────────────────────── */

/** Daily observations starting at 2025-01-01, one per calendar day. */
function obs(values: number[], startIso = "2025-01-01"): MacroObservation[] {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  return values.map((value, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}

/** Monthly observations, first of each month. */
function monthly(values: number[], startYear = 2020, startMonth = 1): MacroObservation[] {
  return values.map((value, i) => {
    const m = startMonth - 1 + i;
    const y = startYear + Math.floor(m / 12);
    const mm = String((m % 12) + 1).padStart(2, "0");
    return { date: `${y}-${mm}-01`, value };
  });
}

function series(key: string, observations: MacroObservation[]): MacroSeries {
  return { seriesId: key, key, axis: "rates", frequency: "daily", units: "%", observations };
}

function bars(closes: number[], startIso = "2024-01-01"): RegimeBar[] {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  return closes.map((close, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    open: close, high: close, low: close, close,
  }));
}

/* ── realizedVol ──────────────────────────────────────────────── */

describe("realizedVol", () => {
  test("a perfectly linear series has zero volatility of its changes", () => {
    // constant +1 per step → every change identical → σ = 0
    assert.equal(realizedVol(obs([1, 2, 3, 4, 5, 6]), 5, "diff"), 0);
  });

  test("diff mode measures absolute change, not percent", () => {
    // 7 obs / window 6 → changes +1,−1,+1,−1,+1,−1: mean exactly 0, σ = 1.
    // (An odd number of changes would leave a non-zero mean and σ < 1 —
    // the estimator is a deviation-from-mean, not a mean-absolute.)
    const v = realizedVol(obs([10, 11, 10, 11, 10, 11, 10]), 6, "diff");
    assert.ok(v !== null && Math.abs(v - 1) < 1e-9);
  });

  test("diff and pct disagree on a rate series — the reason mode exists", () => {
    const rates = obs([4.0, 4.1, 4.0, 4.1, 4.0, 4.1, 4.0]);
    const d = realizedVol(rates, 6, "diff");
    const p = realizedVol(rates, 6, "pct");
    assert.ok(d !== null && p !== null);
    assert.ok(Math.abs(d - 0.1) < 1e-9, "diff sees a 10bp swing");
    assert.ok(p > 2, "pct sees ~2.5% swings — wrong unit for a yield");
  });

  test("returns null rather than a noisy estimate when history is short", () => {
    assert.equal(realizedVol(obs([1, 2, 3]), 20, "diff"), null);
  });

  test("returns null on a zero denominator in pct mode", () => {
    assert.equal(realizedVol(obs([1, 0, 1, 0, 1, 0]), 5, "pct"), null);
  });
});

describe("percentileRank", () => {
  test("ranks within the sample", () => {
    assert.equal(percentileRank([1, 2, 3, 4], 3), 0.75);
    assert.equal(percentileRank([1, 2, 3, 4], 4), 1);
    assert.equal(percentileRank([1, 2, 3, 4], 0), 0);
  });
  test("empty history is null, not zero — absence is not a low reading", () => {
    assert.equal(percentileRank([], 5), null);
  });
  test("a constant history is null — ranking inside it is meaningless", () => {
    // Guards the trap this test suite caught: 0 vol against a history
    // of 0s would otherwise rank as the 100th percentile, i.e. read as
    // a volatility breakout when it is the exact opposite.
    assert.equal(percentileRank([0, 0, 0, 0], 0), null);
    assert.equal(percentileRank([3, 3, 3], 3), null);
  });
});

describe("rollingVol", () => {
  test("produces one reading per additional observation, trimmed to history", () => {
    const v = rollingVol(obs(Array.from({ length: 40 }, (_, i) => i % 3)), 5, "diff", 10);
    assert.equal(v.length, 10);
    assert.ok(v.every((x) => Number.isFinite(x)));
  });
});

/* ── netLiquiditySeries — the unit trap ───────────────────────── */

describe("netLiquiditySeries", () => {
  test("converts RRP from $bn to $mn before subtracting", () => {
    const panel = [
      series("fed_assets", obs([7_000_000])),   // $7.0tn in $mn
      series("fed_tga", obs([800_000])),        // $800bn in $mn
      series("fed_rrp", obs([500])),            // $500bn in $BN
    ];
    const out = netLiquiditySeries(panel);
    assert.equal(out.length, 1);
    // 7,000,000 − 800,000 − (500 × 1000) = 5,700,000
    assert.equal(out[0].value, 5_700_000);
  });

  test("skips dates where a drain is unknown rather than under-subtracting", () => {
    const panel = [
      series("fed_assets", obs([7_000_000, 7_100_000], "2025-06-01")),
      series("fed_tga", obs([800_000], "2025-06-02")), // starts a day late
      series("fed_rrp", obs([500], "2025-06-02")),
    ];
    const out = netLiquiditySeries(panel);
    // the first WALCL date has no TGA/RRP on or before it → dropped
    assert.equal(out.length, 1);
    assert.equal(out[0].date, "2025-06-02");
  });

  test("returns empty when the balance sheet series is missing", () => {
    assert.deepEqual(netLiquiditySeries([series("fed_tga", obs([1]))]), []);
  });
});

/* ── nominal growth vs its own trend ──────────────────────────── */

describe("computeNominalGrowth", () => {
  test("computes trend means from the same series, and the gap", () => {
    // quarterly-ish monthly points growing 5%/yr through 2003-07 and
    // 2015-19, then 8%/yr most recently
    const pts: MacroObservation[] = [];
    let v = 100;
    for (let y = 2002; y <= 2020; y++) {
      for (let m = 1; m <= 12; m += 3) {
        pts.push({ date: `${y}-${String(m).padStart(2, "0")}-01`, value: v });
        v *= 1.05 ** 0.25;
      }
    }
    const snap = computeNominalGrowth(pts, "2020-12-31");
    assert.ok(snap.trend0307 !== null && Math.abs(snap.trend0307 - 5) < 0.3);
    assert.ok(snap.trend1519 !== null && Math.abs(snap.trend1519 - 5) < 0.3);
    assert.ok(snap.gapToRecentTrend !== null && Math.abs(snap.gapToRecentTrend) < 0.5);
  });

  test("degrades honestly with no data", () => {
    const snap = computeNominalGrowth([], "2026-07-25");
    assert.equal(snap.yoy, null);
    assert.equal(snap.aboveTrend, null);
    assert.match(snap.headline, /Awaiting/);
  });
});

/* ── liquidity stress composite ───────────────────────────────── */

describe("computeLiquidityStress", () => {
  test("reports insufficient rather than scoring off one or two legs", () => {
    const snap = computeLiquidityStress([series("vol_equity", obs([20]))], null, "2026-07-25");
    assert.equal(snap.score, null);
    assert.equal(snap.status, "insufficient");
    assert.equal(snap.riskPremiumAlert, false);
    assert.match(snap.headline, /Awaiting/);
  });

  test("scores 0..100 and keeps every leg inspectable", () => {
    const panel = [
      series("rates_10y", obs(Array.from({ length: 400 }, (_, i) => 4 + (i % 7) * 0.01))),
      series("dollar_broad", obs(Array.from({ length: 400 }, (_, i) => 100 + (i % 5) * 0.2))),
      series("vol_equity", obs([22])),
      series("credit_hy_oas", obs([4.5])),
      series("curve_10y2y", obs([0.2])),
    ];
    const snap = computeLiquidityStress(panel, null, "2026-07-25");
    assert.ok(snap.score !== null && snap.score >= 0 && snap.score <= 100);
    assert.equal(snap.legs.length, 8, "all eight legs always present, live or not");
    // the two legs with no data must be null, never a silent zero
    const gb = snap.legs.find((l) => l.key === "global_bonds");
    assert.equal(gb?.normalized, null);
    const nl = snap.legs.find((l) => l.key === "net_liquidity");
    assert.equal(nl?.normalized, null);
  });

  test("fixed scales are honoured — VIX 32 pins the equity-vol leg at 1", () => {
    const panel = [
      series("vol_equity", obs([32])),
      series("credit_hy_oas", obs([8])),
      series("curve_10y2y", obs([-1])),
      series("rates_10y", obs(Array.from({ length: 100 }, () => 4))),
    ];
    const snap = computeLiquidityStress(panel, null, "2026-07-25");
    const vix = snap.legs.find((l) => l.key === "equity_vol");
    const oas = snap.legs.find((l) => l.key === "credit_hy_oas");
    const curve = snap.legs.find((l) => l.key === "curve_10y2y");
    assert.equal(vix?.normalized, 1);
    assert.equal(oas?.normalized, 1);
    assert.equal(curve?.normalized, 1);
  });

  test("risk-premium alert needs BOTH a high composite and a bond-vol breakout", () => {
    // maximal stress on level legs, but a dead-flat rate series → no
    // bond-vol percentile → the alert must stay off
    const flat = obs(Array.from({ length: 400 }, () => 4));
    const panel = [
      series("rates_10y", flat),
      series("vol_equity", obs([40])),
      series("credit_hy_oas", obs([9])),
      series("curve_10y2y", obs([-2])),
    ];
    const snap = computeLiquidityStress(panel, null, "2026-07-25");
    assert.ok(snap.score !== null && snap.score >= 60, "composite is elevated");
    const bv = snap.legs.find((l) => l.key === "bond_vol");
    assert.equal(bv?.value, 0, "flat rates → zero realized vol");
    assert.equal(bv?.normalized, null, "a constant vol history cannot be percentiled");
    assert.equal(snap.riskPremiumAlert, false, "elevated alone must not fire the alert");
  });

  test("the alert DOES fire when the composite is elevated and bond vol breaks out", () => {
    // rates quiet for a long stretch, then a violent recent burst →
    // current realized vol at the top of its own history
    const quiet = Array.from({ length: 300 }, (_, i) => 4 + (i % 2) * 0.005);
    const burst = Array.from({ length: 40 }, (_, i) => 4 + (i % 2) * 0.5);
    const panel = [
      series("rates_10y", obs([...quiet, ...burst])),
      series("vol_equity", obs([38])),
      series("credit_hy_oas", obs([8.5])),
      series("curve_10y2y", obs([-1.5])),
    ];
    const snap = computeLiquidityStress(panel, null, "2026-07-25");
    const bv = snap.legs.find((l) => l.key === "bond_vol");
    assert.ok(bv?.normalized !== null && (bv?.normalized ?? 0) >= 0.8, "bond vol at the top of its range");
    assert.ok(snap.score !== null && snap.score >= 60);
    assert.equal(snap.riskPremiumAlert, true);
    assert.match(snap.headline, /Risk-premium repricing/);
  });

  test("global bond loss raises the stress leg", () => {
    const panel = [
      series("vol_equity", obs([20])),
      series("credit_hy_oas", obs([4])),
      series("curve_10y2y", obs([0.5])),
      series("rates_10y", obs(Array.from({ length: 100 }, () => 4))),
    ];
    const gb = { symbol: "BWX", label: "x", asOf: "2026-07-24", return1m: -2, return3m: -4, drawdown1y: -6 };
    const snap = computeLiquidityStress(panel, gb, "2026-07-25");
    const leg = snap.legs.find((l) => l.key === "global_bonds");
    assert.equal(leg?.normalized, 1, "−2% 1m return pins the leg at maximum stress");
    assert.match(leg?.note ?? "", /BWX/);
  });
});

/* ── VAMS ─────────────────────────────────────────────────────── */

describe("VAMS", () => {
  test("a steady uptrend is bullish; a steady downtrend is bearish", () => {
    const up = bars(Array.from({ length: 100 }, (_, i) => 100 * 1.002 ** i));
    const down = bars(Array.from({ length: 100 }, (_, i) => 100 * 0.998 ** i));
    assert.equal(computeVams(up, "^GSPC", "S&P 500").state, "BULLISH");
    assert.equal(computeVams(down, "^GSPC", "S&P 500").state, "BEARISH");
  });

  test("volatility adjustment is real — the same return in a noisier market scores lower", () => {
    const n = 100;
    const quiet = bars(Array.from({ length: n }, (_, i) => 100 * 1.002 ** i));
    // same endpoints, much noisier path
    const noisy = bars(
      Array.from({ length: n }, (_, i) => 100 * 1.002 ** i * (1 + (i % 2 === 0 ? 0.05 : -0.05))),
    );
    const q = computeVams(quiet, "^GSPC", "S&P 500").z;
    const v = computeVams(noisy, "^GSPC", "S&P 500").z;
    assert.ok(q !== null && v !== null);
    assert.ok(v < q, "more noise for the same drift ⇒ weaker signal");
  });

  test("short history is PENDING, not NEUTRAL — 'unknown' ≠ 'no trend'", () => {
    const read = computeVams(bars([1, 2, 3]), "^GSPC", "S&P 500");
    assert.equal(read.state, "PENDING");
    assert.deepEqual(read.confirms, []);
  });

  test("an unmapped symbol scores but confirms nothing", () => {
    const up = bars(Array.from({ length: 100 }, (_, i) => 100 * 1.002 ** i));
    const read = computeVams(up, "NOT-A-SYMBOL", "Unknown");
    assert.equal(read.state, "BULLISH");
    assert.deepEqual(read.confirms, []);
  });

  test("dailyLogVol rejects non-positive prices rather than returning NaN", () => {
    assert.equal(dailyLogVol(bars([10, 0, 10, 10, 10, 10]), 5), null);
  });
});

describe("risk matrix", () => {
  test("splits each market's point across the regimes it confirms", () => {
    // one market confirming two regimes → 0.5 each → 50/50 shares
    const reads = [
      { symbol: "A", displayName: "A", state: "BULLISH" as const, z: 1, return63: 5,
        asOf: "2026-07-24", confirms: ["GOLDILOCKS" as const, "REFLATION" as const] },
    ];
    const m = computeRiskMatrix(reads, "2026-07-25");
    assert.equal(m.shares.GOLDILOCKS, 0.5);
    assert.equal(m.shares.REFLATION, 0.5);
    assert.equal(m.riskOnShare, 1);
  });

  test("a two-regime market does not outvote a one-regime market", () => {
    const reads = [
      { symbol: "A", displayName: "A", state: "BULLISH" as const, z: 1, return63: 5,
        asOf: "d", confirms: ["GOLDILOCKS" as const, "REFLATION" as const] },
      { symbol: "B", displayName: "B", state: "BEARISH" as const, z: -1, return63: -5,
        asOf: "d", confirms: ["DEFLATION" as const] },
    ];
    const m = computeRiskMatrix(reads, "2026-07-25");
    // A contributes 1 point total, B contributes 1 point total
    assert.equal(m.shares.DEFLATION, 0.5);
    assert.equal(m.shares.GOLDILOCKS + m.shares.REFLATION, 0.5);
    assert.equal(m.modalRegime, "DEFLATION");
  });

  test("neutral and pending markets contribute nothing", () => {
    const reads = [
      { symbol: "A", displayName: "A", state: "NEUTRAL" as const, z: 0, return63: 0, asOf: "d", confirms: [] },
      { symbol: "B", displayName: "B", state: "PENDING" as const, z: null, return63: null, asOf: null, confirms: [] },
      { symbol: "C", displayName: "C", state: "BULLISH" as const, z: 1, return63: 5, asOf: "d",
        confirms: ["REFLATION" as const] },
    ];
    const m = computeRiskMatrix(reads, "2026-07-25");
    assert.equal(m.shares.REFLATION, 1);
    assert.equal(m.modalRegime, "REFLATION");
  });

  test("no confirmations at all is PENDING, not a default regime", () => {
    const m = computeRiskMatrix(
      [{ symbol: "A", displayName: "A", state: "NEUTRAL", z: 0, return63: 0, asOf: "d", confirms: [] }],
      "2026-07-25",
    );
    assert.equal(m.modalRegime, "PENDING");
    assert.equal(m.riskOnShare, null);
  });
});

/* ── the six cycles ───────────────────────────────────────────── */

describe("six cycles", () => {
  test("policy combines real rate and fiscal impulse into ONE cycle", () => {
    const panel = [
      series("policy_rate", obs([5.5])),
      series("inflation_cpi", monthly(Array.from({ length: 30 }, (_, i) => 100 * 1.002 ** i))),
      // 24 months of deficits, second year much wider
      series("fiscal_balance", monthly([
        ...Array.from({ length: 12 }, () => -100_000),
        ...Array.from({ length: 12 }, () => -150_000),
      ])),
    ];
    const c = policyCycle(panel);
    assert.equal(c.key, "policy");
    assert.equal(c.detail?.length, 2, "both sub-reads stay visible");
    assert.equal(c.detail?.[1].note, "deficit widening");
    assert.ok(c.detail?.[0].value !== null, "real policy rate computed");
  });

  test("policy degrades to neutral/brief with no series", () => {
    const c = policyCycle([]);
    assert.equal(c.score, "NEUTRAL");
    assert.equal(c.source, "brief");
    assert.equal(c.note, "pending");
  });

  test("profits distinguishes expanding-but-decelerating from contracting", () => {
    // growing 10%/yr then flattening → expanding, decelerating
    const grow = monthly(Array.from({ length: 40 }, (_, i) => 100 * 1.008 ** i));
    const g = profitsCycle([series("corporate_profits", grow)]);
    assert.ok(g.score === "TAILWIND" || g.score === "NEUTRAL");

    const shrink = monthly(Array.from({ length: 40 }, (_, i) => 100 * 0.99 ** i));
    const s = profitsCycle([series("corporate_profits", shrink)]);
    assert.equal(s.score, "HEADWIND");
    assert.equal(s.note, "contracting");
  });

  test("liquidity scores off the shared net-liquidity series", () => {
    const expanding = obs(Array.from({ length: 200 }, (_, i) => 5_000_000 + i * 5_000));
    assert.equal(liquidityCycle(expanding).score, "TAILWIND");
    const contracting = obs(Array.from({ length: 200 }, (_, i) => 5_000_000 - i * 5_000));
    assert.equal(liquidityCycle(contracting).score, "HEADWIND");
    assert.equal(liquidityCycle([]).score, "NEUTRAL");
  });

  test("positioning is contrarian — low realized vol is a HEADWIND", () => {
    // 300 noisy bars then a long quiet stretch → current vol near the
    // bottom of its own history → crowded
    const noisy = Array.from({ length: 300 }, (_, i) => 100 * (1 + (i % 2 === 0 ? 0.04 : -0.04)));
    const quiet = Array.from({ length: 300 }, () => 100);
    const c = positioningCycle(bars([...noisy, ...quiet]), []);
    assert.equal(c.score, "HEADWIND");
    assert.match(c.note, /crowded/);
  });

  test("positioning with no bars is pending, not a false all-clear", () => {
    const c = positioningCycle([], []);
    assert.equal(c.score, "NEUTRAL");
    assert.equal(c.note, "pending");
    assert.equal(c.source, "brief");
  });

  test("computeSixCycles returns exactly Dale's six, in order", () => {
    const snap = computeSixCycles([], [], [], [], "2026-07-25");
    assert.deepEqual(
      snap.cycles.map((c) => c.key),
      ["growth", "inflation", "policy", "profits", "liquidity", "positioning"],
    );
  });

  test("headwind count drives the sustainability headline", () => {
    const snap = computeSixCycles([], [], [], [], "2026-07-25");
    assert.equal(snap.tailwinds + snap.headwinds <= 6, true);
    assert.ok(snap.headline.length > 0);
  });
});

/* ── global bond stress ───────────────────────────────────────── */

describe("readGlobalBonds", () => {
  test("computes 1m return and drawdown from the trailing high", () => {
    const closes = [...Array.from({ length: 30 }, () => 100), ...Array.from({ length: 22 }, () => 98)];
    const r = readGlobalBonds(bars(closes), "BWX", "Intl Treasury");
    assert.ok(r !== null);
    assert.equal(r.return1m, 0, "flat over the last 21 sessions");
    assert.equal(r.drawdown1y, -2, "2% below the trailing high");
  });

  test("too little history returns null rather than a fabricated read", () => {
    assert.equal(readGlobalBonds(bars([1, 2, 3]), "BWX", "x"), null);
  });
});

/* ── panel isolation ──────────────────────────────────────────────
   The refresh took the panel from 7 series to 15 on an all-or-nothing
   fetch. These pin the isolation that makes that safe. */

describe("fetchMacroPanel isolation", () => {
  /** A fetch stub that serves valid CSV for every series except the
   *  named ones, which 500. Parses the id param rather than substring
   *  matching — "CP" is a prefix of "CPIAUCSL", and matching loosely
   *  would kill a required series and mask the behaviour under test. */
  const stubFetch = (deadSeriesIds: string[]) =>
    (async (url: string | URL | Request) => {
      const id = new URL(String(url)).searchParams.get("id") ?? "";
      if (deadSeriesIds.includes(id)) return new Response("boom", { status: 500 });
      return new Response("observation_date,V\n2026-07-01,1.0\n2026-07-02,1.1\n", { status: 200 });
    }) as unknown as typeof fetch;

  test("an optional series failing degrades one leg, not the whole panel", async () => {
    const failures: string[] = [];
    const panel = await fetchMacroPanel({
      fetchImpl: stubFetch(["VIXCLS", "CP"]),
      onSeriesError: (f) => failures.push(f.seriesId),
    });
    assert.equal(panel.length, MACRO_SERIES.length - 2, "the other 13 still return");
    assert.deepEqual(failures.sort(), ["CP", "VIXCLS"]);
    assert.equal(panel.find((s) => s.key === "vol_equity"), undefined);
    assert.ok(panel.find((s) => s.key === "growth_indpro"), "the GRID axes survive");
  });

  test("a REQUIRED series failing still throws — no quadrant, no snapshot", async () => {
    await assert.rejects(
      () => fetchMacroPanel({ fetchImpl: stubFetch(["INDPRO"]) }),
      /INDPRO/,
    );
  });

  test("the required keys are exactly the GRID's two axes", () => {
    assert.deepEqual([...REQUIRED_SERIES_KEYS], ["growth_indpro", "inflation_cpi"]);
    for (const key of REQUIRED_SERIES_KEYS) {
      assert.ok(MACRO_SERIES.some((s) => s.key === key), `${key} is in the panel`);
    }
  });

  test("a clean panel reports no failures", async () => {
    const failures: string[] = [];
    const panel = await fetchMacroPanel({
      fetchImpl: stubFetch([]),
      onSeriesError: (f) => failures.push(f.seriesId),
    });
    assert.equal(panel.length, MACRO_SERIES.length);
    assert.equal(failures.length, 0);
  });
});
