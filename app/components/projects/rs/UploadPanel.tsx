"use client";
/* ────────────────────────────────────────────────────────────────
   CSV/XLSX upload — optional secondary input for symbols outside the
   scanned universe (PLAN task 1). Parsed entirely client-side with
   `xlsx` (already a dependency, previously unused). Uploaded rows
   are kept in their own list and their own percentile pool — they
   are never merged into the scanned BullRow[] used by the heatmap,
   quadrant view or leadership strip, so an upload can't quietly
   skew a ranking derived from the real scan.

   Two accepted shapes (column names matched case-insensitively):
     - summary: symbol[, displayName][, rs63|rs|value]
     - series:  symbol, date, close|price|last  (one row per date;
                RS = self-return from first to last close — NOT
                benchmark-relative like the API's rs63)
──────────────────────────────────────────────────────────────── */
import { useRef, useState } from "react";
import type * as XLSXType from "xlsx";
import { formatRs, percentileRank } from "./rsData";

export type UploadedRow = {
  symbol: string;
  displayName: string;
  rs63: number | null;
  method: "provided" | "self_return" | "no_data";
};

function normKey(k: string): string {
  return k.trim().toLowerCase();
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) norm[normKey(k)] = v;
  for (const k of keys) if (norm[k] !== undefined && norm[k] !== null) return norm[k];
  return undefined;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

async function parseWorkbook(buffer: ArrayBuffer): Promise<{ rows: UploadedRow[]; errors: string[] }> {
  const errors: string[] = [];
  // Lazy-loaded: xlsx is a large library and this module's page should stay
  // light for the common case (nobody uploads a file this visit).
  const XLSX: typeof XLSXType = await import("xlsx");
  let wb: XLSXType.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    return { rows: [], errors: ["Could not read this file — expected a .csv or .xlsx export."] };
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], errors: ["No sheets found in file."] };
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null }) as Record<string, unknown>[];
  if (raw.length === 0) return { rows: [], errors: ["Sheet has no data rows."] };

  const hasRsCol = raw.some((r) => pick(r, ["rs63", "rs", "value"]) !== undefined);
  const hasSeriesCols =
    raw.some((r) => pick(r, ["date"]) !== undefined) && raw.some((r) => pick(r, ["close", "price", "last"]) !== undefined);

  if (hasRsCol) {
    const rows: UploadedRow[] = [];
    for (const r of raw) {
      const symbolRaw = pick(r, ["symbol", "ticker"]);
      if (typeof symbolRaw !== "string" || symbolRaw.trim() === "") {
        errors.push("A row was missing a symbol/ticker column — skipped.");
        continue;
      }
      const symbol = symbolRaw.trim().toUpperCase();
      const nameRaw = pick(r, ["displayname", "name", "label"]);
      const rs = toNumber(pick(r, ["rs63", "rs", "value"]));
      rows.push({
        symbol,
        displayName: typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : symbol,
        rs63: rs,
        method: rs === null ? "no_data" : "provided",
      });
    }
    return { rows, errors };
  }

  if (hasSeriesCols) {
    const bySymbol = new Map<string, { date: string; close: number }[]>();
    for (const r of raw) {
      const symbolRaw = pick(r, ["symbol", "ticker"]);
      const dateRaw = pick(r, ["date"]);
      const close = toNumber(pick(r, ["close", "price", "last"]));
      if (typeof symbolRaw !== "string" || typeof dateRaw !== "string" || close === null) continue;
      const key = symbolRaw.trim().toUpperCase();
      const list = bySymbol.get(key) ?? [];
      list.push({ date: dateRaw, close });
      bySymbol.set(key, list);
    }
    if (bySymbol.size === 0) {
      return { rows: [], errors: ["Found date/close columns but no rows with a valid symbol, date and close together."] };
    }
    const rows: UploadedRow[] = [];
    for (const [symbol, list] of bySymbol) {
      list.sort((a, b) => a.date.localeCompare(b.date));
      if (list.length < 2 || list[0].close === 0) {
        rows.push({ symbol, displayName: symbol, rs63: null, method: "no_data" });
        continue;
      }
      const ret = ((list[list.length - 1].close - list[0].close) / list[0].close) * 100;
      rows.push({ symbol, displayName: symbol, rs63: ret, method: "self_return" });
    }
    return { rows, errors };
  }

  return {
    rows: [],
    errors: [
      "Couldn't find a symbol+rs63 column or a symbol+date+close column. Expected headers like symbol,rs63 or symbol,date,close.",
    ],
  };
}

const METHOD_LABEL: Record<UploadedRow["method"], string> = {
  provided: "provided",
  self_return: "self-return (uploaded series)",
  no_data: "no_data",
};

export default function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UploadedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const onFile = (file: File) => {
    setFileName(file.name);
    file
      .arrayBuffer()
      .then((buf) => parseWorkbook(buf))
      .then(({ rows: parsed, errors: errs }) => {
        setRows(parsed);
        setErrors(errs);
      })
      .catch(() => {
        setRows([]);
        setErrors(["Could not read this file."]);
      });
  };

  const pool = rows.map((r) => r.rs63);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-[2px] border border-[var(--line)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-2)] transition-colors hover:border-[var(--line-2)] hover:text-[var(--ink)]"
        >
          Upload CSV / XLSX
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        {fileName && <span className="font-mono text-[10px] text-[var(--ink-3)]">{fileName}</span>}
        {rows.length > 0 && (
          <button
            onClick={() => {
              setRows([]);
              setErrors([]);
              setFileName(null);
            }}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)] underline decoration-[var(--line-2)] underline-offset-4 hover:text-[var(--ink-2)]"
          >
            Clear
          </button>
        )}
      </div>

      {errors.length > 0 && (
        <div className="mt-3 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-[var(--ink-3)]">
              {e}
            </p>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <div className="grid grid-cols-[minmax(8rem,1.4fr)_5.5rem_8rem_6rem] items-baseline gap-x-3 border-b border-[var(--line)] pb-2">
            {["Symbol", "RS", "Method", "Pct (upload set)"].map((h) => (
              <p key={h} className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                {h}
              </p>
            ))}
          </div>
          {rows.map((r) => (
            <div
              key={r.symbol}
              className="grid grid-cols-[minmax(8rem,1.4fr)_5.5rem_8rem_6rem] items-baseline gap-x-3 border-b border-[var(--line)] py-2"
            >
              <p className="truncate text-[12px] text-[var(--ink)]">{r.displayName}</p>
              <p className="font-mono text-[11px] tabular-nums text-[var(--ink-2)]">{formatRs(r.rs63)}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                {METHOD_LABEL[r.method]}
              </p>
              <p className="font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                {r.rs63 === null ? "—" : `${percentileRank(r.rs63, pool)?.toFixed(0) ?? "—"}`}
              </p>
            </div>
          ))}
          <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-[var(--ink-3)]">
            Uploaded rows are kept separate from the scanned universe — they never
            enter the heatmap, quadrant view or leadership strip, and their
            percentile is computed only within this upload set, not against the
            ~650-symbol scan.
          </p>
        </div>
      )}
    </div>
  );
}
