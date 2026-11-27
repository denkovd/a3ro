/* ────────────────────────────────────────────────────────────────
   Crypto fundamentals (roadmap #82): fetch DefiLlama, save today's
   snapshot. Run daily by .github/workflows/crypto-fundamentals.yml
   (01:40 UTC), or by hand:

     cd backend && npm run run:crypto            (saves)
     cd backend && npm run run:crypto -- --dry   (prints, saves nothing)

   Records the run in cron_runs as "crypto-fundamentals" so it shows on
   Admin → Data health. Exits 1 if nothing usable came back.
──────────────────────────────────────────────────────────────── */
import { ensureDatabaseUrl } from "./loadEnv";

const dry = process.argv.includes("--dry");
if (!dry) ensureDatabaseUrl();

import { CRYPTO_PROJECTS } from "../src/crypto/projects";
import { buildSnapshot, fetchInputs, nearMatches, type Fetcher } from "../src/crypto/defillama";
import { fetchMarketInputs } from "../src/crypto/coingecko";

const get: Fetcher = async (url) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json", "User-Agent": "A3RO-Intelligence/1.0 (+https://a3ro.com.au)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
};

const fmt = (v: number | null) => (v === null ? "—" : `$${(v / 1e6).toFixed(1)}m`);

async function main(): Promise<void> {
  const started = new Date();
  const { inputs, problems } = await fetchInputs(get);
  const market = await fetchMarketInputs(get);
  const snap = buildSnapshot({ ...inputs, markets: market.markets, global: market.global, mcapCharts: market.mcapCharts }, new Date(), CRYPTO_PROJECTS, [...problems, ...market.problems]);

  console.log(`DeFi TVL ${fmt(snap.totals.defiTvl)} · stablecoins ${fmt(snap.totals.stablecoins)} (30d ago ${fmt(snap.totals.stablecoins30dAgo)}, 1y ago ${fmt(snap.totals.stablecoins365dAgo)}) · crypto mcap ${fmt(snap.totals.cryptoMcap)}`);
  for (const p of snap.projects) {
    const def = CRYPTO_PROJECTS.find((x) => x.id === p.id)!;
    console.log(`${def.name.padEnd(12)} fees "${p.feesName ?? "-"}" (${p.feesSlug ?? "-"}) 30d ${fmt(p.fees30d)} rev ${fmt(p.revenue30d)} · TVL ${fmt(p.tvl)} share ${p.tvlShare === null ? "—" : (p.tvlShare * 100).toFixed(1) + "%"} · stables ${fmt(p.stablecoins)} · months ${p.feesMonthly.length}/${p.tvlShareMonthly.length}/${p.stablecoinsMonthly.length} · mcap ${fmt(p.mcap)} P/F ${p.priceToFees?.toFixed(0) ?? "—"} P/R ${p.priceToRevenue?.toFixed(0) ?? "—"} (${p.priceToFeesMonthly.length} months)`);
    if (!p.feesName) console.log(`   near matches: ${nearMatches(def, inputs.feesList).join(" | ") || "none"}`);
  }
  for (const pr of snap.problems) console.log(`PROBLEM ${pr}`);

  const usable = snap.totals.defiTvl !== null || snap.projects.some((p) => p.fees30d !== null);
  if (dry) process.exit(usable ? 0 : 1);

  const { createDb } = await import("../src/storage/db");
  const { ensureCryptoTable, saveCryptoSnapshot } = await import("../src/storage/cryptoRepo");
  const { recordCronRun } = await import("../src/storage/cronRunRepo");
  const db = await createDb();
  if (usable) { await ensureCryptoTable(db); await saveCryptoSnapshot(db, snap); }
  try {
    await recordCronRun(db, {
      job: "crypto-fundamentals", startedAt: started.toISOString(), durationMs: Date.now() - started.getTime(), httpStatus: usable ? 200 : 502,
      status: !usable ? "failed" : snap.problems.length ? "degraded" : "ok",
      results: snap.projects.map((p) => ({
        name: CRYPTO_PROJECTS.find((x) => x.id === p.id)!.name,
        state: p.fees30d !== null || p.tvl !== null ? "ok" as const : "failed" as const,
        ...(p.feesName ? {} : { detail: "no fees match" }),
      })),
      error: snap.problems[0]?.slice(0, 200) ?? null,
    });
  } catch (e) {
    console.warn(`Couldn't record the run in cron_runs: ${e instanceof Error ? e.message : String(e)}`);
  }
  process.exit(usable ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
