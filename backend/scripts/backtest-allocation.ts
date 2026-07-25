/* ────────────────────────────────────────────────────────────────
   Backtest the three-sleeve KISS allocation.

     npm run backtest:allocation                # both windows
     npm run backtest:allocation -- --from 2014 # single window
     npm run backtest:allocation -- --db        # stored bars, no fetch
     npm run backtest:allocation -- --json out.json

   Two windows by design (BTC is the binding constraint — Yahoo has it
   from ~2014):
     · 2000+  stocks + gold only, ~25 years and many regime cycles.
              Tests whether the allocation logic works at all.
     · 2014+  all three sleeves. Tests what Bitcoin adds.
   Reported separately rather than spliced, because a single curve that
   silently changes its investable universe partway through is the kind
   of backtest that looks great and means nothing.

   At each monthly step the script rebuilds, from data dated ≤ that
   step: the GRID quadrant, the full 30-asset VAMS risk matrix, and the
   six cycles. So the allocation sees exactly what the live page would
   have seen — no look-ahead, and no shortcut of reusing today's regime
   for history.
──────────────────────────────────────────────────────────────── */

import { writeFileSync } from "node:fs";
import { createDb } from "../src/storage/db";
import { loadBars } from "../src/storage/bullRepo";
import { REGIME_UNIVERSE } from "../src/regime/universe";
import { fetchDailyHistory } from "../src/regime/yahooHistory";
import { fetchFredSeries, MACRO_SERIES, MacroSeries } from "../src/sources/fredMacro";
import { RegimeBar } from "../src/regime/types";
import { buildRegimeTimeline } from "../src/macro/affinityBacktest";
import { computeVams, computeRiskMatrix } from "../src/macro/vams";
import { computeSixCycles } from "../src/macro/cycles";
import { netLiquiditySeries } from "../src/macro/engine";
import { SLEEVES, SleeveKey, AllocationInput, Quadrant } from "../src/macro/allocation";
import {
  runAllocationBacktest,
  PriceSeries,
  BacktestMetrics,
} from "../src/macro/allocationBacktest";

const FETCH_DELAY_MS = 400;
const FRED_LOOKBACK_DAYS = 9200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bars up to a date, without copying the whole array per lookup. */
function barsUpTo(bars: RegimeBar[], date: string): RegimeBar[] {
  let hi = bars.length;
  while (hi > 0 && bars[hi - 1].date > date) hi--;
  return hi === bars.length ? bars : bars.slice(0, hi);
}

