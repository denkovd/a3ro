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

describe("crypto valuation and stablecoins (#83, #84)", () => {
  test("value N days ago picks the nearest earlier point, null when far off", async () => {
    const { valueDaysAgo } = await import("../src/crypto/defillama");
    const pts = dailyPoints(days(400, (i) => i));
    assert.equal(valueDaysAgo(pts, 30), 369);
    assert.equal(valueDaysAgo(pts, 365), 34);
    assert.equal(valueDaysAgo(dailyPoints(days(10, () => 1)), 30), null);
  });
  test("monthly ratio: month-end level ÷ (month's flow × 12), complete months only", async () => {
    const { monthlyRatio } = await import("../src/crypto/defillama");
    const r = monthlyRatio([{ month: "2026-01", value: 1200 }, { month: "2026-02", value: 2400 }, { month: "2026-03", value: 9 }], [{ month: "2026-01", value: 10 }, { month: "2026-02", value: 10 }, { month: "2026-03", value: 1 }], "2026-03");
    assert.deepEqual(r, [{ month: "2026-01", value: 10 }, { month: "2026-02", value: 20 }]);
  });
  test("snapshot: market cap ÷ yearly fees and revenue; stablecoin totals; crypto market cap", () => {
    const solana = CRYPTO_PROJECTS.find((p) => p.id === "solana")!;
    const snap = buildSnapshot({
      chains: [{ name: "Solana", tvl: 10 }], stableChains: [], feesList: { protocols: [{ name: "Solana", slug: "solana" }] },
      defiTvlHistory: [], chainTvlHistory: {}, stableHistory: {},
      feesHistory: { solana: { totalDataChart: days(60, () => 1) } }, revenueHistory: { solana: { totalDataChart: days(60, () => 0.5) } },
      stablecoinsAll: days(400, (i) => i).map(([t, v]) => ({ date: t, totalCirculatingUSD: { peggedUSD: v } })),
      markets: [{ id: "solana", market_cap: 365, fully_diluted_valuation: 400 }],
      global: { data: { total_market_cap: { usd: 3650 } } },
      mcapCharts: { solana: { market_caps: days(60, () => 365).map(([t, v]) => [t * 1000, v]) } },
    }, new Date("2026-03-01T00:00:00Z"), [solana]);
    const s = snap.projects[0];
    assert.equal(s.mcap, 365);
    assert.equal(s.fdv, 400);
    assert.equal(s.priceToFees, 365 / 365);   // 30 days of 1/day → 365 a year
    assert.equal(s.priceToRevenue, 365 / 182.5);
    assert.ok(s.priceToFeesMonthly.length >= 1);
    assert.equal(snap.totals.cryptoMcap, 3650);
    assert.equal(snap.totals.stablecoins30dAgo, 369);
  });
});

describe("crypto baskets (#85, #86)", () => {
  test("candidates skip stablecoins, staked/wrapped tokens and the benchmark", async () => {
    const { isBasketCandidate } = await import("../src/crypto/baskets");
    assert.equal(isBasketCandidate({ id: "jupiter", symbol: "JUP", name: "Jupiter" }, ["solana"]), true);
    assert.equal(isBasketCandidate({ id: "solana", symbol: "SOL", name: "Solana" }, ["solana"]), false);
    assert.equal(isBasketCandidate({ id: "usd-coin", symbol: "USDC", name: "USDC" }, []), false);
    assert.equal(isBasketCandidate({ id: "jito-staked-sol", symbol: "JITOSOL", name: "Jito Staked SOL" }, []), false);
    assert.equal(isBasketCandidate({ id: "wrapped-bitcoin", symbol: "WBTC", name: "Wrapped Bitcoin" }, []), false);
  });
  test("regression: a basket that moves 2× the benchmark has beta 2, correlation 1", async () => {
    const { regress } = await import("../src/crypto/baskets");
    const x = new Map<number, number>(), y = new Map<number, number>();
    for (let i = 1; i <= 100; i++) { const r = Math.sin(i) / 50; x.set(i * DAY, r); y.set(i * DAY, 2 * r); }
    const s = regress(y, x, 100 * DAY, 90);
    assert.ok(Math.abs(s.beta! - 2) < 1e-9); assert.ok(Math.abs(s.correlation! - 1) < 1e-9);
  });
  test("equal weight averages members' daily returns; period return compounds; drawdown from peak", async () => {
    const { equalWeightReturns, periodReturn, maxDrawdown } = await import("../src/crypto/baskets");
    const a = new Map([[DAY, 0.1], [2 * DAY, 0.1], [3 * DAY, 0.1]]), b = new Map([[DAY, -0.1], [2 * DAY, 0.1], [3 * DAY, 0.3]]), c = new Map([[DAY, 0], [2 * DAY, 0.1], [3 * DAY, 0.2]]);
    const r = equalWeightReturns([a, b, c]);
    assert.ok(Math.abs(r.get(DAY)! - 0) < 1e-12); assert.ok(Math.abs(r.get(3 * DAY)! - 0.2) < 1e-12);
    assert.ok(Math.abs(periodReturn(new Map([[DAY, Math.log(1.1)], [2 * DAY, Math.log(1.1)]]), 2 * DAY, 2)! - 0.21) < 1e-12);
    assert.equal(maxDrawdown([100, 120, 90, 130]), 90 / 120 - 1);
  });
});

import { PRIVACY_PROJECTS, PRIVACY_REVIEWED, fetchPrivacyDev, summariseParticipation } from "../src/crypto/privacy";

