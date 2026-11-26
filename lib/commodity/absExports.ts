/* ────────────────────────────────────────────────────────────────
   Australia's exports of a commodity from the ABS (Commodity Watch
   shared template, roadmap #55 / #56)

   ABS Data API, dataflow ABS,MERCH_EXP,1.1.0 (International
   Merchandise Trade, exports). Dimensions:
     COMMODITY_SITC . COUNTRY_DEST . STATE_ORIGIN . FREQ
   Values are A$ thousands, original terms (not seasonally adjusted),
   monthly. Open data (CC BY 4.0), shown publicly with attribution.

   A commodity is described by an AbsExportSpec (its SITC codes, the
   destinations and states to break out). One request covers it all.
   No imports here, so tests can load this file with Node's type
   stripping.
──────────────────────────────────────────────────────────────── */

export const ABS_DATAFLOW = "ABS,MERCH_EXP,1.1.0";

export interface Destination { code: string; name: string; lon: number; lat: number }
export interface StateOrigin { code: string; name: string }

export interface AbsExportSpec {
  /** Cache key and label. */
  id: string;
  /** SITC codes summed into the commodity, e.g. ["283", "682"]. */
  sitc: readonly { code: string; label: string }[];
  /** ABS CL_MERCH_COUNTRY codes to break out. */
  destinations: readonly Destination[];
  /** ABS CL_MERCH_STATE codes to break out (1 NSW … 5 WA). */
  states: readonly StateOrigin[];
}

export interface ExportMonth {
  period: string;
  totalAudM: number;
  /** By SITC code. Missing (confidential or not published) counts as 0 in the total. */
  bySitc: Record<string, number>;
}
export interface ExportDestination { code: string; name: string; last12AudM: number; latestAudM: number | null; share: number }
export interface ExportState { code: string; name: string; last12AudM: number; share: number }

export interface CommodityExports {
  id: string;
  latestPeriod: string;
  months: ExportMonth[];
  last12AudM: number;
  prior12AudM: number | null;
  sitcLast12: { code: string; label: string; last12AudM: number; share: number }[];
  destinations: ExportDestination[];
  otherLast12AudM: number;
  states: ExportState[];
  sourceUrl: string;
  retrievedAt: string;
}

