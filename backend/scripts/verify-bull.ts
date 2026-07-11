/* ────────────────────────────────────────────────────────────────
   Module 5 live verification — run on deploy/local (network needed;
   Yahoo is unreachable from the build sandbox, so golden checks
   run here rather than in the test suite — same posture as
   verify-regime.ts).

   Checks, no DB required:
   1. Yahoo serves a dashed equity ticker (BRK-B) with plausible bars.
   2. Dated futures contracts exist for CL: fetches the generated
      candidate symbols and reports which respond — validating the
      month-code generation against reality.
   3. The continuous CL=F close matches exactly one candidate
      contract's close on recent dates (the roll-detection premise).
   4. BTC-USD Money Line state on daily+weekly for eyeballing against
      the Pine indicator on TradingView (same check as verify:regime).

   Usage: cd backend && npm run verify:bull
──────────────────────────────────────────────────────────────── */

import { closedDailyBars, resampleWeekly, runMoneyLine } from "../src/regime/engine";
import { fetchDailyHistory } from "../src/regime/yahooHistory";
import { contractSymbols, matchContinuousToContracts } from "../src/bull/rolls";
import { RegimeBar } from "../src/regime/types";

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  let failures = 0;

  // 1 · dashed ticker
  try {
    const brk = await fetchDailyHistory("BRK-B");
    const ok = brk.length > 1000 && brk[brk.length - 1].close > 0;
    console.log(`${ok ? "✓" : "✗"} BRK-B: ${brk.length} bars, last close ${brk[brk.length - 1]?.close}`);
    if (!ok) failures++;
  } catch (e) {
    console.log(`✗ BRK-B fetch failed: ${e instanceof Error ? e.message : e}`);
    failures++;
  }

  // 2+3 · CL contracts + close-matching premise
  try {
    const cl = await fetchDailyHistory("CL=F");
    const recent = closedDailyBars(cl, today).slice(-10);
    const candidates = contractSymbols("CL", ".NYM", "FGHJKMNQUVXZ", recent[0].date, 3);
    console.log(`  CL candidates: ${candidates.join(", ")}`);
    const contractBars = new Map<string, RegimeBar[]>();
    for (const c of candidates) {
      try {
        const bars = await fetchDailyHistory(c);
        contractBars.set(c, bars.slice(-15));
        console.log(`✓ ${c}: ${bars.length} bars`);
      } catch (e) {
        console.log(`· ${c}: not fetchable (${e instanceof Error ? e.message.slice(0, 80) : e})`);
      }
    }
    if (contractBars.size < 2) {
      console.log("✗ fewer than 2 CL contracts fetchable — roll detection would skip");
      failures++;
    } else {
      const matched = matchContinuousToContracts(recent, contractBars);
      const matchRate = matched.size / recent.length;
      console.log(`${matchRate >= 0.6 ? "✓" : "✗"} CL=F close-match rate over last ${recent.length} closed bars: ${(matchRate * 100).toFixed(0)}%`);
      const trackedNow = matched.get(recent[recent.length - 1].date);
      console.log(`  continuous currently tracks: ${trackedNow ?? "NO MATCH — investigate tolerance"}`);
      if (matchRate < 0.6) failures++;
    }
  } catch (e) {
    console.log(`✗ CL=F verification failed: ${e instanceof Error ? e.message : e}`);
    failures++;
  }

  // 4 · BTC golden state for TradingView eyeballing
  try {
    const btc = await fetchDailyHistory("BTC-USD");
    const daily = closedDailyBars(btc, today);
    const weekly = resampleWeekly(daily, today);
    const d = runMoneyLine(daily);
    const w = runMoneyLine(weekly);
    console.log(`✓ BTC-USD daily:  trend ${d.trend}, last flip ${d.lastFlipDate} @ ${d.lastFlipPrice?.toFixed(0)}`);
    console.log(`✓ BTC-USD weekly: trend ${w.trend}, last flip ${w.lastFlipDate} @ ${w.lastFlipPrice?.toFixed(0)}`);
    console.log("  (eyeball these against the Pine Money Line on TradingView BTC-USD 1D/1W)");
  } catch (e) {
    console.log(`✗ BTC-USD check failed: ${e instanceof Error ? e.message : e}`);
    failures++;
  }

  console.log(failures === 0 ? "\nAll live checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
