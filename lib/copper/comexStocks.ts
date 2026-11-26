/* ────────────────────────────────────────────────────────────────
   COMEX copper warehouse stocks (roadmap #56)

   CME's free daily delivery report, Copper_Stocks.xls: copper held in
   COMEX-approved warehouses, split into registered (on warrant, ready
   to deliver against futures) and eligible (meets the standard but not
   on warrant). Short tons. Same report family as Gold_Stocks.xls
   (backend/src/sources/comexGoldStocks.ts), but this parser finds its
   columns by their headers rather than fixed positions.

   No relative imports, so tests can load it with Node's type stripping.
──────────────────────────────────────────────────────────────── */
import * as XLSX from "xlsx";

export const COPPER_STOCKS_URL = "https://www.cmegroup.com/delivery_reports/Copper_Stocks.xls";
export const SHORT_TON_TONNES = 0.90718474;

export interface ComexCopperStocks {
  reportDate: string | null;
  activityDate: string | null;
  /** Short tons. */
  registered: number;
  eligible: number;
  total: number;
  /** Previous report's totals, when the report gives them. */
  prevRegistered: number | null;
  prevTotal: number | null;
  unit: "short tons";
  sourceUrl: string;
  retrievedAt: string;
}

function usDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Parses the report rows (a sheet as an array of rows). */
export function parseCopperStockRows(rows: unknown[][], sourceUrl = COPPER_STOCKS_URL, retrievedAt = new Date().toISOString()): ComexCopperStocks {
  let reportDate: string | null = null;
  let activityDate: string | null = null;
  let prevCol = -1, todayCol = -1;
  let reg: { today: number; prev: number | null } | null = null;
  let elig: { today: number; prev: number | null } | null = null;
  let tot: { today: number; prev: number | null } | null = null;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const t = text(cell);
      if (/Report Date/i.test(t)) reportDate = usDate(t) ?? reportDate;
      if (/Activity Date/i.test(t)) activityDate = usDate(t) ?? activityDate;
    }
    const headers = row.map((c) => text(c).toUpperCase());
    if (headers.some((h) => /TOTAL TODAY/.test(h))) {
      todayCol = headers.findIndex((h) => /TOTAL TODAY/.test(h));
      prevCol = headers.findIndex((h) => /PREV(IOUS)?\s*TOTAL/.test(h));
      continue;
    }
    const label = (row.map(text).find((t) => t !== "") ?? "").toUpperCase();
    if (!/^TOTAL|^COMBINED|^GRAND/.test(label)) continue;
    const today = todayCol >= 0 ? num(row[todayCol]) : null;
    if (today === null) continue;
    const entry = { today, prev: prevCol >= 0 ? num(row[prevCol]) : null };
    if (/REGISTERED/.test(label)) reg = entry;
    else if (/ELIGIBLE/.test(label)) elig = entry;
    else if (/COMBINED|GRAND|TOTAL COPPER|^TOTAL$/.test(label)) tot = entry;
  }
  if (todayCol < 0) throw new Error("COMEX copper report: TOTAL TODAY column not found");
  if (!reg || !elig) throw new Error("COMEX copper report: registered or eligible total missing");
  const total = tot?.today ?? reg.today + elig.today;
  if (Math.abs(total - (reg.today + elig.today)) > Math.max(5, total * 0.001)) throw new Error("COMEX copper report: totals do not add up");
  if (total <= 0 || total > 5_000_000) throw new Error("COMEX copper report: total out of range");
  const prevTotal = tot?.prev ?? (reg.prev !== null && elig.prev !== null ? reg.prev + elig.prev : null);
  return { reportDate, activityDate, registered: reg.today, eligible: elig.today, total, prevRegistered: reg.prev, prevTotal, unit: "short tons", sourceUrl, retrievedAt };
}

export function parseCopperStocksXls(buf: ArrayBuffer | Uint8Array, sourceUrl = COPPER_STOCKS_URL, retrievedAt = new Date().toISOString()): ComexCopperStocks {
  const wb = XLSX.read(buf, { type: buf instanceof ArrayBuffer ? "array" : "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("COMEX copper report has no sheet");
  return parseCopperStockRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][], sourceUrl, retrievedAt);
}

export async function fetchComexCopperStocks(opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<ComexCopperStocks> {
  const now = opts.now ?? new Date();
  const res = await (opts.fetchImpl ?? fetch)(COPPER_STOCKS_URL, {
    headers: { Accept: "application/vnd.ms-excel,*/*", "User-Agent": "Mozilla/5.0 (compatible; A3RO daily metals statistics)" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`CME HTTP ${res.status}`);
  return parseCopperStocksXls(new Uint8Array(await res.arrayBuffer()), COPPER_STOCKS_URL, now.toISOString());
}
