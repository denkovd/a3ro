/* Newsletter v2: Australia weather, flip pattern, YTD leaderboard, commodities and red flags,
   what's coming, the Claude editorial and the Premium edition. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAustraliaWeather, pulseQuadrant, twiChange } from "../src/newsletter/auWeather";
import { buildFlipRows, flipPattern, trackRecord, type FlipRow, type SnapshotLite } from "../src/newsletter/flips";
import { buildLeaderboard, sparkline, type UniverseAsset } from "../src/newsletter/leaderboard";
import { autoRedFlags, commodityBrief, median, type ChokepointRead } from "../src/newsletter/commodity";
import { comingEvents } from "../src/newsletter/coming";
import { parseEditorial, userFacingCommits } from "../src/newsletter/editorial";
import { rawClose } from "../src/newsletter/marketData";
import { missingEditorial, PLACEHOLDER_MARK, previousWeather, renderIssue, type IssueData } from "../src/newsletter/content";
import type { BullTransitionRow } from "../src/storage/bullRepo";

/* ── Australia weather ── */

test("auWeather: Pulse axes map to a quadrant, mixed is no read", () => {
  assert.equal(pulseQuadrant("up", "down"), "GOLDILOCKS");
  assert.equal(pulseQuadrant("up", "up"), "REFLATION");
  assert.equal(pulseQuadrant("down", "up"), "INFLATION");
  assert.equal(pulseQuadrant("down", "down"), "DEFLATION");
  assert.equal(pulseQuadrant("mixed", "up"), null);
});

test("auWeather: TWI change over three months", () => {
  const s = [{ period: "2026-07", value: 60 }, { period: "2026-08", value: 61 }, { period: "2026-09", value: 61.5 }, { period: "2026-10", value: 61.8 }];
  const t = twiChange(s, 3)!;
  assert.equal(t.from, "2026-07");
  assert.equal(t.to, "2026-10");
  assert.equal(t.pct, 3);
  assert.equal(twiChange(s.slice(0, 2), 3), null);
});

test("auWeather: agree + risk-on is sunny, disagree + AUD slump is a storm, missing consensus is pending", () => {
  const twi = (pct: number) => ({ pct, from: "2026-07", to: "2026-10" });
  assert.equal(computeAustraliaWeather({ economy: "GOLDILOCKS", consensus: "GOLDILOCKS", twi: twi(1.5) }).reading, "SUNNY");
  assert.equal(computeAustraliaWeather({ economy: "GOLDILOCKS", consensus: "GOLDILOCKS", twi: twi(0) }).reading, "PARTLY_CLOUDY");
  assert.equal(computeAustraliaWeather({ economy: "INFLATION", consensus: "GOLDILOCKS", twi: twi(-1) }).reading, "RAIN");
  const watch = computeAustraliaWeather({ economy: "INFLATION", consensus: "GOLDILOCKS", twi: twi(-2.5) });
  assert.equal(watch.reading, "RAIN");
  assert.equal(watch.stormWatch, true);
  assert.equal(computeAustraliaWeather({ economy: "INFLATION", consensus: "GOLDILOCKS", twi: twi(-3.2) }).reading, "STORM");
  assert.equal(computeAustraliaWeather({ economy: "INFLATION", consensus: null, twi: twi(0) }).reading, "PENDING");
});

/* ── flips ── */

const SNAP = new Map<string, SnapshotLite>([
  ["NVDA", { symbol: "NVDA", displayName: "Nvidia", tier: "stock", assetClass: "equity", verdict: "BULLISH" }],
  ["GLD", { symbol: "GLD", displayName: "Gold ETF", tier: "macro", assetClass: "metals", verdict: "BULLISH" }],
  ["XOM", { symbol: "XOM", displayName: "Exxon", tier: "stock", assetClass: "equity", verdict: "BEARISH" }],
  ["SPY", { symbol: "SPY", displayName: "S&P 500 ETF", tier: "macro", assetClass: "index", verdict: "NEUTRAL" }],
]);
const T = (runDate: string, symbol: string, fromVerdict: string | null, toVerdict: string): BullTransitionRow =>
  ({ runDate, symbol, displayName: symbol, tier: SNAP.get(symbol)?.tier ?? "stock", fromVerdict, toVerdict });
