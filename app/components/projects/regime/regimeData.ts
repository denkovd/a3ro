"use client";
/* ────────────────────────────────────────────────────────────────
   Regime Shift Finder (Module 4) — data layer
   One row shape, one endpoint (/api/regime/latest, already live on
   the backend). Field-by-field normalisation means a partial or
   malformed payload degrades gracefully instead of crashing the
   card — and when the scan hasn't run yet (empty table) or the
   endpoint errors, the UI is told so explicitly via `status` and
   renders an honest "awaiting first scan" state. No modeled numbers
   are ever presented as if they were live (A3RO truth-pass rule).
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

/* ── palette: cool signal-mint — reads as "confirmed / aligned"
   next to oil amber (#d4a157), gold (#dcc689) and BTC (#e0873a) ── */
export const REGIME_ACCENT = "#5fc9a4";
export const REGIME_BRIGHT = "#8fe0c0";

/* verdict-specific colors — bullish gets the module accent, everything
   else stays deliberately quiet so the accent reads as "the signal" */
export const MUTED_AMBER = "#b8a375"; // conflicted — neutral, not alarming
export const MUTED_PINK = "#a8496b"; // bearish — dimmed #e91e63, not alarming red

export const ROUTE = "/Projects/Regime-Finder";

/* ── row shape — mirrors RegimeSnapshotRow from the backend exactly ── */
export type AssetClass =
  | "crypto"
  | "metals"
  | "energy"
  | "index"
  | "fx"
  | "rates"
  | "equity"
  | "ags";

export type RegimeVerdict =
  | "BULLISH"
  | "CONFLICT_DAILY"
  | "CONFLICT_WEEKLY"
  | "BEARISH"
  | "WARMUP";

export type Trend = 1 | -1 | 0;

export type RegimeRow = {
  runDate: string;
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  verdict: RegimeVerdict;
  rank: number;
  newlyBullish: boolean;
  dailyTrend: Trend;
  weeklyTrend: Trend;
  dailyLine: number | null;
  weeklyLine: number | null;
  dailyFlipDate: string | null;
  dailyFlipPrice: number | null;
  weeklyFlipDate: string | null;
  weeklyFlipPrice: number | null;
  dailySinceFlipPct: number | null;
  weeklySinceFlipPct: number | null;
  dailyCushionPct: number | null;
  weeklyCushionPct: number | null;
  daysSinceAligned: number | null;
  alignedSince: string | null;
  strength: number | null;
  lastClose: number | null;
  lastCloseDate: string | null;
  updatedAt: string;
};

export type RegimeStatus = "loading" | "live" | "pending" | "error";

export type RegimeSnapshot = {
  status: RegimeStatus;
  runDate: string | null;
  count: number;
  rows: RegimeRow[];
  errorMessage?: string;
};

const EMPTY: RegimeSnapshot = { status: "loading", runDate: null, count: 0, rows: [] };

/* ── normalisers: any payload → safe values, never throw ── */
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const bool = (v: unknown): boolean => v === true;

const ASSET_CLASSES: AssetClass[] = [
  "crypto", "metals", "energy", "index", "fx", "rates", "equity", "ags",
];
const toAssetClass = (v: unknown): AssetClass =>
  ASSET_CLASSES.includes(v as AssetClass) ? (v as AssetClass) : "index";

const VERDICTS: RegimeVerdict[] = [
  "BULLISH", "CONFLICT_DAILY", "CONFLICT_WEEKLY", "BEARISH", "WARMUP",
];
const toVerdict = (v: unknown): RegimeVerdict =>
  VERDICTS.includes(v as RegimeVerdict) ? (v as RegimeVerdict) : "WARMUP";

const toTrend = (v: unknown): Trend => (v === 1 ? 1 : v === -1 ? -1 : 0);

