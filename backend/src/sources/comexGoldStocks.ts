/* ────────────────────────────────────────────────────────────────
   CME COMEX free daily Gold Stocks report (Gold_Stocks.xls).
   Public delivery report — registered / eligible warehouse troy oz.

   GET https://www.cmegroup.com/delivery_reports/Gold_Stocks.xls
   Probed live 2026-07-21 via Node fetch (keyless).

   Parses TOTAL REGISTERED / TOTAL ELIGIBLE / COMBINED TOTAL "TOTAL TODAY"
   columns and Report Date. Pure parse is fixture-tested.
──────────────────────────────────────────────────────────────── */

import * as XLSX from "xlsx";
import { SourceError } from "../core/types";
import type { GoldFlowMetricInput } from "../storage/goldFlowRepo";

const SOURCE_ID = "comex-stocks";
const REPORT_URL = "https://www.cmegroup.com/delivery_reports/Gold_Stocks.xls";

export interface ComexGoldStocksReading {
  reportDate: string; // YYYY-MM-DD
  activityDate: string | null;
  registeredToz: number;
  eligibleToz: number;
  pledgedToz: number | null;
  combinedToz: number;
  prevRegisteredToz: number | null;
}

function parseUsDate(raw: string): string | null {
  // "7/21/2026" or "Report Date: 7/21/2026"
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function cellNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Pure parse from XLS buffer. */
export function parseComexGoldStocksXls(buf: ArrayBuffer | Buffer | Uint8Array): ComexGoldStocksReading {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    throw new SourceError(SOURCE_ID, "bad_payload", "COMEX Gold Stocks xls has no sheet");
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];

  let reportDate: string | null = null;
  let activityDate: string | null = null;
  let registeredToz: number | null = null;
  let eligibleToz: number | null = null;
  let pledgedToz: number | null = null;
  let combinedToz: number | null = null;
  let prevRegisteredToz: number | null = null;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (typeof cell === "string") {
        if (/Report Date/i.test(cell)) reportDate = parseUsDate(cell) ?? reportDate;
        if (/Activity Date/i.test(cell)) activityDate = parseUsDate(cell) ?? activityDate;
      }
    }
    const label = String(row[0] ?? "").trim().toUpperCase();
    // Columns: [label, , PREV TOTAL, RECEIVED, WITHDRAWN, NET CHANGE, ADJUSTMENT, TOTAL TODAY]
    const prev = cellNum(row[2]);
    const today = cellNum(row[7]) ?? cellNum(row[2]);
    if (label === "TOTAL REGISTERED" && today != null) {
      registeredToz = today;
      prevRegisteredToz = prev;
    } else if (label === "TOTAL ELIGIBLE" && today != null) {
      eligibleToz = today;
    } else if (label === "TOTAL PLEDGED" && today != null) {
      pledgedToz = today;
    } else if (label === "COMBINED TOTAL" && today != null) {
      combinedToz = today;
    }
  }

  if (!reportDate) {
    throw new SourceError(SOURCE_ID, "bad_payload", "COMEX Gold Stocks: missing Report Date");
  }
  if (registeredToz == null || eligibleToz == null || combinedToz == null) {
    throw new SourceError(
      SOURCE_ID,
      "bad_payload",
      `COMEX Gold Stocks: missing totals (reg=${registeredToz} elig=${eligibleToz} comb=${combinedToz})`,
    );
  }

  return {
    reportDate,
    activityDate,
    registeredToz,
    eligibleToz,
    pledgedToz,
    combinedToz,
    prevRegisteredToz,
  };
}

export async function fetchComexGoldStocks(): Promise<ComexGoldStocksReading> {
  const timeoutMs = 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(REPORT_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; a3ro-gold-tracker/1.0)",
        Accept: "application/vnd.ms-excel,*/*",
        Referer: "https://www.cmegroup.com/solutions/clearing/operations-and-deliveries/nymex-delivery-notices.html",
      },
    });
  } catch (cause) {
    clearTimeout(timer);
    const timedOut = cause instanceof Error && cause.name === "AbortError";
    throw new SourceError(
      SOURCE_ID,
      "network",
      timedOut ? `timeout after ${timeoutMs}ms` : String(cause),
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const kind =
      res.status === 401 || res.status === 403
        ? "auth"
        : res.status === 429
          ? "rate_limited"
          : res.status >= 500
            ? "upstream_error"
            : "bad_payload";
    throw new SourceError(SOURCE_ID, kind, `HTTP ${res.status} fetching COMEX Gold Stocks`, {
      status: res.status,
    });
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) {
    throw new SourceError(SOURCE_ID, "bad_payload", `COMEX Gold Stocks body too small (${buf.length}b)`);
  }
  return parseComexGoldStocksXls(buf);
}

export function comexReadingToMetrics(r: ComexGoldStocksReading): GoldFlowMetricInput[] {
  const meta = {
    activityDate: r.activityDate,
    report: "CME Gold_Stocks.xls",
  };
  const rows: GoldFlowMetricInput[] = [
    {
      locus: "comex",
      metric: "comex_registered_toz",
      periodDate: r.reportDate,
      value: r.registeredToz,
      unit: "troy_oz",
      source: SOURCE_ID,
      meta,
    },
    {
      locus: "comex",
      metric: "comex_eligible_toz",
      periodDate: r.reportDate,
      value: r.eligibleToz,
      unit: "troy_oz",
      source: SOURCE_ID,
      meta,
    },
    {
      locus: "comex",
      metric: "comex_combined_toz",
      periodDate: r.reportDate,
      value: r.combinedToz,
      unit: "troy_oz",
      source: SOURCE_ID,
      meta,
    },
  ];
  if (r.prevRegisteredToz != null) {
    rows.push({
      locus: "comex",
      metric: "comex_registered_delta_toz",
      periodDate: r.reportDate,
      value: r.registeredToz - r.prevRegisteredToz,
      unit: "troy_oz",
      source: SOURCE_ID,
      meta: { ...meta, kind: "vs_prev_total" },
    });
  }
  return rows;
}
