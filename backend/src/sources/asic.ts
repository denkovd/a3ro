/* ────────────────────────────────────────────────────────────────
   ASIC insolvency statistics (roadmap #91): companies entering
   external administration or having a controller appointed for the
   first time ("Series 1"), monthly. One Excel workbook, re-issued
   about every two weeks at a new address, linked from ASIC's
   Series 1 page.

   Licence: ASIC's copyright page doesn't list statistics among the
   material reusable under CC BY 4.0. Shown with credit to ASIC while
   Daniel decides whether the cards are useful; if they stay, ask ASIC
   for permission (roadmap #128).

     Table 1    national total by month, one column per financial year (from FY20)
     Table 1.2  by industry (ANZSIC division) by month (from July 2021)
──────────────────────────────────────────────────────────────── */
import * as XLSX from "xlsx";
import { AUSTRALIA_REGISTRY, type AsicIndicatorDef } from "../australia/registry";
import type { AustraliaIndicator, AustraliaObservation } from "../australia/types";

export const ASIC_SERIES1_PAGE = "https://asic.gov.au/regulatory-resources/find-a-document/statistics/insolvency-statistics/insolvency-statistics-series-1-companies-entering-external-administration/";
const UA = { "User-Agent": "A3RO-Intelligence/1.0 (+https://a3ro.com.au)" };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function findAsicWorkbookUrl(html: string): string | null {
  const m = [...html.matchAll(/href="([^"]*series-1-and-series-2[^"]*\.xlsx)"/gi)].map((x) => x[1]);
  if (!m.length) return null;
  return m[0].startsWith("http") ? m[0] : `https://asic.gov.au${m[0]}`;
}

const cells = (wb: XLSX.WorkBook, sheet: string) => {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`ASIC workbook has no sheet "${sheet}"`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
};
const monthIndex = (v: unknown) => (typeof v === "string" ? MONTHS.indexOf(v.trim().slice(0, 3).toLowerCase()) : -1);
const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

/** Table 1: rows Jul…Jun, columns FY20, FY21, … → { "2019-07": n, … }. */
export function asicTotals(wb: XLSX.WorkBook): Map<string, number> {
  const a = cells(wb, "1");
  const head = a.find((r) => (r ?? []).some((c) => typeof c === "string" && /^FY\d{2}$/.test(c.trim())));
  if (!head) throw new Error("ASIC Table 1: no FY header");
  const out = new Map<string, number>();
  for (const r of a) {
    const mi = monthIndex(r?.[1]);
    if (mi < 0) continue;
    head.forEach((h, col) => {
      const fy = typeof h === "string" ? /^FY(\d{2})$/.exec(h.trim()) : null;
      const v = r[col];
      if (!fy || typeof v !== "number") return;
      const fyEnd = 2000 + Number(fy[1]);
      out.set(ym(mi >= 6 ? fyEnd - 1 : fyEnd, mi), v);
    });
  }
  return out;
}

/** Table 1.2: one row per month (calendar year + month), one column per industry. */
export function asicByIndustry(wb: XLSX.WorkBook, industry: RegExp): Map<string, number> {
  const a = cells(wb, "1.2");
  const head = a.find((r) => (r ?? []).some((c) => typeof c === "string" && /^construction$/i.test(c.trim())));
  if (!head) throw new Error("ASIC Table 1.2: no industry header");
  const col = head.findIndex((c) => typeof c === "string" && industry.test(c.replace(/\s+/g, " ").trim()));
  if (col < 0) throw new Error(`ASIC Table 1.2: no column for ${industry}`);
  const out = new Map<string, number>();
  for (const r of a) {
    const year = Number(r?.[2]), mi = monthIndex(r?.[4]);
    const v = r?.[col];
    if (Number.isInteger(year) && year > 2000 && mi >= 0 && typeof v === "number") out.set(ym(year, mi), v);
  }
  return out;
}

export function asicObservations(indicator: AustraliaIndicator, wb: XLSX.WorkBook, sourceUrl: string, retrievedAt: string, now = new Date()): AustraliaObservation[] {
  const def = AUSTRALIA_REGISTRY[indicator] as AsicIndicatorDef;
  const values = def.industry ? asicByIndustry(wb, def.industry) : asicTotals(wb);
  // The current month is still being counted, so it is left out.
  const current = ym(now.getUTCFullYear(), now.getUTCMonth());
  const months = [...values.keys()].filter((m) => m < current).sort().slice(-def.rollingPeriods);
  return months.map((month) => ({
    indicator, title: def.title, value: values.get(month)!, unit: def.unit, unitMultiplier: def.unitMultiplier,
    frequency: def.frequency, adjustment: def.adjustment, referencePeriod: month, sourceUrl, publicationDate: null,
    sourceStatus: null, sourceComment: "ASIC counts recent months as provisional; they are revised as late notices arrive",
    firstRetrievedAt: retrievedAt, lastVerifiedAt: retrievedAt,
  }));
}

export function createAsicLoader(fetchImpl: typeof fetch = fetch) {
  let p: Promise<{ wb: XLSX.WorkBook; url: string }> | null = null;
  return () => (p ??= (async () => {
    const page = await fetchImpl(ASIC_SERIES1_PAGE, { headers: UA, signal: AbortSignal.timeout(30_000) });
    if (!page.ok) throw new Error(`ASIC page HTTP ${page.status}`);
    const url = findAsicWorkbookUrl(await page.text());
    if (!url) throw new Error("ASIC: Series 1 workbook link not found");
    const res = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`ASIC workbook HTTP ${res.status}`);
    // Only the summary tables are needed; skipping the 78,000-row data set keeps memory down.
    return { wb: XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer", sheets: ["1", "1.2"] }), url };
  })());
}
