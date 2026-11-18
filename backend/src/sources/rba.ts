import { RBA_TABLE_URL, rbaSpec, rbaTables, type RbaSeriesRef } from "../australia/registry";
import type { AustraliaIndicator, AustraliaObservation } from "../australia/types";
import { csvRow } from "./abs";

/** One parsed RBA statistical table: column metadata keyed by Series ID, plus dated rows. */
export interface RbaTable {
  table: string;
  sourceUrl: string;
  columns: Map<string, { index: number; title: string; units: string; type: string; frequency: string; publicationDate: string | null }>;
  rows: { date: string; cells: string[] }[];
}

const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** RBA tables use "31/10/2026", "31-Oct-2026" and (publication rows) "13-Nov-26". Returns ISO YYYY-MM-DD or null. */
export function parseRbaDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return valid(`${m[3]}-${m[2]}-${m[1]}`);
  m = /^(\d{2})-([A-Za-z]{3})-(\d{4}|\d{2})$/.exec(s);
  if (m && MONTHS[m[2]]) return valid(`${m[3].length === 2 ? `20${m[3]}` : m[3]}-${MONTHS[m[2]]}-${m[1]}`);
  return null;
}
function valid(iso: string): string | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseRbaCsv(table: string, text: string, sourceUrl = RBA_TABLE_URL(table)): RbaTable {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const meta = new Map<string, string[]>();
  let headerEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const row = csvRow(lines[i]);
    meta.set(row[0].trim(), row);
    if (row[0].trim() === "Series ID") { headerEnd = i; break; }
  }
  const ids = meta.get("Series ID");
  if (headerEnd < 0 || !ids) throw new Error(`RBA ${table}: Series ID row missing`);
  const field = (name: string, i: number) => (meta.get(name)?.[i] ?? "").trim();
  const columns: RbaTable["columns"] = new Map();
  ids.forEach((id, i) => {
    if (i === 0 || !id.trim()) return;
    columns.set(id.trim(), { index: i, title: field("Title", i), units: field("Units", i), type: field("Type", i),
      frequency: field("Frequency", i), publicationDate: parseRbaDate(field("Publication date", i)) });
  });
  const rows = lines.slice(headerEnd + 1).flatMap((line) => {
    if (!line.trim()) return [];
    const cells = csvRow(line);
    const date = parseRbaDate(cells[0]);
    if (!date) throw new Error(`RBA ${table}: unrecognised date "${cells[0]}"`);
    return [{ date, cells }];
  });
  if (!rows.length) throw new Error(`RBA ${table}: no data rows`);
  return { table, sourceUrl, columns, rows };
}

/** Monthly values of one column, keyed YYYY-MM. Blank cells (incl. RBA's empty future rows) are skipped, never zero. */
function monthlyValues(t: RbaTable, ref: RbaSeriesRef): Map<string, number> {
  const col = t.columns.get(ref.seriesId);
  if (!col) throw new Error(`RBA ${t.table}: series ${ref.seriesId} missing`);
  const out = new Map<string, number>();
  for (const r of t.rows) {
    const raw = r.cells[col.index]?.trim();
    if (!raw) continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new Error(`RBA ${t.table}: non-numeric ${ref.seriesId} on ${r.date}`);
    const month = r.date.slice(0, 7);
    if (out.has(month)) throw new Error(`RBA ${t.table}: ${ref.seriesId} has more than one value for ${month}; expected a monthly series`);
    out.set(month, v);
  }
  return out;
}

/** Calendar-month average of a daily column. The month holding the latest observation is incomplete and dropped. */
function monthlyAverage(t: RbaTable, ref: RbaSeriesRef): Map<string, number> {
  const col = t.columns.get(ref.seriesId);
  if (!col) throw new Error(`RBA ${t.table}: series ${ref.seriesId} missing`);
  const sums = new Map<string, { sum: number; n: number }>();
  let latest = "";
  for (const r of t.rows) {
    const raw = r.cells[col.index]?.trim();
    if (!raw) continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new Error(`RBA ${t.table}: non-numeric ${ref.seriesId} on ${r.date}`);
    const month = r.date.slice(0, 7);
    const s = sums.get(month) ?? { sum: 0, n: 0 };
    s.sum += v; s.n += 1; sums.set(month, s);
    if (r.date > latest) latest = r.date;
  }
  const open = latest.slice(0, 7);
  return new Map([...sums].filter(([m]) => m !== open).map(([m, s]) => [m, s.sum / s.n]));
}

