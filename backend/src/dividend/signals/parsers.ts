import * as XLSX from "xlsx";
import { parseDividendCsv } from "../sources";
import type { BtosPayload, BtosPoint, EciModel, EpochPayload, IndeedPayload } from "./types";

// SheetJS is CommonJS: depending on the bundler, its members sit on the namespace or on `default`.
const XLSX_DEFAULT = Reflect.get(XLSX, "default") as typeof XLSX | undefined;
const XL = {
  CFB: XLSX.CFB ?? XLSX_DEFAULT?.CFB,
  SSF: XLSX.SSF ?? XLSX_DEFAULT?.SSF,
  read: XLSX.read ?? XLSX_DEFAULT?.read,
  utils: XLSX.utils ?? XLSX_DEFAULT?.utils,
} as typeof XLSX;

const isoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z"));

// ── Epoch AI: Capabilities Index ─────────────────────────────────

const ECI_FILE = "epoch_capabilities_index.csv";
/** Since 18 Nov 2026 the archive ships epoch_capabilities_index/eci_scores.csv instead. */
const ECI_FILES = [ECI_FILE, "eci_scores.csv"];

/** Pull the ECI scores CSV out of Epoch's benchmark_data.zip (old or new layout). */
export function readEpochArchive(bytes: ArrayBuffer | Uint8Array): string {
  const reader = XL.CFB;
  if (!reader) throw new Error("ZIP reader is unavailable");
  const archive = reader.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { type: "array" }) as { FullPaths: string[]; FileIndex: { content?: Uint8Array; size: number }[] };
  const entries = archive.FullPaths.map((name, index) => ({ name, entry: archive.FileIndex[index] })).filter(item => ECI_FILES.includes(item.name.split("/").at(-1) ?? ""));
  if (entries.length !== 1 || !entries[0].entry.content || entries[0].entry.size > 10_000_000) throw new Error(`Epoch archive does not contain one bounded ${ECI_FILE}`);
  return Buffer.from(entries[0].entry.content).toString("utf8");
}

export function parseEci(csv: string): EpochPayload {
  const rows = parseDividendCsv(csv);
  // Two layouts: the original epoch_capabilities_index.csv, and eci_scores.csv (from 18 Nov 2026).
  const legacy = { model: "Model version", score: "ECI Score", date: "Release date" };
  const current = { model: "Model", score: "eci", date: "date" };
  const cols = [legacy, current].find(c => rows[0] && [c.model, c.score, c.date, "Organization", "Model accessibility"].every(key => Object.hasOwn(rows[0], key)));
  if (!cols) throw new Error("Epoch ECI CSV header changed");
  const models: EciModel[] = [];
  for (const row of rows) {
    const score = Number(row[cols.score]);
    const date = row[cols.date];
    if (!row[cols.score] || !Number.isFinite(score) || !isoDate(date)) continue;
    const access = row["Accessibility group"] || row["Model accessibility"] || "";
    models.push({
      model: row[cols.model],
      name: row["Display name"] || row["Model name"] || row[cols.model],
      organization: row.Organization ?? "",
      date,
      score: Math.round(score * 10) / 10,
      open: /^open weights/i.test(access),
    });
  }
  if (models.length < 20) throw new Error("Epoch ECI CSV has too few scored models");
  return { models: models.sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model)) };
}

// ── Census BTOS: business AI use ─────────────────────────────────

function percent(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? (value <= 1 ? value * 100 : value) : null;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) : null;
}

