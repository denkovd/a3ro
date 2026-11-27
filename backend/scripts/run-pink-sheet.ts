/* ────────────────────────────────────────────────────────────────
   World Bank Pink Sheet (roadmap #126): download the monthly prices
   workbook and store iron ore, copper and LNG (Japan). Run monthly by
   .github/workflows/pink-sheet.yml, or by hand:

     cd backend && npx tsx scripts/run-pink-sheet.ts          (saves)
     cd backend && npx tsx scripts/run-pink-sheet.ts --dry    (prints)

   Records the run in cron_runs as "pink-sheet".
──────────────────────────────────────────────────────────────── */
import { ensureDatabaseUrl } from "./loadEnv";

const dry = process.argv.includes("--dry");
if (!dry) ensureDatabaseUrl();

import { PINK_SERIES, PINK_SHEET_URLS, parsePinkSheet, summarise, type PinkSeriesId } from "../src/commodities/pinkSheet";

async function download(): Promise<{ url: string; buf: Buffer } | { error: string }> {
  const urls = [process.env.PINK_SHEET_URL, ...PINK_SHEET_URLS].filter((u): u is string => !!u);
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "A3RO-Intelligence/1.0 (+https://a3ro.com.au)" } });
      if (!res.ok) { errors.push(`${url.split("/doc/")[1]?.slice(0, 12)}…: HTTP ${res.status}`); continue; }
      return { url, buf: Buffer.from(await res.arrayBuffer()) };
    } catch (e) { errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { error: errors.join("; ") };
}

async function main(): Promise<void> {
  const started = new Date();
  const got = await download();
  const problems: string[] = [];
  let series: ReturnType<typeof parsePinkSheet>["series"] = [];
  if ("error" in got) problems.push(`download: ${got.error}`);
  else {
    console.log(`Downloaded ${(got.buf.length / 1e6).toFixed(1)} MB from ${got.url}`);
    const parsed = parsePinkSheet(got.buf);
    series = parsed.series;
    for (const id of Object.keys(PINK_SERIES) as PinkSeriesId[]) if (!series.some((s) => s.id === id)) problems.push(`no column for ${id}`);
    if (problems.length) console.log(`Headers: ${parsed.headers.filter(Boolean).join(" | ")}`);
  }
  for (const s of series) {
    const sum = summarise(s.points);
    console.log(`${s.id} "${s.header}" (${s.unit ?? "?"}) · ${s.points.length} months · latest ${sum?.latest.month} ${sum?.latest.value.toFixed(2)} · YTD ${sum?.ytd === null || !sum ? "—" : (sum.ytd * 100).toFixed(1) + "%"} · 5y ${sum?.low5y.value.toFixed(1)}–${sum?.high5y.value.toFixed(1)}`);
  }
  for (const p of problems) console.log(`PROBLEM ${p}`);
  const usable = series.some((s) => s.points.length > 12);
  if (dry) process.exit(usable ? 0 : 1);

  const { createDb } = await import("../src/storage/db");
  const { ensureCommodityMonthlyTable, saveCommoditySeries } = await import("../src/storage/commodityMonthlyRepo");
  const { recordCronRun } = await import("../src/storage/cronRunRepo");
  const db = await createDb();
  if (usable) { await ensureCommodityMonthlyTable(db); for (const s of series) await saveCommoditySeries(db, s); }
  try {
    await recordCronRun(db, {
      job: "pink-sheet", startedAt: started.toISOString(), durationMs: Date.now() - started.getTime(), httpStatus: usable ? 200 : 502,
      status: !usable ? "failed" : problems.length ? "degraded" : "ok",
      results: (Object.keys(PINK_SERIES) as PinkSeriesId[]).map((id) => ({ name: id, state: series.some((s) => s.id === id && s.points.length) ? "ok" as const : "failed" as const })),
      error: problems[0]?.slice(0, 200) ?? null,
    });
  } catch (e) { console.warn(`Couldn't record the run in cron_runs: ${e instanceof Error ? e.message : String(e)}`); }
  process.exit(usable ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