const TRANSITIONS = [
  T("2026-11-24", "NVDA", "NEUTRAL", "BULLISH"),
  T("2026-11-25", "GLD", "CONFLICT_DAILY", "BULLISH"),
  T("2026-11-25", "XOM", "BULLISH", "BEARISH"),
  T("2026-11-25", "SPY", null, "BULLISH"), // first appearance, not a flip
  T("2026-11-10", "NVDA", "BULLISH", "NEUTRAL"), // to neutral, not a flip
];
const C = (pairs: [string, number][]) => pairs.map(([date, close]) => ({ date, close }));
const CLOSES = new Map([
  ["NVDA", C([["2026-11-21", 100], ["2026-11-24", 104], ["2026-11-27", 110]])],
  ["GLD", C([["2026-11-24", 200], ["2026-11-25", 202], ["2026-11-27", 210]])],
  ["XOM", C([["2026-11-24", 50], ["2026-11-25", 49], ["2026-11-27", 45]])],
  ["SPY", C([["2026-11-21", 500], ["2026-11-24", 505], ["2026-11-27", 510]])],
]);

test("flips: rows use the close before the scan, newest first, macro first on a tie", () => {
  const rows = buildFlipRows(TRANSITIONS, "BULLISH", SNAP, CLOSES, new Map(), { newSince: "2026-11-25" });
  assert.deepEqual(rows.map((r) => r.symbol), ["GLD", "NVDA"]);
  const nvda = rows[1];
  assert.equal(nvda.flipDate, "2026-11-21");
  assert.equal(nvda.priceAtFlip, 100);
  assert.equal(nvda.sincePct, 10);
  assert.equal(nvda.vsBenchmark, 8); // SPY +2% since 21 Nov
  assert.equal(nvda.isNew, false);
  assert.equal(rows[0].isNew, true);
  const bear = buildFlipRows(TRANSITIONS, "BEARISH", SNAP, CLOSES, new Map(), { newSince: "2026-11-25" });
  assert.deepEqual(bear.map((r) => [r.symbol, r.sincePct]), [["XOM", -10]]);
});

test("flips: the week's pattern counts real flips by asset class", () => {
  const p = flipPattern(TRANSITIONS, SNAP, "2026-11-27", 7);
  assert.equal(p.fromDate, "2026-11-21");
  assert.equal(p.bullish, 2);
  assert.equal(p.bearish, 1);
  assert.deepEqual(p.byClass.find((c) => c.assetClass === "equity"), { assetClass: "equity", bullish: 1, bearish: 1 });
  assert.ok(p.summary.length > 0);
});

/* ── leaderboard ── */

test("rawClose: takes back the roll gaps after the date", () => {
  const rolls = [{ rollDate: "2026-06-01", gap: 2 }, { rollDate: "2026-09-01", gap: 1 }];
  assert.equal(rawClose(80, "2026-05-01", rolls), 77);
  assert.equal(rawClose(80, "2026-07-01", rolls), 79);
  assert.equal(rawClose(80, "2026-10-01", rolls), 80);
});

test("leaderboard: Core 10 plus the top 5 leaders ranked by YTD, worst per sector, bad data excluded", () => {
  const asset = (symbol: string, start: number, end: number, extra: Partial<UniverseAsset> = {}): UniverseAsset => ({
    symbol, name: symbol, verdict: "BULLISH", alignedSince: "2026-06-01", firstBar: "2020-01-01",
    closes: C([["2025-12-31", start], ["2026-06-01", (start + end) / 2], ["2026-11-26", end], ["2026-11-27", end]]), ...extra,
  });
  const universe = [
    asset("GLD", 100, 150), asset("BTC-USD", 100, 80), asset("^GSPC", 100, 115),
    ...Array.from({ length: 8 }, (_, i) => asset(`S${i}`, 100, 100 + (i - 4) * 20, { assetClass: i % 2 ? "crypto" : "equity" })),
    asset("SPY", 100, 300), // a Core proxy: never a leader
    asset("TQQQ", 100, 400, { name: "ProShares UltraPro QQQ 3x" }),
    asset("NEW", 100, 500, { firstBar: "2026-10-01" }),
    asset("BAD", 100, 120, { closes: C([["2025-12-31", 100], ["2026-03-01", 1000], ["2026-11-27", 120]]) }),
  ];
  const lb = buildLeaderboard(universe, "2026-11-27");
  assert.equal(lb.ytdBase, "2025-12-31");
  assert.equal(lb.top.length, 15);
  assert.equal(lb.top[0].label.startsWith("S7"), true); // +60%
  assert.ok(lb.top.findIndex((r) => r.key === "gold") < lb.top.findIndex((r) => r.key === "btc"));
  assert.ok(!lb.top.some((r) => ["SPY", "TQQQ", "NEW", "BAD"].includes(r.key)));
  assert.deepEqual(lb.excluded.map((x) => x.symbol).sort(), ["BAD", "NEW", "TQQQ"]);
  assert.deepEqual(lb.worst.map((r) => [r.sector, r.ytd, r.rank]), [["equity", -80, 1], ["crypto", -60, 2]]);
  const unranked = lb.top.filter((r) => r.ytd === null);
  assert.ok(unranked.every((r) => r.type === "Core"), "Core assets with no data sit at the bottom");
});