function usDate(value: unknown): string | null {
  if (typeof value === "number") {
    const parsed = XL.SSF?.parse_date_code?.(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : null;
  }
  // Census switched from M/D/YYYY to M/D/YY in Nov 2026; BTOS starts in 2022, so YY is always 20YY.
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  return match ? `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : null;
}

/**
 * National.xlsx: "Response Estimates" has one row per question × answer and one
 * column per fortnight code (e.g. 202525); "Collection and Reference Dates" maps
 * those codes to dates. AI questions are found by wording, not by ID, because
 * Census renumbers questions between survey cycles.
 */
export function parseBtos(bytes: ArrayBuffer | Uint8Array): BtosPayload {
  const workbook = XL.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { type: "array" });
  const sheet = (pattern: RegExp) => {
    const name = workbook.SheetNames.find(item => pattern.test(item));
    if (!name) throw new Error(`BTOS workbook is missing a sheet matching ${pattern}`);
    return XL.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: null });
  };
  const estimates = sheet(/^response estimates$/i);
  const dates = sheet(/^collection and reference dates$/i);
  const header = (estimates[0] ?? []).map(value => String(value ?? "").trim());
  const questionCol = header.indexOf("Question");
  const answerCol = header.indexOf("Answer");
  if (questionCol < 0 || answerCol < 0) throw new Error("BTOS estimates header changed");
  const dateHeader = (dates[0] ?? []).map(value => String(value ?? "").trim().toLowerCase());
  const codeCol = dateHeader.indexOf("smpdt");
  const refEndCol = dateHeader.indexOf("ref end");
  if (codeCol < 0 || refEndCol < 0) throw new Error("BTOS reference-date header changed");
  const refEnd = new Map<string, string>();
  for (const row of dates.slice(1)) {
    const code = String(row[codeCol] ?? "").trim();
    const date = usDate(row[refEndCol]);
    if (/^\d{6}$/.test(code) && date) refEnd.set(code, date);
  }
  const findRow = (pattern: RegExp) => {
    const matches = estimates.slice(1).filter(row => pattern.test(String(row[questionCol] ?? "").replace(/\s+/g, " ")) && String(row[answerCol] ?? "").trim() === "Yes");
    if (matches.length > 1) throw new Error("BTOS has more than one matching AI question");
    return matches[0] ?? null;
  };
  const useRow = findRow(/last two weeks, did this business use .*artificial intelligence/i);
  const expectedRow = findRow(/next six months, do you think this business will be using .*artificial intelligence/i);
  if (!useRow) throw new Error("BTOS no longer contains the AI-use question");
  const points: BtosPoint[] = [];
  header.forEach((code, column) => {
    if (!/^\d{6}$/.test(code)) return;
    const period = refEnd.get(code);
    const use = percent(useRow[column]);
    const expected = expectedRow ? percent(expectedRow[column]) : null;
    if (period && (use !== null || expected !== null)) points.push({ period, sampleCode: code, use, expected });
  });
  if (!points.some(point => point.use !== null)) throw new Error("BTOS AI-use row has no estimates");
  return { useQuestion: String(useRow[questionCol]).replace(/\s+/g, " ").trim(), points: points.sort((a, b) => a.period.localeCompare(b.period)) };
}

// ── Indeed Hiring Lab: postings by occupation ────────────────────

export function parseIndeedSectors(csv: string): IndeedPayload {
  const rows = parseDividendCsv(csv);
  if (!rows[0] || !["date", "indeed_job_postings_index", "variable", "display_name"].every(key => Object.hasOwn(rows[0], key))) throw new Error("Indeed sector CSV header changed");
  const sums = new Map<string, Map<string, { total: number; count: number }>>();
  let latestDay = "";
  for (const row of rows) {
    if (row.variable !== "total postings" || (row.jobcountry && row.jobcountry !== "US") || !isoDate(row.date)) continue;
    const value = Number(row.indeed_job_postings_index);
    if (!row.indeed_job_postings_index || !Number.isFinite(value)) continue;
    const month = row.date.slice(0, 7);
    const sector = sums.get(row.display_name) ?? new Map();
    const bucket = sector.get(month) ?? { total: 0, count: 0 };
    bucket.total += value; bucket.count += 1;
    sector.set(month, bucket); sums.set(row.display_name, sector);
    if (row.date > latestDay) latestDay = row.date;
  }
  if (sums.size < 20) throw new Error("Indeed sector CSV has too few occupations");
  const sectors = [...sums.entries()].map(([sector, months]) => ({
    sector,
    points: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, bucket]) => ({ period, value: Math.round(bucket.total / bucket.count * 100) / 100 })),
  })).sort((a, b) => a.sector.localeCompare(b.sector));
  return { sectors, latestDay };
}