const round = (v: number, dp = 6) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Builds stored observations for one RBA-sourced indicator from already-parsed tables. */
export function rbaObservations(indicator: AustraliaIndicator, tables: Map<string, RbaTable>, retrievedAt: string): AustraliaObservation[] {
  const def = rbaSpec(indicator);
  const spec = def.rba;
  const get = (table: string) => { const t = tables.get(table); if (!t) throw new Error(`RBA ${table} not loaded`); return t; };
  let values: Map<string, number>;
  let publication: (string | null)[];
  if (spec.kind === "series") {
    values = monthlyValues(get(spec.ref.table), spec.ref);
    publication = [get(spec.ref.table).columns.get(spec.ref.seriesId)!.publicationDate];
  } else if (spec.kind === "monthly_average") {
    values = monthlyAverage(get(spec.ref.table), spec.ref);
    publication = [get(spec.ref.table).columns.get(spec.ref.seriesId)!.publicationDate];
  } else {
    const a = monthlyValues(get(spec.a.table), spec.a), b = monthlyValues(get(spec.b.table), spec.b);
    // A spread exists only for months where both legs are published; a missing leg is never filled.
    values = new Map([...a].flatMap(([m, v]) => (b.has(m) ? [[m, round(v - b.get(m)!)] as [string, number]] : [])));
    publication = [get(spec.a.table).columns.get(spec.a.seriesId)!.publicationDate, get(spec.b.table).columns.get(spec.b.seriesId)!.publicationDate];
  }
  const known = publication.filter((d): d is string => !!d).sort();
  // For a spread, the observation is only complete once the later of the two legs is published.
  const publicationDate = known.length === publication.length ? known.at(-1)! : null;
  const sourceUrl = rbaTables(spec).map((t) => get(t).sourceUrl).join(" ");
  const months = [...values.keys()].sort().slice(-def.rollingPeriods);
  if (!months.length) throw new Error(`RBA: no observations for ${indicator}`);
  return months.map((month, i) => ({
    indicator, title: def.title, value: values.get(month)!, unit: def.unit, unitMultiplier: def.unitMultiplier,
    frequency: def.frequency, adjustment: def.adjustment, referencePeriod: month, sourceUrl,
    // The RBA table carries one publication date for the whole column; it is attached to the latest month only.
    publicationDate: i === months.length - 1 ? publicationDate : null,
    sourceStatus: null, sourceComment: spec.kind === "monthly_average" ? "Calendar-month average of daily values (A3RO calculation)" : spec.kind === "spread" ? "Difference of two RBA series (A3RO calculation)" : null,
    firstRetrievedAt: retrievedAt, lastVerifiedAt: retrievedAt,
  }));
}

/** Fetches each RBA table at most once per cycle; failures are cached so dependent indicators fail fast with the same error. */
export function createRbaTableLoader(opts: { fetchImpl?: typeof fetch } = {}) {
  const cache = new Map<string, Promise<RbaTable>>();
  return (table: string): Promise<RbaTable> => {
    let p = cache.get(table);
    if (!p) {
      const url = RBA_TABLE_URL(table);
      p = (async () => {
        // Built as a variable (as in abs.ts) so the backend's RequestInit typing, which lacks `cache`, accepts it.
        const requestOptions = { cache: "no-store" as const, signal: AbortSignal.timeout(30_000) };
        const response = await (opts.fetchImpl ?? fetch)(url, requestOptions);
        if (!response.ok) throw new Error(`RBA ${table} HTTP ${response.status}`);
        return parseRbaCsv(table, await response.text(), url);
      })();
      cache.set(table, p);
    }
    return p;
  };
}

export async function fetchRbaSeries(indicator: AustraliaIndicator, load: (table: string) => Promise<RbaTable>, now = new Date()): Promise<AustraliaObservation[]> {
  const spec = rbaSpec(indicator).rba;
  const tables = new Map<string, RbaTable>();
  for (const t of rbaTables(spec)) tables.set(t, await load(t));
  return rbaObservations(indicator, tables, now.toISOString());
}
