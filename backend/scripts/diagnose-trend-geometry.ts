/* Trend-geometry diagnostic. Read-only research: it changes no signal, weight or setting.
 *
 *   npm run diagnose:trend-geometry
 *
 * For equities, gold and Bitcoin it scores seven pre-specified trend geometries on how well
 * they avoid major drawdowns (type II errors) against how often they de-risk for nothing
 * (type I errors). It reads public/data/regime-backtest.json only, calls no API, runs no
 * portfolio backtest and computes no Sharpe ratio. Output: one CSV per asset and summary.md
 * under backend/reports/trend-geometry/.
 *
 * Every definition below was fixed before the first run.
 *
 * Score      the production trend score (computeVams): log return over the lookback divided by
 *            (daily log-return σ × √lookback); bullish ≥ +0.5, bearish ≤ −0.5, neutral between.
 * Sessions   NYSE session dates (the SPY calendar) for every asset. Bitcoin is sampled at its
 *            close on those dates. The one exception is Bitcoin's "current" rule, which counts
 *            63 of Bitcoin's own seven-day-a-week bars, as production does.
 * Blend      mean of the 21, 63, 126 and 252-session scores, same ±0.5 thresholds.
 * Asymmetric 63-session rule; a downgrade applies at once, an upgrade only once the higher
 *            state has held for two consecutive sessions.
 * Timing     the state at a session's close is acted on at the next session's close.
 * Strategy   one asset: exposure 100 / 60 / 20% for bullish / neutral / bearish (the production
 *            multipliers), the rest in BIL, 25 bps one-way on every change of exposure.
 * Major drawdown   a peak-to-trough fall in buy-and-hold of at least 15% (equities, gold) or
 *            40% (Bitcoin), one per underwater period.
 * Avoided    strategy return minus asset return from that peak to that trough.
 * Hit        the strategy lost less than half the asset's loss. False-negative rate = 1 − hit rate.
 * Spell      a run of sessions held below full exposure. It is a false positive when the asset
 *            ends the spell above where it began. Whipsaw cost = asset return − strategy return
 *            over false spells (re-entry cost included), in points per year.
 * Ranking    geometries are ranked per asset on hit rate, whipsaw cost and strategy max
 *            drawdown; lowest rank-sum wins, fewer transitions break ties. A single-lookback
 *            winner stands only if its neighbouring lookbacks are also in the top half;
 *            otherwise the blend if it outranks the current rule, else no change.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VAMS_MULTIPLIER, type SleeveKey } from "../src/macro/allocation";
import type { ResearchDataset } from "../src/macro/backtestResearch";
import type { RegimeBar } from "../src/regime/types";
import { computeVams, VAMS_THRESHOLD, type VamsState } from "../src/macro/vams";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../../public/data/regime-backtest.json");
const OUTPUT = resolve(here, "../reports/trend-geometry");
const COST = 25 / 10_000;
const HORIZONS = [21, 63, 126, 252] as const;
const ASSETS: { key: SleeveKey; label: string; proxy: string; majorDrawdown: number }[] = [
  { key: "stocks", label: "Equities", proxy: "SPY", majorDrawdown: 0.15 },
  { key: "gold", label: "Gold", proxy: "GLD", majorDrawdown: 0.15 },
  { key: "bitcoin", label: "Bitcoin", proxy: "BTC-USD", majorDrawdown: 0.40 },
];
type GeometryId = "current" | "s21" | "s63" | "s126" | "s252" | "blend" | "asymmetric";
const LABELS: Record<GeometryId, string> = { current: "Current 63-observation", s21: "21 sessions", s63: "63 sessions",
  s126: "126 sessions", s252: "252 sessions", blend: "Blend 21/63/126/252", asymmetric: "Asymmetric 63 (2-session re-entry)" };
/** Lookbacks whose rank must also be in the top half before a single-lookback rule is recommended. */
const NEIGHBOURS: Record<GeometryId, GeometryId[]> = { current: ["s21", "s63"], s21: ["s63"], s63: ["s21", "s126"],
  s126: ["s63", "s252"], s252: ["s126"], blend: [], asymmetric: ["s21", "s126"] };
