/* Live check of how Yahoo stamps daily bars, per symbol.

     npm run verify:fx-dates                 # the four =X pairs + controls
     npm run verify:fx-dates -- AUDUSD=X 2y  # any symbols, optional range last

   For each symbol it prints meta.exchangeTimezoneName and meta.gmtoffset, the
   UTC hours the daily bars are stamped at, and how many bars carry a different
   date once read in the exchange's zone (see regime/yahooHistory.ts). It then
   fails if the parsed history has duplicate dates, a Saturday/Sunday FX bar, or
   a bar dated after today — the symptoms of a wrong date convention.

   Expected for "=X" pairs: zone Europe/London, stamps at 23:00 UTC in British
   summer time and 00:00 UTC in winter, and every summer bar relabelled one day
   later. Controls (^GSPC, GC=F, BTC-USD) should relabel nothing. Read-only. */
import { fetchYahooChart, inspectYahooDates, parseYahooDaily } from "../src/regime/yahooHistory";

const FX = ["EURUSD=X", "USDJPY=X", "GBPUSD=X", "AUDUSD=X"];
const CONTROLS = ["^GSPC", "GC=F", "BTC-USD"];

async function main() {
  const args = process.argv.slice(2);
  const range = args.length && /^\d+(d|mo|y)$|^max$/.test(args[args.length - 1]) ? args.pop()! : "2y";
  const symbols = args.length ? args : [...FX, ...CONTROLS];
  const today = new Date().toISOString().slice(0, 10);
  let failed = false;
  for (const symbol of symbols) {
    const body = await fetchYahooChart(symbol, range);
    const seen = inspectYahooDates(body), bars = parseYahooDaily(body, symbol);
    const weekend = symbol.endsWith("=X")
      ? bars.filter(b => [0, 6].includes(new Date(`${b.date}T00:00:00Z`).getUTCDay())).length : 0;
    const future = bars.filter(b => b.date > today).length;
    const problems = [seen.duplicateDates && `${seen.duplicateDates} duplicate dates`, weekend && `${weekend} weekend bars`,
      future && `${future} future-dated bars`].filter(Boolean);
    console.log(`${symbol.padEnd(9)} zone ${seen.exchangeTimezoneName ?? "—"} · gmtoffset ${seen.gmtoffset ?? "—"} · ${seen.bars} bars · ` +
      `stamped at UTC hours ${JSON.stringify(seen.utcHours)} · relabelled ${seen.relabelled}` +
      (seen.firstRelabelled ? ` (first: UTC ${seen.firstRelabelled.utc} → ${seen.firstRelabelled.exchange})` : "") +
      ` · last bar ${bars.at(-1)?.date ?? "—"} · ${problems.length ? `FAIL: ${problems.join(", ")}` : "ok"}`);
    if (problems.length) failed = true;
    await new Promise(r => setTimeout(r, 400));
  }
  if (failed) throw new Error("Date convention check failed for at least one symbol.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
