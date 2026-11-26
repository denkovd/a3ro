import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, dailyPoints, lastDaysSum, matchFeesEntry, monthly, usdAmount, type Inputs } from "../src/crypto/defillama";
import { CRYPTO_PROJECTS, type CryptoProject } from "../src/crypto/projects";

const DAY = 86_400;
const t0 = Date.UTC(2026, 0, 1) / 1000; // 1 Jan 2026
const days = (n: number, v: (i: number) => number) => Array.from({ length: n }, (_, i) => [t0 + i * DAY, v(i)]);

describe("crypto fundamentals: parsing", () => {
  test("stablecoin amounts: number or {peggedUSD, peggedEUR}", () => {
    assert.equal(usdAmount(5), 5);
    assert.equal(usdAmount({ peggedUSD: 10, peggedEUR: 2 }), 12);
    assert.equal(usdAmount(null), null);
  });
  test("daily points from [[t, v]] and [{date, tvl}], sorted", () => {
    assert.deepEqual(dailyPoints([[20, 2], [10, 1]]).map((p) => p.v), [1, 2]);
    assert.deepEqual(dailyPoints([{ date: "10", tvl: 3 }]), [{ t: 10, v: 3 }]);
    assert.deepEqual(dailyPoints([{ date: 10, totalCirculatingUSD: { peggedUSD: 7 } }], (r) => r.totalCirculatingUSD), [{ t: 10, v: 7 }]);
  });
  test("30-day sum ends at the latest point; too short a series gives null", () => {
    const pts = dailyPoints(days(60, () => 1));
    assert.equal(lastDaysSum(pts, 30), 30);
    assert.equal(lastDaysSum(dailyPoints(days(5, () => 1)), 30), null);
  });
  test("monthly: sums or month-end levels, oldest first", () => {
    const pts = dailyPoints(days(59, (i) => i)); // Jan 0..30, Feb 31..58
    assert.deepEqual(monthly(pts, "sum").map((m) => m.month), ["2026-01", "2026-02"]);
    assert.equal(monthly(pts, "sum")[0].value, (30 * 31) / 2);
    assert.equal(monthly(pts, "last")[1].value, 58);
  });
  test("fees match by name or display name, in the project's order, ignoring case and punctuation", () => {
    const p: Pick<CryptoProject, "fees"> = { fees: ["Hyperliquid Perps", "Hyperliquid"] };
    assert.deepEqual(matchFeesEntry(p, [{ name: "Hyperliquid", slug: "hyperliquid" }, { name: "hyperliquid-perps", slug: "hl-perps" }]), { name: "hyperliquid-perps", slug: "hl-perps" });
    assert.equal(matchFeesEntry({ fees: ["Nope"] }, [{ name: "Solana", slug: "solana" }]), null);
  });
});

describe("crypto fundamentals: snapshot", () => {
  const solana = CRYPTO_PROJECTS.find((p) => p.id === "solana")!;
  const helium = CRYPTO_PROJECTS.find((p) => p.id === "helium")!;
  const inputs: Inputs = {
    chains: [{ name: "Solana", tvl: 10 }, { name: "Ethereum", tvl: 90 }],
    stableChains: [{ name: "Solana", totalCirculatingUSD: { peggedUSD: 15 } }, { name: "Ethereum", totalCirculatingUSD: { peggedUSD: 135 } }],
    feesList: { protocols: [{ name: "Solana", slug: "solana" }] },
    defiTvlHistory: days(40, () => 100).map(([t, v]) => ({ date: t, tvl: v })),
    chainTvlHistory: { Solana: days(40, () => 10).map(([t, v]) => ({ date: t, tvl: v })) },
    stableHistory: { Solana: days(40, () => 15).map(([t]) => ({ date: t, totalCirculatingUSD: { peggedUSD: 15 } })) },
    feesHistory: { solana: { totalDataChart: days(40, () => 2) } },
    revenueHistory: { solana: { totalDataChart: days(40, () => 1) } },
  };
  const snap = buildSnapshot(inputs, new Date("2026-02-10T00:00:00Z"), [solana, helium]);
  test("totals and shares", () => {
    assert.equal(snap.totals.defiTvl, 100);
    assert.equal(snap.totals.stablecoins, 150);
    const s = snap.projects[0];
    assert.equal(s.tvlShare, 0.1);
    assert.equal(s.stablecoinShare, 0.1);
    assert.equal(s.fees30d, 60);
    assert.equal(s.revenue30d, 30);
    assert.deepEqual(s.tvlShareMonthly.map((m) => m.value), [0.1, 0.1]);
  });
  test("an unmatched project is listed as a problem and shown as missing, not guessed", () => {
    const h = snap.projects[1];
    assert.equal(h.fees30d, null);
    assert.equal(h.tvl, null);
    assert.ok(snap.problems.some((p) => p.startsWith("Helium")));
  });
  test("project ids unique; every project has a fees name and a role", () => {
    assert.equal(new Set(CRYPTO_PROJECTS.map((p) => p.id)).size, CRYPTO_PROJECTS.length);
    for (const p of CRYPTO_PROJECTS) { assert.ok(p.fees.length > 0, p.id); assert.ok(p.role, p.id); }
  });
});