const ORDER: Record<VamsState, number> = { BEARISH: 0, NEUTRAL: 1, BULLISH: 2, PENDING: -1 };

const bar = (date: string, close: number): RegimeBar => ({ date, open: close, high: close, low: close, close });
const stateOf = (z: number | null): VamsState => z === null ? "PENDING" : z >= VAMS_THRESHOLD ? "BULLISH" : z <= -VAMS_THRESHOLD ? "BEARISH" : "NEUTRAL";
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const pct = (x: number | null, digits = 2) => x === null ? "" : (x * 100).toFixed(digits);
const maxDrawdown = (returns: number[]) => { let equity = 1, peak = 1, worst = 0;
  for (const r of returns) { equity *= 1 + r; peak = Math.max(peak, equity); worst = Math.min(worst, equity / peak - 1); } return worst; };

interface Row {
  id: GeometryId; label: string; sameAs?: GeometryId;
  transitions: number; transitionsPerYear: number; avgHoldingSessions: number;
  monthsBullish: number; monthsNeutral: number; monthsBearish: number;
  nextBullish: number | null; nextNeutral: number | null; nextBearish: number | null;
  majorDrawdowns: number; avoidedPts: number | null; hitRate: number | null; falseNegativeRate: number | null;
  spells: number; falsePositiveRate: number | null; whipsawPtsPerYear: number;
  strategyMaxDrawdown: number; buyHoldMaxDrawdown: number; rankSum: number; rank: number;
}