function normalizeRow(raw: unknown, i: number): RegimeRow | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const symbol = str(o.symbol);
  const displayName = str(o.displayName);
  // a row with no identity is not renderable — drop it rather than
  // fabricate a placeholder asset
  if (!symbol || !displayName) return null;
  return {
    runDate: str(o.runDate) ?? "",
    symbol,
    displayName,
    assetClass: toAssetClass(o.assetClass),
    verdict: toVerdict(o.verdict),
    rank: num(o.rank) ?? i + 1,
    newlyBullish: bool(o.newlyBullish),
    dailyTrend: toTrend(o.dailyTrend),
    weeklyTrend: toTrend(o.weeklyTrend),
    dailyLine: num(o.dailyLine),
    weeklyLine: num(o.weeklyLine),
    dailyFlipDate: str(o.dailyFlipDate),
    dailyFlipPrice: num(o.dailyFlipPrice),
    weeklyFlipDate: str(o.weeklyFlipDate),
    weeklyFlipPrice: num(o.weeklyFlipPrice),
    dailySinceFlipPct: num(o.dailySinceFlipPct),
    weeklySinceFlipPct: num(o.weeklySinceFlipPct),
    dailyCushionPct: num(o.dailyCushionPct),
    weeklyCushionPct: num(o.weeklyCushionPct),
    daysSinceAligned: num(o.daysSinceAligned),
    alignedSince: str(o.alignedSince),
    strength: num(o.strength),
    lastClose: num(o.lastClose),
    lastCloseDate: str(o.lastCloseDate),
    updatedAt: str(o.updatedAt) ?? "",
  };
}

/** Normalise a raw /api/regime/latest payload into a RegimeSnapshot.
 *  - explicit `{ error }` shape → status "error"
 *  - no rows (table not seeded yet) → status "pending"
 *  - otherwise → status "live" with normalised rows */
export function normalizeSnapshot(raw: unknown): RegimeSnapshot {
  const o = (raw ?? {}) as Record<string, unknown>;

  if (typeof o.error === "string") {
    return { status: "error", runDate: null, count: 0, rows: [], errorMessage: o.error };
  }

  const rawRows = Array.isArray(o.rows) ? o.rows : [];
  const rows = rawRows
    .map((r, i) => normalizeRow(r, i))
    .filter((r): r is RegimeRow => r !== null)
    .sort((a, b) => a.rank - b.rank);

  if (rows.length === 0) {
    return { status: "pending", runDate: str(o.runDate), count: 0, rows: [] };
  }

  return {
    status: "live",
    runDate: str(o.runDate) ?? rows[0].runDate,
    count: typeof o.count === "number" ? o.count : rows.length,
    rows,
  };
}

/* ── hook: the module's single data entry point ──
   Starts in "loading" (SSR-safe, no invented numbers), fetches
   client-side, and settles into live / pending / error. Never
   throws past this boundary — a failed fetch becomes "error". */
