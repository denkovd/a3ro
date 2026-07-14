/* ────────────────────────────────────────────────────────────────
   Finnhub adapter — the only module that speaks Finnhub's wire
   format. Everything downstream (pipeline.ts) consumes the typed
   shapes in ./types, never these endpoints' raw JSON.

   See architecture spec §0 for why /calendar/earnings is PRIMARY
   (only free endpoint with revenue) and /stock/earnings is an
   OPTIONAL supplement (fiscal_date_ending + authoritative EPS %).
──────────────────────────────────────────────────────────────── */

import { getJsonForSource } from "../sources/http";
import { FinnhubCalendarEntry, FinnhubStockEarningsEntry, ReportHour } from "./types";

const BASE_URL = "https://finnhub.io/api/v1";
const SOURCE_ID = "finnhub";

interface CalendarResponse {
  earningsCalendar?: RawCalendarRow[];
}

interface RawCalendarRow {
  symbol?: string;
  date?: string;
  hour?: string;
  year?: number;
  quarter?: number;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
}

/** /stock/earnings returns a bare array, not { earningsCalendar: [...] }. */
type StockEarningsResponse = RawStockEarningsRow[];

interface RawStockEarningsRow {
  symbol?: string;
  period?: string;
  year?: number;
  quarter?: number;
  actual?: number | null;
  estimate?: number | null;
  surprise?: number | null;
  surprisePercent?: number | null;
}

function apiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY is not set (see backend/.env.example)");
  return key;
}

function normalizeReportHour(hour: string | null | undefined): ReportHour | null {
  if (hour === "bmo" || hour === "amc" || hour === "dmh") return hour;
  return null; // unrecognized/empty — never guess
}

/**
 * GET /calendar/earnings?from=&to=[&symbol=]
 * The PRIMARY source (§0): only free endpoint that carries revenue.
 * Without `symbol`, this is a whole-market call (Flow A, §2 step 1).
 * With `symbol`, this is the per-ticker backfill call (Flow B, §2).
 */
export async function fetchCalendarEarnings(
  from: string,
  to: string,
  symbol?: string,
): Promise<FinnhubCalendarEntry[]> {
  const params = new URLSearchParams({ from, to, token: apiKey() });
  if (symbol) params.set("symbol", symbol);
  const url = `${BASE_URL}/calendar/earnings?${params.toString()}`;
  const body = await getJsonForSource<CalendarResponse>(SOURCE_ID, url);
  const rows = body.earningsCalendar ?? [];
  return rows
    .filter((r): r is Required<Pick<RawCalendarRow, "symbol" | "date" | "year" | "quarter">> & RawCalendarRow =>
      typeof r.symbol === "string" && typeof r.date === "string" &&
      typeof r.year === "number" && typeof r.quarter === "number",
    )
    .map((r) => ({
      symbol: r.symbol,
      date: r.date,
      hour: normalizeReportHour(r.hour),
      year: r.year,
      quarter: r.quarter,
      epsActual: r.epsActual ?? null,
      epsEstimate: r.epsEstimate ?? null,
      revenueActual: r.revenueActual ?? null,
      revenueEstimate: r.revenueEstimate ?? null,
    }));
}

/**
 * GET /stock/earnings?symbol=X — OPTIONAL supplement (§0, §2).
 * Fills fiscal_date_ending (`period`) and the authoritative EPS
 * surprisePercent. Never the primary fetch; callers treat failures
 * here as non-fatal (the calendar row is still insertable without it).
 */
export async function fetchStockEarnings(symbol: string): Promise<FinnhubStockEarningsEntry[]> {
  const url = `${BASE_URL}/stock/earnings?${new URLSearchParams({ symbol, token: apiKey() })}`;
  const body = await getJsonForSource<StockEarningsResponse>(SOURCE_ID, url);
  return (Array.isArray(body) ? body : [])
    .filter((r): r is Required<Pick<RawStockEarningsRow, "symbol" | "period" | "year" | "quarter">> & RawStockEarningsRow =>
      typeof r.symbol === "string" && typeof r.period === "string" &&
      typeof r.year === "number" && typeof r.quarter === "number",
    )
    .map((r) => ({
      symbol: r.symbol,
      period: r.period,
      year: r.year,
      quarter: r.quarter,
      actual: r.actual ?? null,
      estimate: r.estimate ?? null,
      surprise: r.surprise ?? null,
      surprisePercent: r.surprisePercent ?? null,
    }));
}

/**
 * safePct(actual, estimate) — §2.
 * Edge case "Estimate = 0" (§5): dividing by zero would produce a
 * meaningless ±∞ surprise, so a zero (or missing) estimate returns
 * null rather than 0 or Infinity — null means "undefined surprise",
 * never "no surprise".
 */
export function safePct(actual: number | null, estimate: number | null): number | null {
  if (estimate === null || estimate === 0) return null;
  if (actual === null) return null; // defensive: no actual, no computable surprise
  return ((actual - estimate) / Math.abs(estimate)) * 100;
}