export function exportsUrl(spec: AbsExportSpec, startPeriod: string): string {
  const sitc = spec.sitc.map((s) => s.code).join("+");
  const dests = ["TOT", ...spec.destinations.map((d) => d.code)].join("+");
  const states = ["TOT", ...spec.states.map((s) => s.code)].join("+");
  return `https://data.api.abs.gov.au/rest/data/${ABS_DATAFLOW}/${sitc}.${dests}.${states}.M?startPeriod=${startPeriod}&format=csv`;
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

export interface Obs { sitc: string; dest: string; state: string; period: string; audM: number }

export function parseExportsCsv(text: string): Obs[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines[0] === "NoRecordsFound") throw new Error("ABS returned no observations");
  const header = csvRow(lines[0]).map(code);
  const col = (name: string) => header.indexOf(name);
  const need = ["COUNTRY_DEST", "STATE_ORIGIN", "TIME_PERIOD", "OBS_VALUE"];
  if (need.some((c) => col(c) < 0)) throw new Error("ABS CSV missing required columns");
  const multCol = col("UNIT_MULT");
  const sitcCol = col("COMMODITY_SITC");
  return lines.slice(1).map(csvRow).flatMap((r): Obs[] => {
    const raw = r[col("OBS_VALUE")]?.trim();
    if (!raw) return [];
    const value = Number(raw);
    const period = code(r[col("TIME_PERIOD")]);
    if (!Number.isFinite(value) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return [];
    const mult = multCol >= 0 && code(r[multCol]) !== "" ? Number(code(r[multCol])) : 3;
    return [{ sitc: sitcCol >= 0 ? code(r[sitcCol]) : "", dest: code(r[col("COUNTRY_DEST")]), state: code(r[col("STATE_ORIGIN")]), period, audM: value * Math.pow(10, mult - 6) }];
  });
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function summarizeExports(spec: AbsExportSpec, obs: Obs[], sourceUrl: string, retrievedAt: string): CommodityExports {
  // key: sitc|dest|state → period → value
  const cell = new Map<string, Map<string, number>>();
  const put = (k: string, p: string, v: number) => { if (!cell.has(k)) cell.set(k, new Map()); cell.get(k)!.set(p, v); };
  // With a single SITC the column may be missing; treat it as that code.
  const only = spec.sitc.length === 1 ? spec.sitc[0].code : null;
  for (const o of obs) put(`${o.sitc || only}|${o.dest}|${o.state}`, o.period, o.audM);
  const series = (sitc: string, dest: string, state: string) => cell.get(`${sitc}|${dest}|${state}`);
  const total = (dest: string, state: string, p: string) => sum(spec.sitc.map((s) => series(s.code, dest, state)?.get(p) ?? 0));

  const periods = [...new Set(spec.sitc.flatMap((s) => [...(series(s.code, "TOT", "TOT")?.keys() ?? [])]))].sort();
  if (periods.length < 12) throw new Error(`ABS returned fewer than 12 months of ${spec.id} exports`);
  const last12 = periods.slice(-12);
  const prior12 = periods.length >= 24 ? periods.slice(-24, -12) : null;
  const months = periods.map((p): ExportMonth => ({
    period: p,
    totalAudM: total("TOT", "TOT", p),
    bySitc: Object.fromEntries(spec.sitc.map((s) => [s.code, series(s.code, "TOT", "TOT")?.get(p) ?? 0])),
  }));
  const last12AudM = sum(last12.map((p) => total("TOT", "TOT", p)));
  const share = (v: number) => (last12AudM > 0 ? v / last12AudM : 0);
  const destinations = spec.destinations.map((d): ExportDestination => {
    const v = sum(last12.map((p) => total(d.code, "TOT", p)));
    const latestKnown = spec.sitc.some((s) => series(s.code, d.code, "TOT")?.has(last12[11]));
    return { code: d.code, name: d.name, last12AudM: v, latestAudM: latestKnown ? total(d.code, "TOT", last12[11]) : null, share: share(v) };
  }).sort((a, b) => b.last12AudM - a.last12AudM);
  const states = spec.states.map((s): ExportState => {
    const v = sum(last12.map((p) => total("TOT", s.code, p)));
    return { code: s.code, name: s.name, last12AudM: v, share: share(v) };
  }).sort((a, b) => b.last12AudM - a.last12AudM);
  return {
    id: spec.id,
    latestPeriod: last12[11],
    months,
    last12AudM,
    prior12AudM: prior12 ? sum(prior12.map((p) => total("TOT", "TOT", p))) : null,
    sitcLast12: spec.sitc.map((s) => { const v = sum(last12.map((p) => series(s.code, "TOT", "TOT")?.get(p) ?? 0)); return { code: s.code, label: s.label, last12AudM: v, share: share(v) }; }),
    destinations,
    otherLast12AudM: Math.max(0, last12AudM - sum(destinations.map((d) => d.last12AudM))),
    states,
    sourceUrl,
    retrievedAt,
  };
}

/** Five years back from `now`, as YYYY-MM. */
export function startPeriodFor(now: Date): string {
  return `${now.getUTCFullYear() - 5}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function fetchCommodityExports(spec: AbsExportSpec, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<CommodityExports> {
  const now = opts.now ?? new Date();
  const url = exportsUrl(spec, startPeriodFor(now));
  const response = await (opts.fetchImpl ?? fetch)(url, {
    headers: { Accept: "application/vnd.sdmx.data+csv" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`ABS HTTP ${response.status}`);
  return summarizeExports(spec, parseExportsCsv(await response.text()), url, now.toISOString());
}

/** "2026-09" → "Sep 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