function diagnose(dataset: ResearchDataset, asset: (typeof ASSETS)[number]) {
  const calendar = new Set(dataset.prices.stocks!.map(p => p.date));
  const own = dataset.prices[asset.key]!;                      // the asset's own bars (Bitcoin: every calendar day)
  const sessions = own.filter(p => calendar.has(p.date)).map(p => bar(p.date, p.close));
  const bills = dataset.benchmarkPrices!.bills!;
  const billAt = new Map(bills.map(p => [p.date, p.close]));
  const n = sessions.length;

  // Scores and states at every session close, by lookback, on the session calendar.
  const z: Record<number, (number | null)[]> = {}, states: Partial<Record<GeometryId, VamsState[]>> = {};
  for (const window of HORIZONS) {
    z[window] = sessions.map((_, t) => t < window ? null : computeVams(sessions.slice(t - window, t + 1), asset.proxy, asset.label, { window }).z);
    states[`s${window}` as GeometryId] = sessions.map((_, t) => t < window ? "PENDING" : computeVams(sessions.slice(t - window, t + 1), asset.proxy, asset.label, { window }).state);
  }
  states.blend = sessions.map((_, t) => { const scores = HORIZONS.map(w => z[w][t]);
    return scores.some(s => s === null) ? "PENDING" : stateOf(mean(scores as number[])); });
  // Asymmetric: downgrade at once; upgrade only to a level the raw 63-session state has held for two sessions.
  const raw63 = states.s63!; const asymmetric: VamsState[] = [];
  for (let t = 0; t < n; t++) {
    const previous = asymmetric[t - 1], now = raw63[t];
    if (t === 0 || previous === "PENDING" || now === "PENDING") { asymmetric.push(now); continue; }
    if (ORDER[now] < ORDER[previous]) asymmetric.push(now);
    else if (ORDER[now] > ORDER[previous] && ORDER[raw63[t - 1]] > ORDER[previous]) asymmetric.push(ORDER[now] < ORDER[raw63[t - 1]] ? now : raw63[t - 1]);
    else asymmetric.push(previous);
  }
  states.asymmetric = asymmetric;
  // Current rule: 63 of the asset's own observations. For SPY and GLD those are sessions, so it is the 63-session rule.
  const ownCalendarDiffers = own.length !== sessions.length;
  let currentZ: (number | null)[] = z[63];
  if (ownCalendarDiffers) {
    const ownBars = own.map(p => bar(p.date, p.close)); let j = -1;
    currentZ = []; const current: VamsState[] = [];
    for (const session of sessions) {
      while (j + 1 < ownBars.length && ownBars[j + 1].date <= session.date) j++;
      const read = j < 63 ? null : computeVams(ownBars.slice(j - 63, j + 1), asset.proxy, asset.label);
      current.push(read?.state ?? "PENDING"); currentZ.push(read?.z ?? null);
    }
    states.current = current;
  } else states.current = states.s63;

  // Common evaluation sample: BIL must exist and every geometry must have a state the session before.
  const ids = Object.keys(LABELS) as GeometryId[];
  const firstReady = sessions.findIndex((_, t) => ids.every(id => states[id]![t] !== "PENDING"));
  const firstBill = sessions.findIndex(s => billAt.has(s.date));
  const t0 = Math.max(firstReady + 1, firstBill);
  const periods = Array.from({ length: n - 1 - t0 }, (_, k) => t0 + k);          // period i runs from session i to i+1
  const assetReturn = (i: number) => sessions[i + 1].close / sessions[i].close - 1;
  const billReturn = (i: number) => billAt.get(sessions[i + 1].date)! / billAt.get(sessions[i].date)! - 1;
  if (periods.some(i => !billAt.has(sessions[i].date) || !billAt.has(sessions[i + 1].date))) throw new Error(`${asset.label}: BIL does not cover every session in the sample.`);
  const years = (Date.parse(sessions[n - 1].date) - Date.parse(sessions[t0].date)) / (365.25 * 86400000);
  const buyHold = periods.map(assetReturn);

  // Major drawdowns of buy-and-hold: one per underwater period that reaches the threshold.
  const major: { peak: number; trough: number; depth: number }[] = [];
  { let peak = t0, trough = t0;
    const close = () => { const depth = sessions[trough].close / sessions[peak].close - 1; if (depth <= -asset.majorDrawdown) major.push({ peak, trough, depth }); };
    for (let i = t0 + 1; i < n; i++) {
      if (sessions[i].close >= sessions[peak].close) { close(); peak = i; trough = i; }
      else if (sessions[i].close < sessions[trough].close) trough = i;
    }
    close(); }

  // Month-end sessions, for the monthly statistics.
  const monthEnds = sessions.map((s, t) => t).filter(t => t >= t0 - 1 && t < n - 1 && sessions[t].date.slice(0, 7) !== sessions[t + 1].date.slice(0, 7));

  const rows: Row[] = ids.map(id => {
    const state = states[id]!;
    const exposure = (i: number) => VAMS_MULTIPLIER[state[i - 1]];                 // acted on the next session
    const net = periods.map((i, k) => { const e = exposure(i), traded = k === 0 ? 0 : Math.abs(e - exposure(i - 1));
      return (1 - traded * COST) * (1 + e * assetReturn(i) + (1 - e) * billReturn(i)) - 1; });
    const compound = (from: number, to: number) => { let v = 1; for (let i = from; i < to; i++) v *= 1 + net[i - t0]; return v - 1; };
    const applied = periods.map(i => state[i - 1]);
    const transitions = applied.filter((s, k) => k > 0 && s !== applied[k - 1]).length;
    const monthStates = monthEnds.map(t => state[t]);
    const share = (s: VamsState) => monthStates.filter(x => x === s).length / monthStates.length;
    // Next month: act at the first session's close after the month-end, hold to the same point a month later.
    const next = (s: VamsState) => mean(monthEnds.flatMap((t, k) => {
      const end = monthEnds[k + 1];
      if (state[t] !== s || end === undefined || end + 1 > n - 1) return [];
      const a = t + 1, b = end + 1;
      return [sessions[b].close / sessions[a].close - billAt.get(sessions[b].date)! / billAt.get(sessions[a].date)!];
    }));
    const episodes = major.map(m => ({ asset: m.depth, strategy: compound(m.peak, m.trough) }));
    const hits = episodes.filter(e => e.strategy > 0.5 * e.asset).length;
    // De-risking spells.
    let spells = 0, falseSpells = 0, givenUp = 0;
    for (let k = 0; k < periods.length; k++) {
      if (exposure(periods[k]) >= 1) continue;
      const start = k; while (k + 1 < periods.length && exposure(periods[k + 1]) < 1) k++;
      const a = periods[start], b = periods[k];
      const assetMove = sessions[b + 1].close / sessions[a].close - 1;
      spells++;
      if (assetMove > 0) { falseSpells++;
        const reentry = k + 1 < periods.length ? (exposure(periods[k + 1]) - exposure(b)) * COST : 0;
        givenUp += assetMove - compound(a, b + 1) + reentry; }
    }
    return { id, label: LABELS[id], sameAs: id === "current" && !ownCalendarDiffers ? "s63" : undefined,
      transitions, transitionsPerYear: transitions / years, avgHoldingSessions: periods.length / (transitions + 1),
      monthsBullish: share("BULLISH"), monthsNeutral: share("NEUTRAL"), monthsBearish: share("BEARISH"),
      nextBullish: next("BULLISH"), nextNeutral: next("NEUTRAL"), nextBearish: next("BEARISH"),
      majorDrawdowns: major.length, avoidedPts: mean(episodes.map(e => e.strategy - e.asset)),
      hitRate: major.length ? hits / major.length : null, falseNegativeRate: major.length ? 1 - hits / major.length : null,
      spells, falsePositiveRate: spells ? falseSpells / spells : null, whipsawPtsPerYear: givenUp / years,
      strategyMaxDrawdown: maxDrawdown(net), buyHoldMaxDrawdown: maxDrawdown(buyHold), rankSum: 0, rank: 0 };
  });

  // Ranking over distinct geometries (a duplicate of the 63-session rule is not ranked twice).
  const ranked = rows.filter(r => !r.sameAs);
  const rankBy = (value: (r: Row) => number) => { const sorted = [...ranked].sort((a, b) => value(a) - value(b));
    for (const r of ranked) { const v = value(r), below = sorted.filter(x => value(x) < v).length, ties = sorted.filter(x => value(x) === v).length;
      r.rankSum += below + (ties + 1) / 2; } };
  rankBy(r => -(r.hitRate ?? 0)); rankBy(r => r.whipsawPtsPerYear); rankBy(r => -r.strategyMaxDrawdown);
  const order = [...ranked].sort((a, b) => a.rankSum - b.rankSum || a.transitions - b.transitions);
  order.forEach((r, k) => { r.rank = k + 1; });
  for (const r of rows) if (r.sameAs) { const twin = rows.find(x => x.id === r.sameAs)!; r.rankSum = twin.rankSum; r.rank = twin.rank; }

  // Recommendation, by the pre-specified rule only.
  const topHalf = new Set(order.slice(0, Math.ceil(order.length / 2)).map(r => r.id));
  const currentId: GeometryId = ownCalendarDiffers ? "current" : "s63";
  const winner = order[0], blend = rows.find(r => r.id === "blend")!, current = rows.find(r => r.id === currentId)!;
  let recommended: Row, reason: string;
  if (winner.id === currentId) { recommended = current; reason = "The current rule has the lowest rank-sum, so no change."; }
  else if (winner.id === "blend") { recommended = blend; reason = "The blend has the lowest rank-sum."; }
  else if (NEIGHBOURS[winner.id].every(id => topHalf.has(id))) { recommended = winner; reason = `${winner.label} has the lowest rank-sum and its neighbouring lookbacks are also in the top half.`; }
  else if (blend.rank < current.rank) { recommended = blend;
    reason = `${winner.label} has the lowest rank-sum, but a neighbouring lookback is outside the top half, so the result is not robust across horizons. The blend outranks the current rule and is the fallback.`; }
  else { recommended = current;
    reason = `${winner.label} has the lowest rank-sum, but a neighbouring lookback is outside the top half and the blend does not outrank the current rule, so no change.`; }

  // Verification against the stored signal rows.
  const signals = dataset.signals.filter(s => s.trendZ?.[asset.key]);
  const index = new Map(sessions.map((s, t) => [s.date, t]));
  let compared = 0, exact = 0, agree = 0, worst = 0;
  for (const s of signals) {
    const stored = s.trendZ![asset.key]!["63"], t = index.get(s.signalDate);
    if (stored === null || stored === undefined || t === undefined || currentZ[t] === null) continue;
    compared++; worst = Math.max(worst, Math.abs(currentZ[t]! - stored));
    if (currentZ[t] === stored) exact++;
    if (states.current![t] === s.states[asset.key]) agree++;
  }
  return { asset, rows, order, recommended, reason, currentId, major: major.map(m => ({ peak: sessions[m.peak].date, trough: sessions[m.trough].date, depth: m.depth })),
    sample: { from: sessions[t0].date, to: sessions[n - 1].date, years, months: monthEnds.length },
    verification: { compared, exact, agree, worst, sameInstrument: ownCalendarDiffers } };
}