test("privacy top 10: ten unique, sourced, reviewed entries", () => {
  assert.equal(PRIVACY_PROJECTS.length, 10);
  assert.equal(new Set(PRIVACY_PROJECTS.map((p) => p.id)).size, 10);
  assert.match(PRIVACY_REVIEWED, /^\d{4}-\d{2}-\d{2}$/);
  for (const p of PRIVACY_PROJECTS) {
    assert.ok(p.sources.length >= 2, `${p.id} needs sources`);
    for (const s of p.sources) assert.match(s.url, /^https:\/\//);
    for (const k of ["method", "byDefault", "trustedSetup", "audits", "incidents", "access", "australia", "summary"] as const) assert.ok(p[k].trim(), `${p.id}.${k}`);
    if (p.repo) assert.match(p.repo, /^[\w.-]+\/[\w.-]+$/);
  }
});

test("privacy dev activity: sums weeks and retries GitHub's 202", async () => {
  assert.deepEqual(summariseParticipation([1, 2, 3]), { commits52w: 6, commits13w: 6, weekly: [1, 2, 3] });
  assert.equal(summariseParticipation([]), null);
  let calls = 0;
  const { dev, problems } = await fetchPrivacyDev(async () => (++calls === 1 ? { status: 202, body: {} } : { status: 200, body: { all: Array(52).fill(2) } }), PRIVACY_PROJECTS.slice(0, 2), async () => {});
  assert.equal(dev[PRIVACY_PROJECTS[0].id].commits52w, 104);
  assert.equal(dev[PRIVACY_PROJECTS[1].id].commits13w, 26);
  assert.equal(problems.length, 0);
  const miss = await fetchPrivacyDev(async () => ({ status: 404, body: null }), PRIVACY_PROJECTS.slice(0, 1), async () => {});
  assert.equal(miss.problems.length, 1);
});

import { buildLeaderboard, chainApps, chainTotal } from "../src/crypto/leaderboard";

const FEES = { protocols: [
  { defillamaId: "1", name: "Uniswap V3", parentProtocol: "parent#uniswap", protocolType: "protocol", category: "Dexs", total30d: 30e6, breakdown30d: { ethereum: { v3: 30e6 } } },
  { defillamaId: "2", name: "Uniswap V2", parentProtocol: "parent#uniswap", protocolType: "protocol", category: "Dexs", total30d: 2e6, breakdown30d: { ethereum: { v2: 2e6 } } },
  { defillamaId: "3", name: "pump.fun", parentProtocol: "parent#pump", protocolType: "protocol", category: "Launchpad", total30d: 40e6, breakdown30d: { solana: { a: 40e6 } } },
  { defillamaId: "4", name: "Tether", protocolType: "protocol", category: "Stablecoin Issuer", total30d: 500e6, breakdown30d: { solana: { a: 50e6 } } },
  { defillamaId: "5", name: "Tiny", protocolType: "protocol", category: "Dexs", total30d: 0.5e6 },
  { defillamaId: "6", name: "Lido", protocolType: "protocol", category: "Liquid Staking", total30d: 50e6 },
  { defillamaId: "7", name: "Ethereum", protocolType: "chain", category: "Chain", total30d: 20e6 },
] };
const REV = { protocols: [{ defillamaId: "1", total30d: 6e6 }, { defillamaId: "3", total30d: 28e6, breakdown30d: { solana: { a: 28e6 } } }, { defillamaId: "6", total30d: 5e4 }] };
const PROTOCOLS = [{ id: "6", name: "Lido", symbol: "LDO", mcap: 200e6 }, { id: "5", name: "Tiny", symbol: "TNY", mcap: 900e6 }];
const LITE = { parentProtocols: [{ id: "parent#uniswap", name: "Uniswap", symbol: "UNI", mcap: 3e9, gecko_id: "uniswap" }, { id: "parent#pump", name: "Pump", symbol: "PUMP", mcap: 950e6, gecko_id: "pump-fun" }] };

test("leaderboard: groups by token, applies the floors, ranks best first", () => {
  const rows = buildLeaderboard(FEES, REV, PROTOCOLS, LITE);
  assert.deepEqual(rows.map((r) => r.symbol), ["LDO", "PUMP", "UNI"]);
  const uni = rows.find((r) => r.symbol === "UNI")!;
  assert.equal(uni.fees30d, 32e6);
  assert.ok(Math.abs(uni.priceToFees - 3e9 / (32e6 * 365 / 30)) < 1e-9);
  assert.equal(rows.find((r) => r.symbol === "LDO")!.priceToRevenue, null, "revenue under the floor");
  assert.ok(rows.every((r) => r.name !== "Tether" && r.symbol !== "TNY"));
});

test("chain apps: per-chain fees, issuers left out", () => {
  assert.equal(chainTotal(FEES.protocols[0] as never, "ethereum"), 30e6);
  const sol = chainApps(FEES, REV, "solana");
  assert.deepEqual(sol.map((a) => a.name), ["pump.fun"]);
  assert.equal(sol[0].revenue30d, 28e6);
});

import { buildExchangeReserves } from "../src/crypto/exchanges";

test("exchange reserves: CEX only, own token left out, biggest first", () => {
  const rows = buildExchangeReserves([
    { name: "Binance CEX", slug: "binance-cex", category: "CEX", tvl: 120e9, change_7d: 1.7, chainTvls: { OwnTokens: { tvl: 9e9 } } },
    { name: "OKX", slug: "okx", category: "CEX", tvl: 27e9, change_7d: 0.1 },
    { name: "Aave V3", category: "Lending", tvl: 30e9 },
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.clean]), [["Binance", 111e9], ["OKX", 27e9]]);
});
