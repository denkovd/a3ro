/** Official EIA download fallback. Source-key and Excel serial dates are validated;
 * using serial dates avoids timezone shifts from SheetJS Date conversion.
 */
import * as XLSX from "xlsx";
import { SourceError } from "../core/types";
export type PublicEiaRow = { period: string; value: number; series: string };

export function parsePublicEiaWorkbook(bytes: ArrayBuffer, series: string): PublicEiaRow[] {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
  const sheet = workbook.Sheets["Data 1"];
  if (!sheet) throw new SourceError("eia-public", "bad_payload", "EIA download missing Data 1 sheet");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
  const key = rows.find(row => row[0] === "Sourcekey");
  if (key?.[1] !== series) throw new SourceError("eia-public", "bad_payload", "EIA download series does not match requested source key");
  return rows.flatMap(row => {
    if (typeof row[0] !== "number" || typeof row[1] !== "number" || !Number.isFinite(row[1])) return [];
    // Post-1900 Excel serial dates include the historic leap-year offset.
    if (row[0] < 61 || row[0] > 110_000 || !Number.isFinite(row[0])) return [];
    const period = new Date(Date.UTC(1899,11,30) + Math.floor(row[0]) * 86_400_000).toISOString().slice(0,10);
    return [{ period, value: row[1], series }];
  }).sort((a,b) => a.period.localeCompare(b.period));
}

export async function fetchPublicEiaSeries(series: string, frequency: "daily" | "weekly", from?: string, to = new Date().toISOString().slice(0,10)) {
  if (!/^[A-Z0-9_]+$/.test(series)) throw new Error("Invalid EIA series identifier");
  const url = `https://www.eia.gov/dnav/pet/hist_xls/${series}${frequency === "daily" ? "d" : "w"}.xls`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new SourceError("eia-public", "upstream_error", `Official EIA download HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 10_000_000) throw new SourceError("eia-public", "bad_payload", "EIA workbook too large");
  const rows = parsePublicEiaWorkbook(bytes, series).filter(row => (!from || row.period >= from) && row.period <= to);
  if (!rows.length) throw new SourceError("eia-public", "no_data", "EIA public download has no observations in the requested period");
  return rows;
}