/* ── commodities ── */

const CP = (over: Partial<ChokepointRead>): ChokepointRead => ({ id: "hormuz", name: "Strait of Hormuz", last7: 40, prior7: 40, changePct: 0, through: "2026-11-22", normal: 40, ...over });

test("commodity brief: only significant moves", () => {
  const quiet = commodityBrief({ chokepoints: [CP({ changePct: 5 })], crudeStocks: { value: 420, change: 1.2, date: "2026-11-20" },
    wti: { value: 70, change: 1, date: "2026-11-24" }, copperStocks: { reportDate: "2026-11-26", total: 100_000, prevTotal: 99_000 },
    exports: [{ id: "IRON_ORE_EXPORTS", label: "Iron ore", latestPeriod: "2026-10", latestAudM: 10_000, prevAudM: 9_900 }], previousExportPeriods: { IRON_ORE_EXPORTS: "2026-09" } });
  assert.deepEqual(quiet, []);
  const loud = commodityBrief({ chokepoints: [CP({ changePct: -22, last7: 31 })], crudeStocks: { value: 420, change: -5.1, date: "2026-11-20" },
    wti: { value: 66, change: -4, date: "2026-11-24" }, copperStocks: { reportDate: "2026-11-26", total: 104_000, prevTotal: 100_000 },
    exports: [{ id: "IRON_ORE_EXPORTS", label: "Iron ore", latestPeriod: "2026-10", latestAudM: 12_000, prevAudM: 10_000 }], previousExportPeriods: { IRON_ORE_EXPORTS: "2026-09" } });
  assert.deepEqual(loud.map((b) => b.commodity), ["Oil", "Oil", "Oil", "Copper", "Iron ore"]);
  // The same export month isn't news twice.
  const again = commodityBrief({ chokepoints: [], crudeStocks: null, wti: null, copperStocks: null,
    exports: [{ id: "IRON_ORE_EXPORTS", label: "Iron ore", latestPeriod: "2026-10", latestAudM: 12_000, prevAudM: 10_000 }], previousExportPeriods: { IRON_ORE_EXPORTS: "2026-10" } });
  assert.deepEqual(again, []);
});

test("red flags: a chokepoint under 70% of its 1-year median", () => {
  assert.deepEqual(autoRedFlags([CP({ last7: 30 })]), []);
  const [f] = autoRedFlags([CP({ last7: 20 })]);
  assert.equal(f.autoKey, "chokepoint:hormuz");
  assert.match(f.title, /50% below normal/);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
});

/* ── what's coming ── */

test("coming: next 7 days only, one line per release family, key events flagged", () => {
  const from = new Date("2026-11-30T07:00:00Z");
  const sched = (releaseAt: string, referencePeriod: string) => ({ nextPublication: { releaseAt, referencePeriod } }) as never;
  const ev = comingEvents([
    { indicator: "CPI_HEADLINE", family: "cpi", schedule: sched("2026-12-02T00:30:00Z", "Oct 2026") },
    { indicator: "CPI_TRIMMED", family: "cpi", schedule: sched("2026-12-02T00:30:00Z", "Oct 2026") },
    { indicator: "GDP", family: "national_accounts", schedule: sched("2026-12-03T00:30:00Z", "Sep qtr 2026") },
    { indicator: "CASH", family: "rba", schedule: sched("2026-12-01T03:30:00Z", "Dec 2026") },
    { indicator: "LATER", family: "trade", schedule: sched("2026-12-20T00:30:00Z", "Nov 2026") },
  ], [{ kind: "FOMC", eventTime: "2026-12-09T19:00:00Z" }, { kind: "CPI", eventTime: "2026-12-04T13:30:00Z" }], from, 7);
  assert.deepEqual(ev.map((e) => [e.label, e.key]), [
    ["🇦🇺 Monthly CPI (Oct 2026)", true], ["🇦🇺 GDP (national accounts) (Sep qtr 2026)", true], ["🇺🇸 US CPI", true],
  ]);
});

