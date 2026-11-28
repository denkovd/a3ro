/* ────────────────────────────────────────────────────────────────
   Sector rotation by US regime (roadmap #25).
     npm run backtest:sectors            # Yahoo "max" history
     npm run backtest:sectors -- --db    # stored market_bars (5y only)
     npm run backtest:sectors -- --dry   # print, don't write
     npm run backtest:sectors -- --fred  # relabel from FRED instead
   Labels: by default the monthly point-in-time economic quadrants in
   public/data/regime-backtest.json (release-lagged, the same labels the
   published regime backtest uses); --fred walks revised INDPRO/CPI with
   the live GRID engine instead (needs FRED_API_KEY). Measures each
   sector ETF's next-month return against SPY per regime, and writes
   src/macro/sectorRotation.generated.ts. Run by hand, not on a cron.
──────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDb } from "../src/storage/db";
import { loadBars } from "../src/storage/bullRepo";
import { fetchDailyHistory } from "../src/regime/yahooHistory";
import { fetchFredSeries, MACRO_SERIES } from "../src/sources/fredMacro";
import type { RegimeBar } from "../src/regime/types";
import { buildRegimeTimeline, type Quadrant, type RegimeLabel } from "../src/macro/affinityBacktest";
import { BENCHMARK, QUADRANTS, SECTORS, renderSectorRotationModule, sectorRotation } from "../src/macro/sectorRotation";

const OUT_PATH = join(process.cwd(), "src", "macro", "sectorRotation.generated.ts");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (x: number | null) => (x === null ? "   —  " : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`.padStart(7));

async function main() {
  const args = process.argv.slice(2);
  const useDb = args.includes("--db");
  const dry = args.includes("--dry");

  const useFred = args.includes("--fred");
  let timeline: RegimeLabel[];
  if (useFred) {
    const growthCfg = MACRO_SERIES.find((s) => s.key === "growth_indpro")!;
    const inflationCfg = MACRO_SERIES.find((s) => s.key === "inflation_cpi")!;
    const [growth, inflation] = await Promise.all([
      fetchFredSeries(growthCfg, { lookbackDays: 9200 }),
      fetchFredSeries(inflationCfg, { lookbackDays: 9200 }),
    ]);
    timeline = buildRegimeTimeline(growth.observations, inflation.observations);
  } else {
    const file = join(process.cwd(), "..", "public", "data", "regime-backtest.json");
    const json = JSON.parse(readFileSync(file, "utf8")) as { signals: { date: string; economicQuadrant: string }[] };
    timeline = json.signals
      .filter((s) => (QUADRANTS as string[]).includes(s.economicQuadrant))
      .map((s) => ({ date: s.date, quadrant: s.economicQuadrant as Quadrant }));
  }
  if (timeline.length < 2) { console.error("No regime labels; aborting."); process.exit(1); }
  const dist = QUADRANTS.map((q) => `${q} ${timeline.filter((l) => l.quadrant === q).length}`).join(" · ");
  console.log(`Labelled ${timeline.length} months ${timeline[0].date} → ${timeline[timeline.length - 1].date}: ${dist}`);

  const db = useDb ? await createDb() : null;
  const bars = new Map<string, RegimeBar[]>();
  for (const symbol of [BENCHMARK, ...SECTORS.map((s) => s.symbol)]) {
    try {
      bars.set(symbol, db ? await loadBars(db, symbol, "adj") : await fetchDailyHistory(symbol, "max"));
      if (!db) await sleep(400);
      const b = bars.get(symbol)!;
      console.log(`  ${symbol.padEnd(5)} ${b.length} bars from ${b[0]?.date ?? "—"}`);
    } catch (e) {
      console.log(`  ✗ ${symbol} fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!bars.get(BENCHMARK)?.length) { console.error("No SPY bars; aborting."); process.exit(1); }

  const stats = sectorRotation(bars, timeline);
  console.log("\nMean next-month excess vs SPY (months, t) — * = leads/lags, else weak");
  console.log("        " + QUADRANTS.map((q) => q.padEnd(24)).join(""));
  for (const { symbol } of SECTORS) {
    const cells = QUADRANTS.map((q) => {
      const s = stats.find((x) => x.symbol === symbol && x.quadrant === q)!;
      return `${pct(s.meanExcess)} ${String(s.months).padStart(3)} ${s.t === null ? "  —  " : s.t.toFixed(1).padStart(5)}${s.verdict === "weak" ? " " : "*"}`.padEnd(24);
    });
    console.log(`  ${symbol.padEnd(5)} ${cells.join("")}`);
  }

  const module = renderSectorRotationModule(stats, {
    generatedAt: new Date().toISOString().slice(0, 10), from: timeline[0].date, to: timeline[timeline.length - 1].date,
    labels: timeline.length, source: `${useDb ? "market_bars (5y)" : "Yahoo range=max"}; labels ${useFred ? "FRED (revised) via live engine" : "regime-backtest.json (point-in-time)"}`,
  });
  if (dry) { console.log("\n(--dry: nothing written)"); process.exit(0); }
  writeFileSync(OUT_PATH, module, "utf8");
  console.log(`\nWrote ${OUT_PATH}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
