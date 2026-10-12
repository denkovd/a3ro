import { CorridorBaseSource, type CorridorSourceDescriptor } from "./CorridorSource";
import type { CorridorMetricRecord } from "../core/corridorTypes";
import { SourceError } from "../core/types";

export const NBS_INDEX = "https://www.stats.gov.cn/english/PressRelease/";
// GACC publishes these links over HTTP; do not disable TLS verification.
export const CUSTOMS_INDEX = "http://english.customs.gov.cn/statics/report/preliminary.html";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function plainText(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function links(html: string, base: string): { title: string; url: string }[] {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)]
    .flatMap(m => {
      try {
        const url = new URL(m[1] ?? m[2] ?? m[3], base);
        return url.hostname === new URL(base).hostname && /\.html$/.test(url.pathname)
          ? [{ title: plainText(m[4]), url: url.href }] : [];
      } catch { return []; }
    });
}

export function nbsEnergyLinks(html: string, base = NBS_INDEX) {
  return links(html, base).filter(l => /Energy Production (?:in|from)/i.test(l.title));
}

export function customsImportLinks(html: string, base = CUSTOMS_INDEX) {
  const row = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .find(m => /China.s Major Imports by Quantity and Value.*?in USD/i.test(plainText(m[0])));
  if (!row) throw new Error("Customs import index row missing");
  return links(row[0], base);
}

function period(year: number, month: number, combined: boolean) {
  if (year < 2000 || year > 2100 || month < 1 || month > 12) throw new Error("Invalid China reporting period");
  const startMonth = combined ? 1 : month;
  const periodDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  return { periodDate, start, end, days };
}

function publication(html: string) {
  const match = plainText(html).match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})(?:\s+(\d{2}:\d{2}))?/);
  if (!match) throw new Error("China release publication date missing");
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return { date, instant: new Date(`${date}T${match[4] ?? "00:00"}:00+08:00`).toISOString() };
}

function observation(metric: string, value: number, unit: string, p: ReturnType<typeof period>, pub: ReturnType<typeof publication>, url: string, source: string, fetchedAt: string, extra: Record<string, string> = {}): CorridorMetricRecord {
  if (!Number.isFinite(value) || (unit === "Mt" && (value <= 0 || value > 200))) throw new Error("Invalid China observation value");
  if (p.end > pub.date || Date.parse(pub.instant) > Date.parse(fetchedAt)) throw new Error("China release has a future period/publication");
  return { corridor: "china", metric, value, unit, periodDate: p.periodDate, observedAt: pub.instant,
    source, confidence: "official", fetchedAt, raw: { value, unit },
    meta: { sourceUrl: url, periodStart: p.start, periodEnd: p.end, publishedDate: pub.date, cadence: "monthly", ...extra } };
}

export function parseNbsEnergy(html: string, url: string, fetchedAt = new Date().toISOString()): CorridorMetricRecord[] {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const m = plainText(title).match(/Energy Production (?:in|from) (January (?:to|and) February|[A-Za-z]+) (20\d{2})/i);
  if (!m) throw new Error("Unrecognized NBS energy release title");
  const combined = /February/i.test(m[1]) && /January/i.test(m[1]);
  const month = combined ? 2 : MONTHS.indexOf(m[1].toLowerCase()) + 1;
  const p = period(Number(m[2]), month, combined), pub = publication(html);
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => plainText(m[1]).replace(/crude petroleum oil/gi, "crude oil"));
  const out: CorridorMetricRecord[] = [];
  for (const [metric, needle] of [["crude_production", /crude oil (?:production|output|was produced|were produced)/i], ["crude_processing", /processing(?: volume| capacity)? of crude oil|(?:output|volume) of crude oil processed|crude (?:oil )?processing|crude oil (?:was|were) processed/i]] as const) {
    // Exclude year-to-date paragraphs except the genuine Jan–Feb reporting period.
    const paragraph = paragraphs.find(text => needle.test(text) && /\d[\d,.]* million (?:tons|tonnes)/i.test(text)
      && (combined || !/^(?:From|In) January to/i.test(text)));
    if (!paragraph) throw new Error(`NBS ${metric} monthly paragraph missing`);
    const quantity = paragraph.match(/([\d,.]+) million (?:tons|tonnes)/i);
    if (!quantity) throw new Error(`NBS ${metric} volume missing`);
    const value = Number(quantity[1].replace(/,/g, ""));
    const growth = paragraph.match(/(?:increase|increased|growth|up|decrease|decreased|down|decline|fell|drop)(?:\s+(?:of|by))?\s+([\d.]+)\s*(?:%|percent)/i);
    const yoy = growth ? Number(growth[1]) * (/decrease|down|decline|fell|drop/i.test(growth[0]) ? -1 : 1) : null;
    const extra = { dailyKt: String(value * 1000 / p.days), ...(yoy !== null ? { yoyPct: String(yoy), yoyBasis: "NBS comparable-coverage growth" } : {}) };
    out.push(observation(metric, value, "Mt", p, pub, url, "nbs-china", fetchedAt, extra));
  }
  return out;
}

