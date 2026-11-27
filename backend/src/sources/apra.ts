/* ────────────────────────────────────────────────────────────────
   APRA quarterly ADI property exposures statistics (roadmap #89).
   CC BY 4.0. One Excel workbook per quarter; its address changes each
   release, so we read the link from APRA's statistics page. Table 1b
   ("ADIs' residential property exposures", $ million) has one row per
   measure and one column per quarter end (Excel dates in row 4).
──────────────────────────────────────────────────────────────── */
import * as XLSX from "xlsx";
import { apraSpec } from "../australia/registry";
import type { AustraliaIndicator, AustraliaObservation } from "../australia/types";

export const APRA_STATS_PAGE = "https://www.apra.gov.au/quarterly-authorised-deposit-taking-institution-statistics";
const UA = { "User-Agent": "A3RO-Intelligence/1.0 (+https://a3ro.com.au)" };

/** The current (not "Historical") property exposures workbook linked from APRA's statistics page. */
export function findApraWorkbookUrl(html: string): string | null {
  const links = [...html.matchAll(/href="([^"]+\.xlsx)"/gi)].map((m) => m[1]).filter((l) => /property/i.test(decodeURIComponent(l)) && !/historical/i.test(decodeURIComponent(l)));
  if (!links.length) return null;
  const l = links[0];
  return l.startsWith("http") ? l : `https://www.apra.gov.au${l}`;
}

/** Excel serial date → "2026-Q2". */
export function excelQuarter(serial: unknown): string | null {
  if (typeof serial !== "number" || serial < 20000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export type ApraTable = { quarters: (string | null)[]; rows: Map<string, unknown[]> };

export function parseApraTable(buf: ArrayBuffer | Buffer, sheet = "Tab 1b"): ApraTable {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array" });
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`APRA workbook has no "${sheet}" sheet`);
  const a = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const dateRow = a.find((r) => (r ?? []).filter((c) => excelQuarter(c)).length >= 2);
  if (!dateRow) throw new Error("APRA: no row of quarter-end dates");
  const rows = new Map<string, unknown[]>();
  for (const r of a) { const label = typeof r?.[0] === "string" ? r[0].replace(/\s+/g, " ").trim() : ""; if (label && !rows.has(label.toLowerCase())) rows.set(label.toLowerCase(), r); }
  return { quarters: dateRow.map(excelQuarter), rows };
}

export function apraObservations(indicator: AustraliaIndicator, t: ApraTable, sourceUrl: string, retrievedAt: string): AustraliaObservation[] {
  const def = apraSpec(indicator);
  const find = (re: RegExp) => [...t.rows.entries()].find(([k]) => re.test(k))?.[1];
  const num = find(def.numerator), den = find(def.denominator);
  if (!num || !den) throw new Error(`APRA: row not found for ${indicator}`);
  const out: AustraliaObservation[] = [];
  t.quarters.forEach((q, i) => {
    const n = num[i], d = den[i];
    if (!q || typeof n !== "number" || typeof d !== "number" || d <= 0) return;
    out.push({
      indicator, title: def.title, value: Math.round((n / d) * 100 * 1000) / 1000, unit: def.unit, unitMultiplier: def.unitMultiplier,
      frequency: def.frequency, adjustment: def.adjustment, referencePeriod: q, sourceUrl, publicationDate: null,
      sourceStatus: null, sourceComment: "Share of total housing credit outstanding (A3RO calculation from APRA Table 1b)",
      firstRetrievedAt: retrievedAt, lastVerifiedAt: retrievedAt,
    });
  });
  return out.slice(-def.rollingPeriods);
}

/** Loads the workbook once per cycle; both APRA indicators read the same table. */
export function createApraLoader(fetchImpl: typeof fetch = fetch) {
  let p: Promise<{ table: ApraTable; url: string }> | null = null;
  return () => (p ??= (async () => {
    const page = await fetchImpl(APRA_STATS_PAGE, { headers: UA, signal: AbortSignal.timeout(30_000) });
    if (!page.ok) throw new Error(`APRA page HTTP ${page.status}`);
    const url = findApraWorkbookUrl(await page.text());
    if (!url) throw new Error("APRA: property exposures workbook link not found");
    const res = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`APRA workbook HTTP ${res.status}`);
    return { table: parseApraTable(Buffer.from(await res.arrayBuffer())), url };
  })());
}