/* ── editorial ── */

test("editorial: commits filtered to user-facing ones, JSON pulled out of the reply", () => {
  assert.deepEqual(userFacingCommits(["feat: crypto page\nbody", "chore: bump", "roadmap: #12", "Merge branch x", "Update bar cache", "fix: BTC stale flag"]),
    ["feat: crypto page", "fix: BTC stale flag"]);
  const e = parseEditorial(`Here you go:\n{"bigNews":{"headline":"Fed holds","body":"b","why":"w","briefs":["a","b","c","d"]},"pattern":"p","updates":{"shipped":["s"],"fixed":[],"next":[]},"earnings":["Tue 2 Dec · Salesforce"]}`);
  assert.equal(e.bigNews?.headline, "Fed holds");
  assert.equal(e.bigNews?.briefs.length, 3);
  assert.deepEqual(e.earnings, ["Tue 2 Dec · Salesforce"]);
  assert.throws(() => parseEditorial("no json"));
});

/* ── rendering: free vs Premium ── */

const BASE: IssueData = {
  issueDate: "2026-11-30", generatedAt: "2026-11-27T00:00:00Z", pulse: null, oil: null,
  macro: { quadrant: "GOLDILOCKS", headline: "h", runDate: "2026-11-26", weather: { emoji: "☀️", label: "Sunny", reasons: ["r"] }, liquidity: "l" },
  premium: {
    flips: { pattern: flipPattern(TRANSITIONS, SNAP, "2026-11-27"), bullish: buildFlipRows(TRANSITIONS, "BULLISH", SNAP, CLOSES, new Map(), { newSince: "2026-11-25" }),
      bearish: buildFlipRows(TRANSITIONS, "BEARISH", SNAP, CLOSES, new Map(), { newSince: "2026-11-25" }), asOf: "2026-11-27" },
    leaderboard: null,
  },
  commodity: { brief: [], redFlags: [{ commodity: "Oil", title: "Hormuz disruption", detail: "d", since: "2026-06-13" }], exportPeriods: {} },
  editorial: { bigNews: { headline: "Fed holds", body: "b", why: "w", briefs: [] }, pattern: "Energy rolled over.", earnings: ["Tue 2 Dec · Salesforce (CRM)"] },
} as IssueData;

test("render: free edition teases flips, Premium shows the pattern and names", () => {
  const free = renderIssue(BASE, "https://a3ro.com.au", "free");
  const prem = renderIssue(BASE, "https://a3ro.com.au", "premium");
  assert.ok(free.text.includes("Fed holds") && prem.text.includes("Fed holds"));
  assert.ok(free.text.includes("2 assets flipped Double Confirmed bullish and 1 bearish"));
  assert.ok(!free.text.includes("Nvidia") && !free.text.includes("Energy rolled over."), "no market data in the free edition (#18)");
  assert.ok(prem.text.includes("Energy rolled over.") && prem.text.includes("Nvidia"));
  for (const r of [free, prem]) {
    assert.ok(r.text.includes("No significant moves"), "quiet brief says so");
    assert.ok(r.text.includes("Hormuz disruption"), "red flags listed under the brief");
    assert.ok(r.text.includes("Salesforce (CRM)"), "earnings next week");
    assert.ok(!/EXECUTE/i.test(r.text), "Execute only in an event week");
  }
  assert.match(prem.subject, /^A3RO weekly Premium · /);
});