export function parseCustomsImports(html: string, url: string, fetchedAt = new Date().toISOString()): CorridorMetricRecord[] {
  const title = plainText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const m = title.match(/Major Imports by Quantity and Value,?\s*(January[-–]February|[A-Za-z]+)\.?\s+(20\d{2})/i);
  if (!m) throw new Error("Unrecognized Customs preliminary import title");
  const month = /January[-–]February/i.test(m[1]) ? 2 : MONTHS.findIndex(name => name.startsWith(m[1].toLowerCase().replace(/\.$/, ""))) + 1;
  const p = period(Number(m[2]), month, month === 2), pub = publication(html);
  const row = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].find(m => /Crude (?:petroleum oils?|Petroleum Oil)/i.test(plainText(m[0])));
  if (!row) throw new Error("Customs crude petroleum row missing");
  const cells = [...row[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => plainText(m[1]));
  const combinedTitle = /January[-–]February/i.test(m[1]);
  if ((cells.length !== 10 && !(combinedTitle && cells.length === 8)) || !/^10,000\s*Tons$/i.test(cells[1])) throw new Error("Customs quantity columns or units changed");
  // Feb's cumulative quantity is the official Jan–Feb total; never split NBS's combined period.
  const raw = Number(cells[month === 2 && cells.length === 10 ? 4 : 2].replace(/,/g, ""));
  const janFebYoy = month === 2 ? Number(cells[cells.length - 2]) : null;
  const rec = observation("crude_imports", Number((raw / 100).toFixed(6)), "Mt", p, pub, url, "gacc-china", fetchedAt,
    { dailyKt: String(raw * 10 / p.days), preliminary: "true", ...(janFebYoy !== null && Number.isFinite(janFebYoy) ? { yoyPct: String(janFebYoy), yoyBasis: "Customs reported Jan–Feb growth" } : {}) });
  rec.raw = { value: raw, unit: "10,000 tonnes" };
  return [rec];
}

export function withImportGrowth(records: CorridorMetricRecord[]): CorridorMetricRecord[] {
  return records.map(r => {
    if (r.metric !== "crude_imports" || r.meta?.yoyPct !== undefined) return r;
    const priorDate = `${Number(r.periodDate.slice(0, 4)) - 1}${r.periodDate.slice(4)}`;
    const prior = records.find(p => p.metric === r.metric && p.periodDate === priorDate && p.meta?.periodStart.slice(5) === r.meta?.periodStart.slice(5));
    return prior && prior.value > 0 ? { ...r, meta: { ...r.meta, yoyPct: String((r.value / prior.value - 1) * 100), yoyBasis: "Calculated from reported period volumes", yoyPriorUrl: prior.meta?.sourceUrl ?? "" } } : r;
  });
}

export async function fetchChinaPage(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!["www.stats.gov.cn", "english.customs.gov.cn"].includes(parsed.hostname)) throw new Error("Unapproved China source host");
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error", headers: { Accept: "text/html", "User-Agent": "A3RO monthly oil statistics" } });
  if (!res.ok) throw new Error(`China official source HTTP ${res.status}`);
  const html = await res.text();
  if (html.length > 2_000_000) throw new Error("China source payload too large");
  return html;
}

abstract class ChinaSource extends CorridorBaseSource {
  constructor(protected getPage = fetchChinaPage) { super(); }
  protected async checked(run: () => Promise<CorridorMetricRecord[]>) {
    try {
      const records = await run();
      if (!records.length) throw new Error("No China observations discovered");
      return records;
    } catch (cause) { throw new SourceError(this.descriptor.id, "upstream_error", cause instanceof Error ? cause.message : "China source unavailable", { cause }); }
  }
}

const descriptor = (id: string, name: string): CorridorSourceDescriptor => ({ id, name, confidence: "official", corridors: ["china"], expectedCadenceMs: 31 * 86_400_000, rateLimit: { maxPerHour: 30, minIntervalMs: 60_000 } });

export class NbsChinaSource extends ChinaSource {
  readonly descriptor = descriptor("nbs-china", "NBS China — monthly crude production and processing");
  fetchLatest() { return this.checked(async () => {
    const discovered = new Map<string, string>();
    for (let page = 0; page < 4; page++) {
      const index = page ? `${NBS_INDEX}index_${page}.html` : NBS_INDEX;
      for (const link of nbsEnergyLinks(await this.getPage(index), index)) discovered.set(link.url, link.title);
      if (discovered.size >= 2) break;
    }
    const urls = [...discovered.keys()].sort().reverse().slice(0, 2);
    return (await Promise.all(urls.map(async url => parseNbsEnergy(await this.getPage(url), url)))).flat();
  }); }
}

export class CustomsChinaSource extends ChinaSource {
  readonly descriptor = descriptor("gacc-china", "China Customs — preliminary crude imports");
  fetchLatest() { return this.checked(async () => {
    const html = await this.getPage(CUSTOMS_INDEX);
    const recent = customsImportLinks(html).slice(-3);
    const year = Number(html.match(/<option\s+value="(20\d{2})"/i)?.[1]);
    if (!year) throw new Error("Customs index year missing");
    const priorIndex = CUSTOMS_INDEX.replace("preliminary.html", `preliminary${year - 1}.html`);
    const prior = customsImportLinks(await this.getPage(priorIndex), priorIndex).filter(l => recent.some(r => r.title.trim() === l.title.trim()));
    const rows = (await Promise.all([...recent, ...prior].map(async l => parseCustomsImports(await this.getPage(l.url), l.url)))).flat();
    return withImportGrowth(rows);
  }); }
}