export function useRegimeSnapshot(): RegimeSnapshot {
  const [snap, setSnap] = useState<RegimeSnapshot>(EMPTY);

  useEffect(() => {
    let alive = true;
    fetch("/api/regime/latest", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setSnap({
            status: "error",
            runDate: null,
            count: 0,
            rows: [],
            errorMessage:
              typeof (body as Record<string, unknown>)?.error === "string"
                ? (body as Record<string, unknown>).error as string
                : `regime api responded ${res.status}`,
          });
          return;
        }
        setSnap(normalizeSnapshot(body));
      })
      .catch((err) => {
        if (!alive) return;
        setSnap({
          status: "error",
          runDate: null,
          count: 0,
          rows: [],
          errorMessage: err instanceof Error ? err.message : "network error",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  return snap;
}

/* ── verdict display metadata ── */
export const VERDICT_META: Record<
  RegimeVerdict,
  { label: string; short: string; color: string }
> = {
  BULLISH: { label: "Bullish · D+W aligned", short: "BULLISH", color: REGIME_ACCENT },
  CONFLICT_DAILY: { label: "Conflicted · daily only", short: "CONFLICT", color: MUTED_AMBER },
  CONFLICT_WEEKLY: { label: "Conflicted · weekly only", short: "CONFLICT", color: MUTED_AMBER },
  BEARISH: { label: "Bearish · D+W aligned", short: "BEARISH", color: MUTED_PINK },
  WARMUP: { label: "Warm-up · insufficient history", short: "WARMUP", color: "var(--ink-3)" },
};

/* ── display helpers (deterministic across server/client) ── */
export const formatPct = (v: number | null): string => {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)}%`;
};

export const formatPrice = (v: number | null): string => {
  if (v === null) return "—";
  const decimals = v >= 1000 ? 0 : v >= 10 ? 2 : 4;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/** "2026-06-29" → "Jun 29" (UTC, deterministic, no locale timezone drift) */
export const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export const formatDaysSince = (n: number | null): string =>
  n === null ? "—" : `D+${n}`;

/* ── verdict grouping — recency-first ranked list → labeled sections ──
   Rows arrive already grouped by the engine (newly bullish first,
   then established bullish, conflicted daily, conflicted weekly,
   bearish, warm-up). This derives section boundaries by walking the
   ranked list once, so the UI can drop a separator between groups
   without re-sorting anything. */
export type RegimeGroupKey =
  | "newlyBullish"
  | "bullish"
  | "conflictDaily"
  | "conflictWeekly"
  | "bearish"
  | "warmup";

export const GROUP_LABEL: Record<RegimeGroupKey, string> = {
  newlyBullish: "Newly Bullish — aligned within 10 sessions",
  bullish: "Bullish — daily × weekly aligned",
  conflictDaily: "Conflicted — daily only",
  conflictWeekly: "Conflicted — weekly only",
  bearish: "Bearish — daily × weekly aligned",
  warmup: "Warm-up — insufficient history",
};

export function groupKeyFor(row: RegimeRow): RegimeGroupKey {
  if (row.verdict === "BULLISH") return row.newlyBullish ? "newlyBullish" : "bullish";
  if (row.verdict === "CONFLICT_DAILY") return "conflictDaily";
  if (row.verdict === "CONFLICT_WEEKLY") return "conflictWeekly";
  if (row.verdict === "BEARISH") return "bearish";
  return "warmup";
}

/** Walks the ranked rows once, tagging each with whether it starts a
 *  new visual group (its groupKey differs from the previous row's). */
export function withGroupBoundaries(
  rows: RegimeRow[]
): { row: RegimeRow; group: RegimeGroupKey; startsGroup: boolean }[] {
  let prev: RegimeGroupKey | null = null;
  return rows.map((row) => {
    const group = groupKeyFor(row);
    const startsGroup = group !== prev;
    prev = group;
    return { row, group, startsGroup };
  });
}

/* ── verdict distribution — compact "12 bullish · 5 conflicted · 13 bearish" ── */
export function verdictDistribution(rows: RegimeRow[]): {
  bullish: number;
  conflicted: number;
  bearish: number;
  warmup: number;
} {
  let bullish = 0, conflicted = 0, bearish = 0, warmup = 0;
  for (const r of rows) {
    if (r.verdict === "BULLISH") bullish++;
    else if (r.verdict === "CONFLICT_DAILY" || r.verdict === "CONFLICT_WEEKLY") conflicted++;
    else if (r.verdict === "BEARISH") bearish++;
    else warmup++;
  }
  return { bullish, conflicted, bearish, warmup };
}

export const formatDistribution = (rows: RegimeRow[]): string => {
  const d = verdictDistribution(rows);
  const parts = [`${d.bullish} bullish`, `${d.conflicted} conflicted`, `${d.bearish} bearish`];
  if (d.warmup > 0) parts.push(`${d.warmup} warm-up`);
  return parts.join(" · ");
};
