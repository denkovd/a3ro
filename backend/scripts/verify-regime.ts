/* ────────────────────────────────────────────────────────────────
   Golden verification for the Money Line port — run where Yahoo is
   reachable (local machine or a deployed route), no DB required:

     cd backend && npx tsx scripts/verify-regime.ts

   Checks the TypeScript engine against the calibration facts in the
   Pine header of "BullMania Money Line [Recreation]" on BTC weekly:
     • a bearish weekly flip on the candle of the week of 2025-11-10
       (Pine stamps time_close → table read "2025-11-17"; we stamp
       the last trading day inside the week → 2025-11-16)
     • flip close ≈ 94.2k (CRYPTO:BTCUSD 94,219.33; Yahoo BTC-USD is
       a different composite — allow ±2%)
     • no false bearish flip on the late-Jun-2024 weekly close (the
       exact miscalibration a shorter Donchian length produces)
   Then prints the full current snapshot for eyeballing against the
   indicator on a TradingView BTC-USD 1W chart.
──────────────────────────────────────────────────────────────── */

import { computeRegime } from "../src/regime/engine";
import { fetchDailyHistory } from "../src/regime/yahooHistory";

const EXPECT_BEAR_FLIP_WEEK = "2025-11-10";
const EXPECT_FLIP_PRICE = 94_219.33;
const PRICE_TOLERANCE = 0.02;

async function main(): Promise<void> {
  const bars = await fetchDailyHistory("BTC-USD");
  const runDate = new Date().toISOString().slice(0, 10);
  const snap = computeRegime(
    { symbol: "BTC-USD", displayName: "Bitcoin", assetClass: "crypto" },
    bars,
    runDate,
  );

  console.log(`BTC-USD · ${bars.length} daily bars · run ${runDate}\n`);
  console.log("Weekly flips (last 8):");
  for (const f of snap.weekly.flips.slice(-8)) {
    console.log(`  ${f.date}  ${f.direction === 1 ? "BULLISH" : "bearish"}  @ ${f.price.toFixed(2)}`);
  }

  const failures: string[] = [];

  // 1. Bearish flip in the week of 2025-11-10.
  const target = snap.weekly.flips.find(
    (f) => f.direction === -1 && f.date >= EXPECT_BEAR_FLIP_WEEK && f.date < "2025-11-17",
  );
  if (!target) {
    failures.push(`no bearish weekly flip found in the week of ${EXPECT_BEAR_FLIP_WEEK}`);
  } else {
    const dev = Math.abs(target.price / EXPECT_FLIP_PRICE - 1);
    console.log(`\n✓ bearish flip ${target.date} @ ${target.price.toFixed(2)} ` +
      `(Pine: 94,219.33 on CRYPTO:BTCUSD, Δ ${(dev * 100).toFixed(2)}%)`);
    if (dev > PRICE_TOLERANCE) {
      failures.push(`flip price deviates ${(dev * 100).toFixed(2)}% (> ${PRICE_TOLERANCE * 100}%)`);
    }
  }

  // 2. No false bearish flip on the late-Jun/early-Jul-2024 weekly close.
  const falseFlip = snap.weekly.flips.find(
    (f) => f.direction === -1 && f.date >= "2024-06-24" && f.date <= "2024-07-14",
  );
  if (falseFlip) {
    failures.push(`false bearish flip ${falseFlip.date} — Donchian window shorter than calibrated?`);
  } else {
    console.log("✓ no false bearish flip around Jun/Jul 2024");
  }

  console.log(`\nCurrent state — verdict ${snap.verdict}`);
  console.log(`  weekly: trend ${snap.weekly.trend} · line ${snap.weekly.line?.toFixed(2)} · ` +
    `last flip ${snap.weekly.lastFlipDate} @ ${snap.weekly.lastFlipPrice?.toFixed(2)} · ` +
    `since flip ${snap.weekly.sinceFlipPct?.toFixed(2)}%`);
  console.log(`  daily:  trend ${snap.daily.trend} · line ${snap.daily.line?.toFixed(2)} · ` +
    `last flip ${snap.daily.lastFlipDate} @ ${snap.daily.lastFlipPrice?.toFixed(2)}`);
  console.log("  → compare with the indicator's table on a TradingView BTC-USD 1W chart");

  if (failures.length > 0) {
    console.error(`\nFAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log("\nAll golden checks passed.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
