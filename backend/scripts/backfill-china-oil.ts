/** Public official releases only. Run without --write to validate sources first. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { NBS_INDEX, CUSTOMS_INDEX, fetchChinaPage, nbsEnergyLinks, customsImportLinks, parseNbsEnergy, parseCustomsImports, withImportGrowth, NbsChinaSource, CustomsChinaSource } from "../src/sources/chinaOil";
import { createDb } from "../src/storage/db";
import { insertCorridorMetrics, getLatestCorridorMetrics, getCorridorMetricSeries } from "../src/storage/corridorRepo";
import { ensureDatabaseUrl } from "./loadEnv";
import type { CorridorMetricRecord } from "../src/core/corridorTypes";

const from = process.argv.find(a => a.startsWith("--from="))?.slice(7) ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 27, 1)).toISOString().slice(0, 10);
if (!/^20\d{2}-\d{2}-01$/.test(from) || !Number.isFinite(Date.parse(from))) throw new Error("--from must be a month start YYYY-MM-01");
const cacheDir = join(tmpdir(), "a3ro-china-oil-public-sources");
await mkdir(cacheDir, { recursive: true });
const getPage = async (url: string) => {
  const file = join(cacheDir, `${createHash("sha256").update(url).digest("hex")}.html`);
  // Only immutable article URLs are cached; discovery always checks the current indexes.
  const article = /\/(?:Statics\/|20\d{4}\/t)/.test(url);
  if (article) { try { return await readFile(file, "utf8"); } catch { /* fetch below */ } }
  const html = await fetchChinaPage(url);
  if (article) await writeFile(file, html);
  return html;
};

if (process.argv.includes("--latest")) {
  const sources = [new NbsChinaSource(getPage), new CustomsChinaSource(getPage)];
  const result = await Promise.allSettled(sources.map(s => s.fetchLatest()));
  console.log(JSON.stringify(result.map((r, i) => ({ source: sources[i].descriptor.id, ...(r.status === "fulfilled" ? { records: r.value.length, latest: r.value.sort((a,b) => b.periodDate.localeCompare(a.periodDate)).slice(0, 2) } : { error: String(r.reason) }) })), null, 2));
  process.exit(result.some(r => r.status === "rejected") ? 1 : 0);
}

const records: CorridorMetricRecord[] = [];
const errors: { url: string; error: string }[] = [];
async function collect(urls: string[], parse: typeof parseNbsEnergy) {
  // Small batches avoid hammering the official servers.
  for (let i = 0; i < urls.length; i += 3) {
    await Promise.all(urls.slice(i, i + 3).map(async url => {
      try { records.push(...parse(await getPage(url), url)); }
      catch (error) { errors.push({ url, error: String(error) }); }
    }));
  }
}
const energy = new Set<string>();
for (let page = 0; page < 100; page++) {
  const url = page ? `${NBS_INDEX}index_${page}.html` : NBS_INDEX;
  const html = await getPage(url);
  for (const link of nbsEnergyLinks(html, url)) energy.add(link.url);
  // Release indexes are chronological; finish once releases precede the backfill range.
  const dates = [...html.matchAll(/t(20\d{6})_\d+\.html/g)].map(m => `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6)}`);
  if (dates.length && dates.every(date => date < from)) break;
  if (page % 10 === 0) console.log(`NBS archive: ${page + 1} pages, ${energy.size} energy releases`);
}
await collect([...energy], parseNbsEnergy);
for (let year = new Date().getUTCFullYear(); year >= Number(from.slice(0,4)) - 1; year--) {
  const index = year === new Date().getUTCFullYear() ? CUSTOMS_INDEX : CUSTOMS_INDEX.replace("preliminary.html", `preliminary${year}.html`);
  await collect(customsImportLinks(await getPage(index), index).map(l => l.url), parseCustomsImports);
  console.log(`Customs archive: ${year} complete`);
}
const unique = new Map<string, CorridorMetricRecord>();
for (const row of records.sort((a,b) => a.observedAt.localeCompare(b.observedAt))) unique.set(`${row.metric}:${row.periodDate}`, row);
const normalized = withImportGrowth([...unique.values()]).filter(r => r.periodDate >= from);
const summary = { from, records: normalized.length, metrics: [...new Set(normalized.map(r => r.metric))].map(metric => {
  const rows = normalized.filter(r => r.metric === metric).sort((a,b) => a.periodDate.localeCompare(b.periodDate));
  return { metric, periods: rows.length, first: rows[0]?.periodDate, latest: rows.at(-1) };
}), errors };
console.log(JSON.stringify(summary, null, 2));
if (process.argv.includes("--write")) {
  ensureDatabaseUrl();
  const db = await createDb();
  const written = await insertCorridorMetrics(db, normalized);
  const latest = (await getLatestCorridorMetrics(db)).filter(r => r.corridor === "china");
  const history = await getCorridorMetricSeries(db, "china", "crude_imports", from, new Date().toISOString().slice(0,10));
  console.log(JSON.stringify({ written, latest, importHistoryPeriods: history.length }, null, 2));
}
process.exit(errors.length ? 1 : 0);
