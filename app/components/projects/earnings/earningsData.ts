"use client";
/* ────────────────────────────────────────────────────────────────
   Earnings Beat Leaderboard (Module 8) — data layer
   Same posture as bull/bullData.ts: field-by-field normalisation,
   honest states (loading / live / pending / error), no modeled
   numbers. One endpoint: /api/leaderboard/earnings-beats — the
   ranked watchlist, scored on-read from cached Finnhub quarters
   (architecture spec §3/§4; the read path never calls Finnhub).

   Null is a first-class value end-to-end: a null rank_score means
   "no signal", never 0; a null surprise renders "—", never a zero
   that could outrank a genuine miss.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

/* ── palette: beat violet — distinct from oil amber, gold, BTC
   orange, bull cobalt, regime mint and thesis cyan ── */
export const BEAT_ACCENT = "#b48ee8";
export const BEAT_BRIGHT = "#cdb2f2";
export const BEAT_MISS = "#a8496b"; // missed estimate
export const BEAT_MUTED = "#b8a375"; // partial / low-confidence

export const BEAT_ROUTE = "/Projects/Earnings-Beat";

export type BeatConfidence = "high" | "medium" | "low" | null;

export type BeatQuarter = {
  fiscalYear: number;
  fiscalQuarter: number;
  epsSurprisePercent: number | null;
  revenueSurprisePercent: number | null;
};

export type BeatLatest = {
  fiscalYear: number;
  fiscalQuarter: number;
  /** NULL for quarters backfilled solely from /stock/earnings (no
   *  announcement date on that endpoint — never faked). */
  reportDate: string | null;
  reportHour: "bmo" | "amc" | "dmh" | null;
  reportedEps: number | null;
  estimatedEps: number | null;
  epsSurprisePercent: number | null;
  reportedRevenue: number | null;
  revenueSurprisePercent: number | null;
};

export type BeatRow = {
  ticker: string;
  companyName: string | null;
  isActive: boolean;
  /** null = no quarter carries signal — sorts last, renders "—". */
  rankScore: number | null;
  beatStreak: number;
  /** True when every cached quarter is a beat: the real streak may
   *  extend past the edge of the cache — render "N+", not "N". */
  streakIsCapped: boolean;
  confidence: BeatConfidence;
  epsSurpriseAvg: number | null;
  revenueSurpriseAvg: number | null;
  quartersAvailable: number;
  latest: BeatLatest | null;
  /** Newest-first full cached history. */
  quarters: BeatQuarter[];
};

export type BeatStatus = "loading" | "live" | "pending" | "error";

export type BeatLeaderboardState = {
  status: BeatStatus;
  dataAsOf: string | null;
  count: number;
  rows: BeatRow[];
  errorMessage?: string;
};

const EMPTY: BeatLeaderboardState = { status: "loading", dataAsOf: null, count: 0, rows: [] };

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const int = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const toConfidence = (v: unknown): BeatConfidence =>
  v === "high" || v === "medium" || v === "low" ? v : null;

const toHour = (v: unknown): "bmo" | "amc" | "dmh" | null =>
  v === "bmo" || v === "amc" || v === "dmh" ? v : null;

function normalizeQuarter(raw: unknown): BeatQuarter | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const fy = num(o.fiscal_year);
  const fq = num(o.fiscal_quarter);
  if (fy === null || fq === null) return null;
  return {
    fiscalYear: fy,
    fiscalQuarter: fq,
    epsSurprisePercent: num(o.eps_surprise_percent),
    revenueSurprisePercent: num(o.revenue_surprise_percent),
  };
}

function normalizeLatest(raw: unknown): BeatLatest | null {
  if (raw == null) return null;
  const o = raw as Record<string, unknown>;
  const fy = num(o.fiscal_year);
  const fq = num(o.fiscal_quarter);
  if (fy === null || fq === null) return null;
  return {
    fiscalYear: fy,
    fiscalQuarter: fq,
    reportDate: str(o.report_date),
    reportHour: toHour(o.report_hour),
    reportedEps: num(o.reported_eps),
    estimatedEps: num(o.estimated_eps),
    epsSurprisePercent: num(o.eps_surprise_percent),
    reportedRevenue: num(o.reported_revenue),
    revenueSurprisePercent: num(o.revenue_surprise_percent),
  };
}