/** Truncate every observation series in a panel to a date. */
function panelUpTo(panel: MacroSeries[], date: string): MacroSeries[] {
  return panel.map((s) => ({
    ...s,
    observations: s.observations.filter((o) => o.date <= date),
  }));
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function printMetrics(label: string, m: BacktestMetrics, pad = 20) {
  console.log(
    `  ${label.padEnd(pad)} ` +
      `ret ${pct(m.totalReturn).padStart(9)}  ` +
      `cagr ${pct(m.cagr).padStart(7)}  ` +
      `vol ${pct(m.volatility).padStart(7)}  ` +
      `maxDD ${pct(m.maxDrawdown).padStart(8)}  ` +
      `ret/vol ${m.returnToVol.toFixed(2).padStart(6)}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const useDb = args.includes("--db");
  const jsonAt = args.indexOf("--json");
  const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : null;
  const fromAt = args.indexOf("--from");
  const singleFrom = fromAt >= 0 ? args[fromAt + 1] : null;

  console.log("Three-sleeve allocation backtest");
  console.log(`  caps:   ${SLEEVES.map((s) => `${s.label} ${s.cap * 100}%`).join(" · ")}`);
  console.log(`  source: ${useDb ? "market_bars (5y)" : "Yahoo range=max"}`);
  console.log("");

  // ── FRED panel (once, full history) ──
  console.log("Fetching FRED panel…");
  const panel: MacroSeries[] = [];
  for (const cfg of MACRO_SERIES) {
    try {
      panel.push(await fetchFredSeries(cfg, { lookbackDays: FRED_LOOKBACK_DAYS }));
    } catch (e) {
      console.log(`  ✗ ${cfg.seriesId} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const growth = panel.find((s) => s.key === "growth_indpro")?.observations ?? [];
  const inflation = panel.find((s) => s.key === "inflation_cpi")?.observations ?? [];
  if (growth.length === 0 || inflation.length === 0) {
    console.error("No GRID inputs — aborting.");
    process.exit(1);
  }

  const timeline = buildRegimeTimeline(growth, inflation);
  console.log(`  ${timeline.length} monthly regime labels: ${timeline[0].date} → ${timeline[timeline.length - 1].date}`);
  console.log("");

  // ── bars for the whole matrix universe + the three sleeves ──
  const db = useDb ? await createDb() : null;
  const bars = new Map<string, RegimeBar[]>();
  const wanted = new Set<string>([
    ...REGIME_UNIVERSE.map((e) => e.symbol),
    ...SLEEVES.map((s) => s.symbol),
    "HYG",
  ]);

  console.log(`Loading ${wanted.size} symbols…`);
  for (const symbol of wanted) {
    try {
      const b = db ? await loadBars(db, symbol, "adj") : await fetchDailyHistory(symbol, "max");
      bars.set(symbol, b);
      if (!db) await sleep(FETCH_DELAY_MS);
    } catch (e) {
      console.log(`  ✗ ${symbol} — ${e instanceof Error ? e.message : String(e)}`);
      bars.set(symbol, []);
    }
  }
  console.log("");

  // ── rebuild the live inputs at every step ──
  console.log("Rebuilding regime / matrix / cycles per step…");
  const netLiq = netLiquiditySeries(panel);
  const allInputs: AllocationInput[] = [];

  for (const label of timeline) {
    const reads = REGIME_UNIVERSE.map((e) =>
      computeVams(barsUpTo(bars.get(e.symbol) ?? [], label.date), e.symbol, e.displayName),
    );
    const matrix = computeRiskMatrix(reads, label.date);

    const cycles = computeSixCycles(
      panelUpTo(panel, label.date),
      netLiq.filter((o) => o.date <= label.date),
      barsUpTo(bars.get("^GSPC") ?? [], label.date),
      barsUpTo(bars.get("HYG") ?? [], label.date),
      label.date,
    );

    const states: AllocationInput["states"] = {};
    const unavailable: SleeveKey[] = [];
    for (const s of SLEEVES) {
      const b = barsUpTo(bars.get(s.symbol) ?? [], label.date);
      if (b.length < 64) {
        unavailable.push(s.key);
        continue;
      }
      states[s.key] = computeVams(b, s.symbol, s.label).state;
    }

    allInputs.push({
      date: label.date,
      marketRegime: matrix.modalRegime === "PENDING" ? null : (matrix.modalRegime as Quadrant),
      economicQuadrant: label.quadrant,
      headwinds: cycles.headwinds,
      states,
      unavailable,
    });
  }
  console.log(`  ${allInputs.length} steps built`);
  console.log("");

  // ── run the windows ──
  const prices: PriceSeries = {};
  for (const s of SLEEVES) prices[s.key] = bars.get(s.symbol) ?? [];

  const windows: { name: string; from: string; sleeves: SleeveKey[] }[] = singleFrom
    ? [{ name: `${singleFrom}+`, from: `${singleFrom}-01-01`, sleeves: SLEEVES.map((s) => s.key) }]
    : [
        { name: "2000+ (stocks + gold)", from: "2000-01-01", sleeves: ["stocks", "gold"] },
        { name: "2014+ (all three)", from: "2014-01-01", sleeves: ["stocks", "gold", "bitcoin"] },
      ];

  const out: Record<string, unknown> = {};

  for (const w of windows) {
    const inputs = allInputs
      .filter((i) => i.date >= w.from)
      .map((i) => ({
        ...i,
        // window-scoped: sleeves outside this window's set are excluded
        unavailable: [
          ...new Set([
            ...(i.unavailable ?? []),
            ...SLEEVES.map((s) => s.key).filter((k) => !w.sleeves.includes(k)),
          ]),
        ],
      }));

    if (inputs.length < 24) {
      console.log(`${w.name}: only ${inputs.length} steps — skipping.`);
      continue;
    }

    const result = runAllocationBacktest(inputs, prices);
    console.log(`── ${w.name} — ${result.metrics.steps} months, ${result.metrics.years}y`);
    printMetrics("regime-allocated", result.metrics);
    for (const [name, m] of Object.entries(result.benchmarks)) printMetrics(name, m);
    console.log(
      `  avg invested ${pct(result.metrics.averageInvested)} · ` +
        `turnover ${result.metrics.totalTurnover.toFixed(1)}x · ` +
        `hit rate ${pct(result.metrics.hitRate)}`,
    );
    console.log("");

    out[w.name] = {
      metrics: result.metrics,
      benchmarks: result.benchmarks,
      steps: result.steps.map((s) => ({
        date: s.date, regime: s.regime, equity: s.equity,
        invested: s.allocation.invested, ret: s.periodReturn,
      })),
    };
  }

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(out, null, 2), "utf8");
    console.log(`Wrote ${jsonPath}`);
  }

  console.log("Descriptive backtest of a rule on past data — not a forecast, and not advice.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