const COLUMNS: [string, (r: Row) => string][] = [
  ["geometry", r => r.label + (r.sameAs ? " (= 63 sessions)" : "")],
  ["transitions", r => String(r.transitions)], ["transitions_per_year", r => r.transitionsPerYear.toFixed(1)],
  ["avg_holding_sessions", r => r.avgHoldingSessions.toFixed(1)],
  ["pct_months_bullish", r => pct(r.monthsBullish, 1)], ["pct_months_neutral", r => pct(r.monthsNeutral, 1)], ["pct_months_bearish", r => pct(r.monthsBearish, 1)],
  ["next_month_excess_pct_after_bullish", r => pct(r.nextBullish)], ["next_month_excess_pct_after_neutral", r => pct(r.nextNeutral)],
  ["next_month_excess_pct_after_bearish", r => pct(r.nextBearish)],
  ["major_drawdowns", r => String(r.majorDrawdowns)], ["drawdown_avoided_pts_avg", r => pct(r.avoidedPts, 1)],
  ["hit_rate_pct", r => pct(r.hitRate, 0)], ["false_negative_rate_pct", r => pct(r.falseNegativeRate, 0)],
  ["derisk_spells", r => String(r.spells)], ["false_positive_rate_pct", r => pct(r.falsePositiveRate, 0)],
  ["whipsaw_cost_pts_per_year", r => pct(r.whipsawPtsPerYear)],
  ["strategy_max_drawdown_pct", r => pct(r.strategyMaxDrawdown, 1)], ["buy_hold_max_drawdown_pct", r => pct(r.buyHoldMaxDrawdown, 1)],
  ["rank_sum", r => r.rankSum.toFixed(1)], ["rank", r => String(r.rank)],
];

