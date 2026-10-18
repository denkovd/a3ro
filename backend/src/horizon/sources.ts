import * as XLSX from "xlsx";
import { HORIZON_INDICATORS, HORIZON_SOURCES } from "./indicators";
import { horizonDatasetComplete, horizonPeriodEnd } from "./engine";
import type { HorizonDataset, HorizonPoint, HorizonSource, HorizonSourceState } from "./types";

export const BLS_HORIZON_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
export const BEA_HORIZON_URL = "https://apps.bea.gov/data/special-topics/distribution-of-personal-income/national/summary-file.csv";
export const DFA_HORIZON_URL = "https://www.federalreserve.gov/releases/z1/dataviz/download/zips/dfa.zip";

export function parseHorizonCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && character === ",") { row.push(field.trim()); field = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      row.push(field.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = []; field = "";
    } else field += character;
  }
  if (quoted) throw new Error("Source CSV contains an unterminated quoted field");
  row.push(field.trim());
  if (row.some(value => value !== "")) rows.push(row);
  const header = rows.shift()?.map(value => value.replace(/^\uFEFF/, ""));
  if (!header?.length || new Set(header).size !== header.length) throw new Error("Source CSV header is invalid");
  return rows.map(values => {
    if (values.length !== header.length) throw new Error("Source CSV row does not match its header");
    return Object.fromEntries(header.map((key, index) => [key, values[index]]));
  });
}

function numeric(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function parseBlsHorizon(payload: unknown): HorizonDataset["series"] {
  const body = payload as { status?: string; Results?: { series?: { seriesID: string; data?: { year: string; period: string; value: string; footnotes?: { code?: string; text?: string }[] }[] }[] } };
  if (body?.status !== "REQUEST_SUCCEEDED" || !Array.isArray(body.Results?.series)) throw new Error("BLS did not return a successful series response");
  return HORIZON_INDICATORS.filter(indicator => indicator.source === "bls").map(indicator => {
    const source = body.Results!.series!.find(item => item.seriesID === indicator.sourceSeries);
    const points: HorizonPoint[] = [];
    for (const observation of source?.data ?? []) {
      const quarter = observation.period.match(/^Q0([1-4])$/);
      const month = observation.period.match(/^M(0[1-9]|1[0-2])$/);
      const period = indicator.frequency === "quarterly" && quarter ? `${observation.year}-Q${quarter[1]}` : indicator.frequency === "monthly" && month ? `${observation.year}-${month[1]}` : null;
      const value = numeric(observation.value);
      if (!period || value === null || !horizonPeriodEnd(period, indicator.frequency)) continue;
      const status = observation.footnotes?.map(note => note.text || note.code).filter(Boolean).join("; ") || null;
      points.push({ period, value, status });
    }
    return { key: indicator.key, points: points.sort((first, second) => first.period.localeCompare(second.period)) };
  });
}

export function parseBeaHorizon(csv: string): HorizonDataset["series"] {
  const rows = parseHorizonCsv(csv);
  if (!rows[0] || !Object.hasOwn(rows[0], "Quantile or Summary Metric") || !Object.hasOwn(rows[0], "Ranking")) throw new Error("BEA income CSV header changed");
  const byYear = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.Ranking !== "Equivalized Disposable Personal Income" || row["Income Concept"] !== "Disposable personal income" || !/^\d{4}$/.test(row.Year)) continue;
    const value = numeric(row.Value);
    if (value === null) continue;
    const year = byYear.get(row.Year) ?? new Map<string, number>();
    const metric = row["Quantile or Summary Metric"];
    if (year.has(metric)) throw new Error("BEA returned duplicate income metrics");
    year.set(metric, value); byYear.set(row.Year, year);
  }
  const out = new Map<string, HorizonPoint[]>(HORIZON_INDICATORS.filter(indicator => indicator.source === "bea").map(indicator => [indicator.key, []]));
  for (const [period, metrics] of byYear) {
    const quintiles = ["0-20%", "20-40%", "40-60%", "60-80%", "80-100%"].map(key => metrics.get(key));
    if (quintiles.every((value): value is number => value !== undefined && value >= 0 && value <= 1)) {
      const total = quintiles.reduce((sum, value) => sum + value, 0);
      if (Math.abs(total - 1) > 0.01) throw new Error("BEA income quintile shares do not sum to one");
      const values = { income_bottom40: (quintiles[0] + quintiles[1]) * 100, income_middle40: (quintiles[2] + quintiles[3]) * 100, income_top20: quintiles[4] * 100 };
      for (const [key, value] of Object.entries(values)) out.get(key)!.push({ period, value, status: "Official annual estimate; download does not identify provisional rows" });
    }
    const median = metrics.get("Median ($2017)");
    if (median !== undefined && median > 0) out.get("real_median_dpi")!.push({ period, value: median, status: "Official annual estimate; download does not identify provisional rows" });
  }
  return [...out].map(([key, points]) => ({ key, points: points.sort((first, second) => first.period.localeCompare(second.period)) }));
}

