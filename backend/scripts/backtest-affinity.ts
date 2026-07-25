/* ────────────────────────────────────────────────────────────────
   Regenerate REGIME_AFFINITY from data.

     npm run backtest:affinity            # Yahoo "max" history
     npm run backtest:affinity -- --db    # use stored market_bars
     npm run backtest:affinity -- --dry   # print, don't write

   Fetches as much daily history as each market has, labels ~25 years
   of months with the live GRID engine, cross-tabulates each asset's
   VAMS state against those labels, and writes the derived table to
   src/macro/regimeAffinity.generated.ts.

   Yahoo by default rather than the DB: market_bars holds 5y, which is
   roughly one and a half regime cycles — enough to fit a table, not
   enough to trust one. --db exists for running offline.

   Rate-polite: sequential with a small delay, same posture as the
   bull pipeline. ~30 requests, run by hand, not on a cron.
──────────────────────────────────────────────────────────────── */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDb } from "../src/storage/db";
import { loadBars } from "../src/storage/bullRepo";
import { REGIME_UNIVERSE } from "../src/regime/universe";
import { fetchDailyHistory } from "../src/regime/yahooHistory";
import { fetchFredSeries, MACRO_SERIES } from "../src/sources/fredMacro";
import { RegimeBar } from "../src/regime/types";
import {
  buildRegimeTimeline,
  deriveAffinity,
  renderAffinityModule,
  AffinityEvidence,
  MIN_LIFT,
  MIN_CELL,
  MIN_SAMPLES,
} from "../src/macro/affinityBacktest";

const OUT_PATH = join(process.cwd(), "src", "macro", "regimeAffinity.generated.ts");
const FETCH_DELAY_MS = 400;
/** ~25 years, matching the horizon Dale backtests over. */
const FRED_LOOKBACK_DAYS = 9200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const useDb = args.includes("--db");
  const dry = args.includes("--dry");

  console.log("Regime affinity backtest");
  console.log(`  source:     ${useDb ? "market_bars (5y)" : 'Yahoo range=max'}`);
  console.log(`  thresholds: lift ≥ ${MIN_LIFT}, cell ≥ ${MIN_CELL}, samples ≥ ${MIN_SAMPLES}`);
  console.log("");

  // ── 1 · label history with the live engine ──
  const growthCfg = MACRO_SERIES.find((s) => s.key === "growth_indpro")!;
  const inflationCfg = MACRO_SERIES.find((s) => s.key === "inflation_cpi")!;
  const [growth, inflation] = await Promise.all([
    fetchFredSeries(growthCfg, { lookbackDays: FRED_LOOKBACK_DAYS }),
    fetchFredSeries(inflationCfg, { lookbackDays: FRED_LOOKBACK_DAYS }),
  ]);

  const timeline = buildRegimeTimeline(growth.observations, inflation.observations);
  if (timeline.length === 0) {
    console.error("No regime labels produced — aborting rather than writing an empty table.");
    process.exit(1);
  }

  const dist = timeline.reduce<Record<string, number>>((a, l) => {
    a[l.quadrant] = (a[l.quadrant] ?? 0) + 1;
    return a;
  }, {});
  console.log(`Labelled ${timeline.length} months: ${timeline[0].date} → ${timeline[timeline.length - 1].date}`);
  console.log(`  ${Object.entries(dist).map(([q, n]) => `${q} ${n}`).join(" · ")}`);
  console.log("");

  // ── 2 · per-asset cross-tabulation ──
  const db = useDb ? await createDb() : null;
  const evidence: AffinityEvidence[] = [];

  for (const entry of REGIME_UNIVERSE) {
    let bars: RegimeBar[] = [];
    try {
      bars = db
        ? await loadBars(db, entry.symbol, "adj")
        : await fetchDailyHistory(entry.symbol, "max");
      if (!db) await sleep(FETCH_DELAY_MS);
    } catch (e) {
      console.log(`  ✗ ${entry.symbol.padEnd(11)} fetch failed — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    const ev = deriveAffinity(bars, timeline, entry.symbol);
    evidence.push(ev);

    const mark = ev.sufficient ? "·" : "!";
    const bull = ev.derived.bullish.join("+") || "—";
    const bear = ev.derived.bearish.join("+") || "—";
    console.log(
      `  ${mark} ${entry.symbol.padEnd(11)} ${String(ev.samples).padStart(3)}mo  ` +
        `bull→${bull.padEnd(24)} bear→${bear}`,
    );
  }

  const usable = evidence.filter((e) => e.sufficient);
  console.log("");
  console.log(`Derived ${usable.length}/${evidence.length} assets; the rest keep their hand-written entry.`);

  // ── 3 · emit ──
  const module = renderAffinityModule(evidence, {
    generatedAt: new Date().toISOString().slice(0, 10),
    timelineFrom: timeline[0].date,
    timelineTo: timeline[timeline.length - 1].date,
    labels: timeline.length,
  });

  if (dry) {
    console.log("");
    console.log(module);
    console.log("(--dry: nothing written)");
  } else {
    writeFileSync(OUT_PATH, module, "utf8");
    console.log(`Wrote ${OUT_PATH}`);
    console.log("Review the diff — the evidence comments carry the lift and sample count behind every line.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