function main() {
  const dataset = JSON.parse(readFileSync(SOURCE, "utf8")) as ResearchDataset;
  if (!dataset.signals.some(s => s.trendZ)) throw new Error("The dataset has no stored trend scores. Rebuild it with `npm run backtest:history`.");
  if (!dataset.benchmarkPrices?.bills?.length) throw new Error("The dataset has no Treasury-bill (BIL) history.");
  mkdirSync(OUTPUT, { recursive: true });
  const results = ASSETS.map(asset => diagnose(dataset, asset));
  const md: string[] = ["# Trend-geometry diagnostic", "",
    `Dataset generated ${dataset.generatedAt.slice(0, 10)}, prices through ${dataset.through}. Costs 25 bps one-way; idle exposure earns BIL. No Sharpe ratio is computed and no portfolio is simulated. Definitions are in the header of \`backend/scripts/diagnose-trend-geometry.ts\`.`, "",
    "| Asset | Geometry | Transitions / yr | Avg hold (sessions) | Months bull / neutral / bear (%) | Next-month excess after bull / neutral / bear (%) | Major drawdowns | Avoided (pts, avg) | Hit rate | False-negative rate | False-positive rate | Whipsaw cost (pts / yr) | Max drawdown: strategy vs buy-and-hold (%) | Rank |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const result of results) {
    const { asset, rows } = result;
    writeFileSync(resolve(OUTPUT, `${asset.key}.csv`), [COLUMNS.map(c => c[0]).join(","), ...rows.map(r => COLUMNS.map(c => c[1](r)).join(","))].join("\n") + "\n");
    for (const r of rows) md.push(`| ${asset.label} | ${r.label}${r.sameAs ? " (= 63 sessions)" : ""} | ${r.transitionsPerYear.toFixed(1)} | ${r.avgHoldingSessions.toFixed(0)} | ` +
      `${pct(r.monthsBullish, 0)} / ${pct(r.monthsNeutral, 0)} / ${pct(r.monthsBearish, 0)} | ${pct(r.nextBullish)} / ${pct(r.nextNeutral)} / ${pct(r.nextBearish)} | ` +
      `${r.majorDrawdowns} | ${pct(r.avoidedPts, 1)} | ${pct(r.hitRate, 0)}% | ${pct(r.falseNegativeRate, 0)}% | ${pct(r.falsePositiveRate, 0)}% | ${pct(r.whipsawPtsPerYear)} | ` +
      `${pct(r.strategyMaxDrawdown, 1)} vs ${pct(r.buyHoldMaxDrawdown, 1)} | ${r.rank} |`);
  }
  md.push("", "## Samples and major drawdowns", "");
  for (const { asset, sample, major } of results) md.push(`- **${asset.label} (${asset.proxy}):** ${sample.from} to ${sample.to}, ${sample.years.toFixed(1)} years, ${sample.months} month-ends. ` +
    `Major drawdowns (at least ${asset.majorDrawdown * 100}%): ${major.map(m => `${m.peak} to ${m.trough} (${pct(m.depth, 0)}%)`).join("; ") || "none"}.`);
  md.push("", "## Recommendation by the pre-specified ranking rule", "");
  for (const { asset, recommended, reason, rows, currentId } of results) {
    const current = rows.find(r => r.id === currentId)!;
    md.push(`- **${asset.label}: ${recommended.id === currentId ? `keep the current rule (${current.label})` : recommended.label}.** ${reason}`);
  }
  md.push("", "## Type I / type II trade-off", "");
  for (const { asset, rows, recommended } of results) {
    const distinct = rows.filter(r => !r.sameAs);
    const fewestMissed = [...distinct].sort((a, b) => (a.falseNegativeRate ?? 1) - (b.falseNegativeRate ?? 1) || a.whipsawPtsPerYear - b.whipsawPtsPerYear)[0];
    const cheapest = [...distinct].sort((a, b) => a.whipsawPtsPerYear - b.whipsawPtsPerYear)[0];
    md.push(`- **${asset.label}:** fewest missed drawdowns is ${fewestMissed.label} (misses ${pct(fewestMissed.falseNegativeRate, 0)}% of ${fewestMissed.majorDrawdowns}, whipsaw cost ${pct(fewestMissed.whipsawPtsPerYear)} pts a year). ` +
      `Cheapest in whipsaw is ${cheapest.label} (${pct(cheapest.whipsawPtsPerYear)} pts a year, misses ${pct(cheapest.falseNegativeRate, 0)}%). ` +
      `The recommended rule misses ${pct(recommended.falseNegativeRate, 0)}% of major drawdowns, ${pct(recommended.falsePositiveRate, 0)}% of its de-risking spells are false, and those cost ${pct(recommended.whipsawPtsPerYear)} pts a year.`);
  }
  md.push("", "## Verification against the stored signal rows", "");
  for (const { asset, verification: v } of results) md.push(v.sameInstrument
    ? `- **${asset.label}:** the current-rule score equals the stored \`trendZ["63"]\` at ${v.exact} of ${v.compared} month-ends (largest difference ${v.worst.toFixed(3)}); the state agrees at ${v.agree} of ${v.compared}.`
    : `- **${asset.label}:** the 63-session state on ${asset.proxy} agrees with the stored state (index or futures bars) at ${v.agree} of ${v.compared} month-ends (${(v.agree / v.compared * 100).toFixed(1)}%).`);
  writeFileSync(resolve(OUTPUT, "summary.md"), md.join("\n") + "\n");
  console.log(md.join("\n"));
}
main();