export function parseDfaHorizon(csv: string): HorizonDataset["series"] {
  const rows = parseHorizonCsv(csv);
  if (!rows[0] || !Object.hasOwn(rows[0], "Net worth") || !Object.hasOwn(rows[0], "Category")) throw new Error("Federal Reserve wealth CSV header changed");
  const byPeriod = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const match = row.Date.match(/^(\d{4}):Q([1-4])$/);
    const value = numeric(row["Net worth"]);
    if (!match || value === null) continue;
    const period = `${match[1]}-Q${match[2]}`;
    const groups = byPeriod.get(period) ?? new Map<string, number>();
    if (groups.has(row.Category)) throw new Error("Federal Reserve returned duplicate wealth categories");
    groups.set(row.Category, value); byPeriod.set(period, groups);
  }
  const top: HorizonPoint[] = [];
  const bottom: HorizonPoint[] = [];
  for (const [period, groups] of byPeriod) {
    const categories = ["TopPt1", "RemainingTop1", "Next9", "Next40", "Bottom50"];
    if (groups.size !== categories.length || categories.some(key => !groups.has(key))) throw new Error("Federal Reserve wealth categories changed");
    const total = categories.reduce((sum, key) => sum + groups.get(key)!, 0);
    if (total <= 0) throw new Error("Federal Reserve aggregate net worth is invalid");
    top.push({ period, value: (groups.get("TopPt1")! + groups.get("RemainingTop1")!) / total * 100, status: "Official quarterly distribution estimate" });
    bottom.push({ period, value: groups.get("Bottom50")! / total * 100, status: "Official quarterly distribution estimate" });
  }
  return [{ key: "wealth_top1", points: top }, { key: "wealth_bottom50", points: bottom }].map(series => ({ ...series, points: series.points.sort((first, second) => first.period.localeCompare(second.period)) }));
}

export function readDfaArchive(bytes: ArrayBuffer): string {
  const reader = XLSX.CFB ?? (Reflect.get(XLSX, "default") as typeof XLSX | undefined)?.CFB;
  if (!reader) throw new Error("The Federal Reserve ZIP reader is unavailable");
  const archive = reader.read(new Uint8Array(bytes), { type: "array" }) as { FullPaths: string[]; FileIndex: { content?: Uint8Array; size: number }[] };
  const entries = archive.FullPaths.map((name, index) => ({ name, entry: archive.FileIndex[index] })).filter(item => item.name.endsWith("/dfa-networth-levels.csv"));
  if (entries.length !== 1 || !entries[0].entry.content || entries[0].entry.size > 8_000_000) throw new Error("Federal Reserve archive does not contain one bounded net-worth CSV");
  return Buffer.from(entries[0].entry.content).toString("utf8");
}

export async function fetchHorizonDataset(source: HorizonSource, opts: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<HorizonDataset> {
  const now = opts.now ?? new Date();
  const dataUrl = source === "bls" ? BLS_HORIZON_URL : source === "bea" ? BEA_HORIZON_URL : DFA_HORIZON_URL;
  const request = {
    signal: AbortSignal.timeout(15_000), cache: "no-store" as const,
    ...(source === "bls" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seriesid: HORIZON_INDICATORS.filter(indicator => indicator.source === "bls").map(indicator => indicator.sourceSeries), startyear: String(now.getUTCFullYear() - 9), endyear: String(now.getUTCFullYear()) }) } : {}),
  };
  const response = await (opts.fetchImpl ?? fetch)(dataUrl, request);
  if (!response.ok) throw new Error(`${source.toUpperCase()} source HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 15_000_000) throw new Error("Source download exceeds the supported size");
  const text = source === "dfa" ? readDfaArchive(bytes) : Buffer.from(bytes).toString("utf8");
  const series = source === "bls" ? parseBlsHorizon(JSON.parse(text)) : source === "bea" ? parseBeaHorizon(text) : parseDfaHorizon(text);
  if (series.every(item => item.points.length === 0)) throw new Error(`${source.toUpperCase()} returned no usable observations`);
  return { source, retrievedAt: now.toISOString(), publicationDate: null, dataUrl, series };
}

export async function fetchHorizonBaseline(opts: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<{ datasets: HorizonDataset[]; states: HorizonSourceState[] }> {
  const now = opts.now ?? new Date();
  const results = await Promise.allSettled(HORIZON_SOURCES.map(source => fetchHorizonDataset(source, { ...opts, now })));
  const datasets: HorizonDataset[] = [];
  const states = results.map((result, index): HorizonSourceState => {
    if (result.status === "fulfilled") datasets.push(result.value);
    if (result.status === "rejected") console.warn("Macro Horizon source check failed", HORIZON_SOURCES[index], result.reason instanceof Error ? result.reason.message : "Unknown source error");
    const complete = result.status === "fulfilled" && horizonDatasetComplete(result.value);
    return { source: HORIZON_SOURCES[index], health: result.status === "fulfilled" ? complete ? "healthy" : "degraded" : "unavailable", checkedAt: now.toISOString(), error: result.status === "rejected" ? "Official source could not be verified on this attempt" : complete ? null : "Some official series are missing" };
  });
  return { datasets, states };
}
