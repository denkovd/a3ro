/* ────────────────────────────────────────────────────────────────
   World Bank "Pink Sheet" monthly commodity prices (roadmap #126).

   Replaces the TradingView charts that free widgets won't show for
   iron ore, copper and LNG futures. Monthly averages, published early
   each month, licensed CC BY 4.0 (credit "World Bank Commodity Price
   Data (The Pink Sheet)"). Not live prices.

   The workbook's URL carries a document id that changes each year, so
   the job tries the known URLs in order (newest first) and PINK_SHEET_URL
   can override them. Manual job "pink-sheet-url" reminds us each January.
──────────────────────────────────────────────────────────────── */
import * as XLSX from "xlsx";

export const PINK_SHEET_URLS = [
  "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx",
  "https://thedocs.worldbank.org/en/doc/18675f1d1639c7a34d463f59263ba0a2-0050012025/related/CMO-Historical-Data-Monthly.xlsx",
];
export const PINK_SHEET_SOURCE = { label: "World Bank Commodity Price Data (The Pink Sheet), CC BY 4.0", url: "https://www.worldbank.org/en/research/commodity-markets" };

export type PinkSeriesId = "iron_ore" | "copper" | "lng_japan";
/** Which column to read, matched on the header text. */
export const PINK_SERIES: Record<PinkSeriesId, { label: string; match: RegExp }> = {
  iron_ore: { label: "Iron ore, 62% Fe, CFR China (US$/dry tonne)", match: /^iron ore/i },
  copper: { label: "Copper, LME (US$/tonne)", match: /^copper/i },
  lng_japan: { label: "LNG imported by Japan (US$/mmbtu)", match: /liquefied natural gas.*japan|lng.*japan/i },
};

export interface MonthlyPoint { month: string; value: number }
export interface PinkSeries { id: PinkSeriesId; label: string; header: string; unit: string | null; points: MonthlyPoint[] }

/** "2026M10" → "2026-10". */
export function pinkMonth(v: unknown): string | null {
  const m = typeof v === "string" ? /^(\d{4})M(\d{2})$/.exec(v.trim()) : null;
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Read the "Monthly Prices" sheet: find the header row, then pull each series' column. */
export function parsePinkSheet(buf: ArrayBuffer | Buffer, years = 6): { series: PinkSeries[]; headers: string[] } {
  const wb = XLSX.read(buf, { type: Buffer.isBuffer(buf) ? "buffer" : "array" });
  const name = wb.SheetNames.find((n) => /monthly prices/i.test(n)) ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
  const firstData = rows.findIndex((r) => pinkMonth(r?.[0]) !== null);
  if (firstData < 1) return { series: [], headers: [] };
  // Above the data: a row of units like "($/mt)", and above that the row of names.
  const texts = (r: unknown[] | undefined) => (r ?? []).filter((c): c is string => typeof c === "string" && c.trim() !== "");
  const isUnits = (r: unknown[] | undefined) => { const t = texts(r); return t.length >= 5 && t.filter((c) => c.trim().startsWith("(")).length > t.length / 2; };
  let headerRow = firstData - 1;
  while (headerRow > 0 && (isUnits(rows[headerRow]) || texts(rows[headerRow]).length < 5)) headerRow--;
  const unitRow = isUnits(rows[headerRow + 1]) ? headerRow + 1 : -1;
  const headers = (rows[headerRow] ?? []).map((c) => (typeof c === "string" ? c.replace(/\s+/g, " ").trim() : ""));
  const units = (unitRow >= 0 ? rows[unitRow] : []).map((c) => (typeof c === "string" ? c.replace(/[()]/g, "").trim() : null));
  const cutoff = `${new Date().getUTCFullYear() - years}-01`;
  const series: PinkSeries[] = [];
  for (const [id, def] of Object.entries(PINK_SERIES) as [PinkSeriesId, (typeof PINK_SERIES)[PinkSeriesId]][]) {
    const col = headers.findIndex((h) => def.match.test(h));
    if (col < 0) continue;
    const points: MonthlyPoint[] = [];
    for (const r of rows.slice(firstData)) {
      const month = pinkMonth(r?.[0]);
      const v = r?.[col];
      const value = typeof v === "number" ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null;
      if (month && month >= cutoff && value !== null) points.push({ month, value });
    }
    series.push({ id, label: def.label, header: headers[col], unit: units[col] ?? null, points });
  }
  return { series, headers };
}

/** Last month's average, change since December, and the 5-year range. */
export interface PriceSummary { latest: MonthlyPoint; ytd: number | null; low5y: MonthlyPoint; high5y: MonthlyPoint; avg5y: number }
export function summarise(points: MonthlyPoint[]): PriceSummary | null {
  if (!points.length) return null;
  const latest = points[points.length - 1];
  const dec = points.find((p) => p.month === `${Number(latest.month.slice(0, 4)) - 1}-12`);
  const from = `${Number(latest.month.slice(0, 4)) - 5}-${latest.month.slice(5)}`;
  const last5 = points.filter((p) => p.month > from);
  const low5y = last5.reduce((a, b) => (b.value < a.value ? b : a));
  const high5y = last5.reduce((a, b) => (b.value > a.value ? b : a));
  return { latest, ytd: dec ? latest.value / dec.value - 1 : null, low5y, high5y, avg5y: last5.reduce((s, p) => s + p.value, 0) / last5.length };
}
