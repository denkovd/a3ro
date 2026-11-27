/* ────────────────────────────────────────────────────────────────
   Australia's iron ore exports from the ABS (roadmap #55)

   ABS Data API, dataflow ABS,MERCH_EXP,1.1.0 (International
   Merchandise Trade, exports). Dimensions:
     COMMODITY_SITC . COUNTRY_DEST . STATE_ORIGIN . FREQ
   SITC 281 = iron ore and concentrates. Values are A$ thousands,
   original terms (not seasonally adjusted), monthly. Open data
   (CC BY 4.0), so it can be shown publicly with attribution.
──────────────────────────────────────────────────────────────── */
/* No imports here, so tests can load this file with Node's type stripping. */

export interface Destination { code: string; name: string; lon: number; lat: number }

/** Where arcs end. Flows are drawn from Port Hedland; ships also sail from Dampier, Cape Lambert and Ashburton. */
export const FLOW_ORIGIN: [number, number] = [118.58, -20.31];
/** Export destinations tracked, by ABS country code (CL_MERCH_COUNTRY). */
export const DESTINATIONS: readonly Destination[] = [
  { code: "CHIN", name: "China", lon: 121.5, lat: 33 },
  { code: "JAP", name: "Japan", lon: 135, lat: 34.6 },
  { code: "RKOR", name: "South Korea", lon: 129.3, lat: 35.8 },
  { code: "TAIW", name: "Taiwan", lon: 120.3, lat: 22.6 },
  { code: "INIA", name: "India", lon: 86.7, lat: 20.3 },
  { code: "VIET", name: "Vietnam", lon: 106.4, lat: 18.1 },
  { code: "INDO", name: "Indonesia", lon: 106.5, lat: -6 },
];

export const ABS_DATAFLOW = "ABS,MERCH_EXP,1.1.0";
export const SITC_IRON_ORE = "281";
export const WA_STATE = "5";

export interface ExportMonth { period: string; totalAudM: number; waAudM: number | null }
export interface ExportDestination { code: string; name: string; last12AudM: number; latestAudM: number | null; share: number }

export interface IronOreExports {
  latestPeriod: string;
  months: ExportMonth[];
  last12AudM: number;
  prior12AudM: number | null;
  waShare: number | null;
  destinations: ExportDestination[];
  otherLast12AudM: number;
  sourceUrl: string;
  retrievedAt: string;
}

export function exportsUrl(startPeriod: string): string {
  const dests = ["TOT", ...DESTINATIONS.map((d) => d.code)].join("+");
  return `https://data.api.abs.gov.au/rest/data/${ABS_DATAFLOW}/${SITC_IRON_ORE}.${dests}.TOT+${WA_STATE}.M?startPeriod=${startPeriod}&format=csv`;
}

function csvRow(line: string): string[] {
  const out: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { value += c; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { out.push(value); value = ""; } else value += c;
  }
  out.push(value); return out;
}

/** SDMX-CSV cells may be "CODE" or "CODE: Label"; keep the code. */
const code = (cell: string | undefined) => (cell ?? "").split(":")[0].trim();

interface Obs { dest: string; state: string; period: string; audM: number }

export function parseExportsCsv(text: string): Obs[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines[0] === "NoRecordsFound") throw new Error("ABS returned no observations");
  const header = csvRow(lines[0]).map(code);
  const col = (name: string) => header.indexOf(name);
  const need = ["COUNTRY_DEST", "STATE_ORIGIN", "TIME_PERIOD", "OBS_VALUE"];
  if (need.some((c) => col(c) < 0)) throw new Error("ABS CSV missing required columns");
  const multCol = col("UNIT_MULT");
  return lines.slice(1).map(csvRow).flatMap((r): Obs[] => {
    const raw = r[col("OBS_VALUE")]?.trim();
    if (!raw) return [];
    const value = Number(raw);
    const period = code(r[col("TIME_PERIOD")]);
    if (!Number.isFinite(value) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return [];
    const mult = multCol >= 0 && code(r[multCol]) !== "" ? Number(code(r[multCol])) : 3;
    return [{ dest: code(r[col("COUNTRY_DEST")]), state: code(r[col("STATE_ORIGIN")]), period, audM: value * Math.pow(10, mult - 6) }];
  });
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function summarizeExports(obs: Obs[], sourceUrl: string, retrievedAt: string): IronOreExports {
  const totals = new Map<string, number>(), wa = new Map<string, number>();
  const byDest = new Map<string, Map<string, number>>();
  for (const o of obs) {
    if (o.dest === "TOT" && o.state === "TOT") totals.set(o.period, o.audM);
    else if (o.dest === "TOT" && o.state === WA_STATE) wa.set(o.period, o.audM);
    else if (o.state === "TOT") {
      if (!byDest.has(o.dest)) byDest.set(o.dest, new Map());
      byDest.get(o.dest)!.set(o.period, o.audM);
    }
  }
  const periods = [...totals.keys()].sort();
  if (periods.length < 12) throw new Error("ABS returned fewer than 12 months of iron ore exports");
  const last12 = periods.slice(-12);
  const prior12 = periods.length >= 24 ? periods.slice(-24, -12) : null;
  const last12AudM = sum(last12.map((p) => totals.get(p)!));
  const waVals = last12.map((p) => wa.get(p));
  const destinations = DESTINATIONS.map((d): ExportDestination => {
    const m = byDest.get(d.code);
    const v = sum(last12.map((p) => m?.get(p) ?? 0));
    return { code: d.code, name: d.name, last12AudM: v, latestAudM: m?.get(last12[11]) ?? null, share: v / last12AudM };
  }).sort((a, b) => b.last12AudM - a.last12AudM);
  return {
    latestPeriod: last12[11],
    months: periods.map((p) => ({ period: p, totalAudM: totals.get(p)!, waAudM: wa.get(p) ?? null })),
    last12AudM,
    prior12AudM: prior12 ? sum(prior12.map((p) => totals.get(p)!)) : null,
    waShare: waVals.every((v) => v !== undefined) ? sum(waVals as number[]) / last12AudM : null,
    destinations,
    otherLast12AudM: Math.max(0, last12AudM - sum(destinations.map((d) => d.last12AudM))),
    sourceUrl,
    retrievedAt,
  };
}

/** Five years back from `now`, as YYYY-MM. */
export function startPeriodFor(now: Date): string {
  return `${now.getUTCFullYear() - 5}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function fetchIronOreExports(opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<IronOreExports> {
  const now = opts.now ?? new Date();
  const url = exportsUrl(startPeriodFor(now));
  const response = await (opts.fetchImpl ?? fetch)(url, {
    headers: { Accept: "application/vnd.sdmx.data+csv" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`ABS HTTP ${response.status}`);
  return summarizeExports(parseExportsCsv(await response.text()), url, now.toISOString());
}

/** "2026-09" → "Sep 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