function normalizeRow(raw: unknown): BeatRow | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const ticker = str(o.ticker);
  if (!ticker) return null;
  const rawQuarters = Array.isArray(o.quarters) ? o.quarters : [];
  return {
    ticker,
    companyName: str(o.company_name),
    isActive: o.is_active !== false,
    rankScore: num(o.rank_score),
    beatStreak: int(o.beat_streak),
    streakIsCapped: o.streak_is_capped === true,
    confidence: toConfidence(o.confidence),
    epsSurpriseAvg: num(o.eps_surprise_avg),
    revenueSurpriseAvg: num(o.revenue_surprise_avg),
    quartersAvailable: int(o.quarters_available),
    latest: normalizeLatest(o.latest),
    quarters: rawQuarters
      .map(normalizeQuarter)
      .filter((q): q is BeatQuarter => q !== null),
  };
}

export function normalizeBeatLeaderboard(raw: unknown): BeatLeaderboardState {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rawResults = Array.isArray(o.results) ? o.results : [];
  const rows = rawResults
    .map(normalizeRow)
    .filter((r): r is BeatRow => r !== null);
  if (rows.length === 0) {
    return { status: "pending", dataAsOf: str(o.data_as_of), count: 0, rows: [] };
  }
  return {
    status: "live",
    dataAsOf: str(o.data_as_of),
    count: rows.length,
    rows, // API order IS the leaderboard order (§3.3) — never re-sorted here
  };
}

/** Single fetch of the ranked leaderboard; the API's sort order is
 *  authoritative (§3.3 tie-breaks live server-side, not here). */
export function useBeatLeaderboard(limit = 100): BeatLeaderboardState {
  const [state, setState] = useState<BeatLeaderboardState>(EMPTY);
  useEffect(() => {
    let alive = true;
    fetch(`/api/leaderboard/earnings-beats?limit=${limit}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!alive) return;
        if (!res.ok) {
          const err = (body?.error ?? {}) as Record<string, unknown>;
          setState({
            status: "error", dataAsOf: null, count: 0, rows: [],
            errorMessage:
              typeof err.message === "string"
                ? err.message
                : `leaderboard api responded ${res.status}`,
          });
          return;
        }
        setState(normalizeBeatLeaderboard(body));
      })
      .catch((err) => {
        if (!alive) return;
        setState({
          status: "error", dataAsOf: null, count: 0, rows: [],
          errorMessage: err instanceof Error ? err.message : "network error",
        });
      });
    return () => { alive = false; };
  }, [limit]);
  return state;
}

/* ── display metadata ─────────────────────────────────────────── */

export const CONFIDENCE_META: Record<
  Exclude<BeatConfidence, null>,
  { label: string; color: string }
> = {
  high: { label: "HIGH", color: BEAT_ACCENT },
  medium: { label: "MED", color: BEAT_MUTED },
  low: { label: "LOW", color: BEAT_MUTED },
};

export const confidenceMeta = (c: BeatConfidence): { label: string; color: string } =>
  c === null ? { label: "—", color: "var(--ink-3)" } : CONFIDENCE_META[c];

/** Streak cell: "4+" when the streak runs off the edge of the cache
 *  (streak_is_capped) — the honest "at least" rendering (§3.1). */
export const formatStreak = (r: Pick<BeatRow, "beatStreak" | "streakIsCapped">): string =>
  r.beatStreak > 0 && r.streakIsCapped ? `${r.beatStreak}+` : String(r.beatStreak);

/** One glyph per quarter for the beat map: beat ▲ / miss ▼ / met ◦ /
 *  unknown · (a null surprise is a data gap, not a meet). */
export const quarterGlyph = (epsSurprisePercent: number | null): string =>
  epsSurprisePercent === null ? "·"
    : epsSurprisePercent > 0 ? "▲"
      : epsSurprisePercent < 0 ? "▼"
        : "◦";

export const glyphColor = (g: string): string =>
  g === "▲" ? BEAT_ACCENT : g === "▼" ? BEAT_MISS : g === "◦" ? "var(--ink-2)" : "var(--ink-3)";

/* ── display helpers (deterministic across server/client) ─────── */

export const formatPct = (v: number | null): string => {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)}%`;
};

export const formatScore = (v: number | null): string =>
  v === null ? "—" : v.toFixed(2);

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export const formatQuarterLabel = (fy: number, fq: number): string => `FY${String(fy).slice(-2)} Q${fq}`;