test("draft: blank editorial slots show a placeholder until written or left out", () => {
  const data = { ...BASE, editorial: {} } as IssueData;
  assert.deepEqual(missingEditorial(data), ["summary", "bigNews", "pattern", "earnings", "updates"]);
  const prem = renderIssue(data, "https://a3ro.com.au", "premium");
  assert.equal(prem.text.split(PLACEHOLDER_MARK).length - 1, 5);
  assert.ok(prem.html.includes("dashed"));
  const free = renderIssue(data, "https://a3ro.com.au", "free");
  assert.equal(free.text.split(PLACEHOLDER_MARK).length - 1, 4, "the pattern is Premium-only");
  const skipped = { ...BASE, editorial: { skip: ["summary", "bigNews", "pattern", "earnings", "updates"] } } as IssueData;
  assert.deepEqual(missingEditorial(skipped), []);
  const out = renderIssue(skipped, "https://a3ro.com.au", "premium").text;
  assert.ok(!out.includes(PLACEHOLDER_MARK) && !out.includes("BIG NEWS") && !out.includes("A3RO UPDATES"));
});

test("sparkline: 8 levels, flat series sits mid-height, short history gives none", () => {
  assert.equal(sparkline([1, 2, 3, 4, 5, 6, 7, 8]), "▁▂▃▄▅▆▇█");
  assert.equal(sparkline([5, 5, 5, 5]), "▄▄▄▄");
  assert.equal(sparkline([1, 2, 3]), null);
});

test("track record: flips from 5 to 1 weeks back, hits counted by direction", () => {
  const r = (scanDate: string, direction: "BULLISH" | "BEARISH", sincePct: number, name = "X"): FlipRow =>
    ({ symbol: name, name, tier: "stock", assetClass: "equity", direction, scanDate, flipDate: scanDate, priceAtFlip: 1, days: 1, sincePct, vsBenchmark: sincePct - 1, status: direction, isNew: false });
  const t = trackRecord([
    r("2026-10-25", "BULLISH", 4, "A"), r("2026-11-05", "BULLISH", -2, "B"), r("2026-11-12", "BULLISH", 9, "C"),
    r("2026-11-01", "BEARISH", -3, "D"), r("2026-11-24", "BULLISH", 20, "too recent"), r("2026-10-01", "BEARISH", -9, "too old"),
  ], "2026-11-26", "2026-11-26");
  assert.equal(t.fromDate, "2026-10-22");
  assert.equal(t.toDate, "2026-11-19");
  assert.deepEqual([t.bullish.count, t.bullish.hits, t.bullish.avg], [3, 2, 3.7]);
  assert.deepEqual([t.bullish.best?.name, t.bullish.worst?.name], ["C", "B"]);
  assert.deepEqual([t.bearish.count, t.bearish.hits], [1, 1]);
});

test("since last issue: weather change line under Macro weather", () => {
  const prev = previousWeather({ issueDate: "2026-11-23", data: { macro: { weather: { emoji: "⛅", label: "Partly cloudy" } }, au: null } });
  const r = renderIssue({ ...BASE, sinceLast: prev } as IssueData, "https://a3ro.com.au", "free");
  assert.ok(r.text.includes("Since last issue (23 Nov): 🇺🇸 ⛅ Partly cloudy → ☀️ Sunny."));
  const same = renderIssue({ ...BASE, sinceLast: { issueDate: "2026-11-23", us: { emoji: "☀️", label: "Sunny" }, au: null } } as IssueData);
  assert.ok(same.text.includes("🇺🇸 unchanged at ☀️ Sunny"));
});

test("editorial brief: data plus the five-box reply format, for drafting in chat", async () => {
  const { editorialBrief } = await import("../src/newsletter/content");
  const b = editorialBrief(BASE);
  assert.ok(b.includes("issue of 2026-11-30") && b.includes("Trend Finder flips") && b.includes("Red flag: Oil: Hormuz disruption"));
  for (const k of ["1. This week in one line", "2. Big news", "3. Pattern of the week (Premium)", "4. Earnings next week", "5. A3RO updates"]) assert.ok(b.includes(k), k);
});

test("red flags: a failed corridor read leaves the auto flags alone", async () => {
  const { gatherIssueData } = await import("../src/newsletter/content");
  const sql: string[] = [];
  const db = {
    async query(text: string) {
      sql.push(text);
      if (text.includes("corridor_metrics")) throw new Error("corridor read failed");
      return { rows: [] };
    },
  };
  await gatherIssueData(db as never, "2026-11-30", new Date("2026-11-28T00:00:00Z"));
  assert.ok(sql.some((s) => s.includes("corridor_metrics")), "corridor read attempted");
  assert.ok(!sql.some((s) => /delete from newsletter_red_flags/.test(s)), "auto flags not cleared");
});
