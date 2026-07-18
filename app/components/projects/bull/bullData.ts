"use client";
/* ────────────────────────────────────────────────────────────────
   Bull Market Finder (Module 5) — data layer
   Same posture as regime/regimeData.ts: field-by-field
   normalisation, honest states (loading / live / pending / error),
   no modeled numbers. Two endpoints: /api/bull/latest (ranked
   snapshot, ~650 assets in five tiers) and /api/bull/transitions
   (what changed verdict recently).

   Display naming lives HERE, per the module spec:
     BULLISH          → Double Confirmed
     CONFLICT_DAILY   → Conflicted Early Bullish  (daily only)
     CONFLICT_WEEKLY  → Conflicted Lagging Bullish (weekly only)
   The wire enums are shared with Module 4 and never change.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

/* ── palette: signal cobalt — distinct from oil amber, gold,
   BTC orange and regime mint; reads as "screened / verified" ── */
export const BULL_ACCENT = "#7f9ee8";
export const BULL_BRIGHT = "#a8bff0";
export const BULL_MUTED_AMBER = "#b8a375"; // conflicted
export const BULL_MUTED_PINK = "#a8496b"; // bearish

export const BULL_ROUTE = "/Projects/Bull-Market-Finder";

export type BullTier = "macro" | "us_large" | "ndx_extra" | "crypto" | "etf";

export type BullVerdict =
  | "BULLISH"
  | "CONFLICT_DAILY"
  | "CONFLICT_WEEKLY"
  | "BEARISH"
  | "WARMUP";

/* ── strategy layer (unified-module §1) ────────────────────────
   "multi" = daily×weekly double confirmation (today's behaviour);
   "daily"/"weekly" = single-leg lenses — conflicts cannot occur,
   verdict collapses to BULLISH/BEARISH/WARMUP for that one leg. */
export type StrategyTimeframe = "multi" | "daily" | "weekly";

export type StrategyMeta = {
  id: string;
  label: string;
  timeframe: StrategyTimeframe;
};

/** Registry-order fallback so the switcher renders correctly before
 *  the first response arrives (and if a response ever omits the
 *  list). Mirrors backend/src/bull/strategies.ts STRATEGIES. */
export const DEFAULT_STRATEGY_ID = "ml-dw";
export const DEFAULT_STRATEGIES: StrategyMeta[] = [
  { id: "ml-dw", label: "Money Line D×W", timeframe: "multi" },
  { id: "ml-weekly", label: "Weekly", timeframe: "weekly" },
  { id: "ml-daily", label: "Daily", timeframe: "daily" },
];

/** How ALL lenses read this symbol on this run (conflicts/warm-up
 *  count as neutral). The consensus "merge dividend" — spec §1. */
export type BullConsensus = {
  bull: number;
  bear: number;
  neutral: number;
  of: number;
};

const EMPTY_CONSENSUS: BullConsensus = { bull: 0, bear: 0, neutral: 0, of: 0 };

export type BullRow = {
  runDate: string;
  symbol: string;
  displayName: string;
  tier: BullTier;
  assetClass: string;
  verdict: BullVerdict;
  rank: number;
  newlyBullish: boolean;
  /** Raw per-leg Money Line direction (1 / -1 / 0) — both legs are
   *  always computed; single-leg lenses use these for honest glyphs
   *  on the leg they don't rank on. Null on pre-merge payloads. */
  dailyTrend: number | null;
  weeklyTrend: number | null;
  dailyFlipDate: string | null;
  weeklyFlipDate: string | null;
  dailySinceFlipPct: number | null;
  dailyCushionPct: number | null;
  daysSinceAligned: number | null;
  alignedSince: string | null;
  strength: number | null;
  atrPct: number | null;
  strengthVol: number | null;
  rs63: number | null;
  adjusted: boolean;
  lastClose: number | null;
  lastCloseDate: string | null;
  consensus: BullConsensus;
};

export type BullStatus = "loading" | "live" | "pending" | "error";

export type BullSnapshotState = {
  status: BullStatus;
  runDate: string | null;
  count: number;
  rows: BullRow[];
  strategy: string;
  strategies: StrategyMeta[];
  errorMessage?: string;
};

const EMPTY: BullSnapshotState = {
  status: "loading",
  runDate: null,
  count: 0,
  rows: [],
  strategy: DEFAULT_STRATEGY_ID,
  strategies: DEFAULT_STRATEGIES,
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const bool = (v: unknown): boolean => v === true;

const TIERS: BullTier[] = ["macro", "us_large", "ndx_extra", "crypto", "etf"];
const toTier = (v: unknown): BullTier =>
  TIERS.includes(v as BullTier) ? (v as BullTier) : "macro";

const VERDICTS: BullVerdict[] = [
  "BULLISH", "CONFLICT_DAILY", "CONFLICT_WEEKLY", "BEARISH", "WARMUP",
];
const toVerdict = (v: unknown): BullVerdict =>
  VERDICTS.includes(v as BullVerdict) ? (v as BullVerdict) : "WARMUP";

const TIMEFRAMES: StrategyTimeframe[] = ["multi", "daily", "weekly"];
const toTimeframe = (v: unknown): StrategyTimeframe =>
  TIMEFRAMES.includes(v as StrategyTimeframe) ? (v as StrategyTimeframe) : "multi";

function normalizeConsensus(raw: unknown): BullConsensus {
  const o = (raw ?? {}) as Record<string, unknown>;
  const bull = num(o.bull);
  const bear = num(o.bear);
  const neutral = num(o.neutral);
  const of = num(o.of);
  if (bull === null && bear === null && neutral === null && of === null) return EMPTY_CONSENSUS;
  return { bull: bull ?? 0, bear: bear ?? 0, neutral: neutral ?? 0, of: of ?? 0 };
}

function normalizeStrategyMeta(raw: unknown): StrategyMeta | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = str(o.id);
  const label = str(o.label);
  if (!id || !label) return null;
  return { id, label, timeframe: toTimeframe(o.timeframe) };
}

function normalizeStrategies(raw: unknown): StrategyMeta[] {
  if (!Array.isArray(raw)) return DEFAULT_STRATEGIES;
  const list = raw
    .map(normalizeStrategyMeta)
    .filter((s): s is StrategyMeta => s !== null);
  return list.length > 0 ? list : DEFAULT_STRATEGIES;
}

function normalizeRow(raw: unknown, i: number): BullRow | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const symbol = str(o.symbol);
  const displayName = str(o.displayName);
  if (!symbol || !displayName) return null;
  return {
    runDate: str(o.runDate) ?? "",
    symbol,
    displayName,
    tier: toTier(o.tier),
    assetClass: str(o.assetClass) ?? "equity",
    verdict: toVerdict(o.verdict),
    rank: num(o.rank) ?? i + 1,
    newlyBullish: bool(o.newlyBullish),
    dailyTrend: num(o.dailyTrend),
    weeklyTrend: num(o.weeklyTrend),
    dailyFlipDate: str(o.dailyFlipDate),
    weeklyFlipDate: str(o.weeklyFlipDate),
    dailySinceFlipPct: num(o.dailySinceFlipPct),
    dailyCushionPct: num(o.dailyCushionPct),
    daysSinceAligned: num(o.daysSinceAligned),
    alignedSince: str(o.alignedSince),
    strength: num(o.strength),
    atrPct: num(o.atrPct),
    strengthVol: num(o.strengthVol),
    rs63: num(o.rs63),
    adjusted: bool(o.adjusted),
    lastClose: num(o.lastClose),
    lastCloseDate: str(o.lastCloseDate),
    consensus: normalizeConsensus(o.consensus),
  };
}

export function normalizeBullSnapshot(raw: unknown): BullSnapshotState {
  const o = (raw ?? {}) as Record<string, unknown>;
  const strategy = str(o.strategy) ?? DEFAULT_STRATEGY_ID;
  const strategies = normalizeStrategies(o.strategies);
  if (typeof o.error === "string") {
    return {
      status: "error", runDate: null, count: 0, rows: [],
      strategy, strategies, errorMessage: o.error,
    };
  }
  const rawRows = Array.isArray(o.rows) ? o.rows : [];
  const rows = rawRows
    .map((r, i) => normalizeRow(r, i))
    .filter((r): r is BullRow => r !== null)
    .sort((a, b) => a.rank - b.rank);
  if (rows.length === 0) {
    return { status: "pending", runDate: str(o.runDate), count: 0, rows: [], strategy, strategies };
  }
  return {
    status: "live",
    runDate: str(o.runDate) ?? rows[0].runDate,
    count: typeof o.count === "number" ? o.count : rows.length,
    rows,
    strategy,
    strategies,
  };
}

/** Single fetch of the full ranked universe; tier filtering happens
 *  client-side (≈650 rows — trivial) so tab switches are instant.
 *  `strategy` (default ml-dw) is passed through as ?strategy= — the
 *  server ranking is authoritative, same posture as the tier filter
 *  used to have. Switching strategy resets to "loading" so the
 *  skeleton shows instead of stale rows from the previous lens. */
export function useBullSnapshot(strategy: string = DEFAULT_STRATEGY_ID): BullSnapshotState {
  const [snap, setSnap] = useState<BullSnapshotState>(EMPTY);
  useEffect(() => {
    let alive = true;
    setSnap((prev) => ({
      status: "loading", runDate: null, count: 0, rows: [],
      strategy, strategies: prev.strategies,
    }));
    fetch(`/api/bull/latest?strategy=${encodeURIComponent(strategy)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setSnap({
            status: "error", runDate: null, count: 0, rows: [],
            strategy, strategies: DEFAULT_STRATEGIES,
            errorMessage:
              typeof (body as Record<string, unknown>)?.error === "string"
                ? ((body as Record<string, unknown>).error as string)
                : `bull api responded ${res.status}`,
          });
          return;
        }
        setSnap(normalizeBullSnapshot(body));
      })
      .catch((err) => {
        if (!alive) return;
        setSnap({
          status: "error", runDate: null, count: 0, rows: [],
          strategy, strategies: DEFAULT_STRATEGIES,
          errorMessage: err instanceof Error ? err.message : "network error",
        });
      });
    return () => { alive = false; };
  }, [strategy]);
  return snap;
}

/* ── transitions feed ─────────────────────────────────────────── */

export type BullTransitionRow = {
  runDate: string;
  symbol: string;
  displayName: string;
  tier: BullTier;
  fromVerdict: BullVerdict | null;
  toVerdict: BullVerdict;
};

export function useBullTransitions(
  days = 14,
  strategy: string = DEFAULT_STRATEGY_ID,
): {
  status: BullStatus;
  rows: BullTransitionRow[];
} {
  const [state, setState] = useState<{ status: BullStatus; rows: BullTransitionRow[] }>({
    status: "loading", rows: [],
  });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading", rows: [] });
    fetch(
      `/api/bull/transitions?days=${days}&strategy=${encodeURIComponent(strategy)}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!alive) return;
        if (!res.ok) { setState({ status: "error", rows: [] }); return; }
        const rawRows = Array.isArray(body.rows) ? body.rows : [];
        const rows = rawRows
          .map((r): BullTransitionRow | null => {
            const o = (r ?? {}) as Record<string, unknown>;
            const symbol = str(o.symbol);
            const displayName = str(o.displayName);
            const toV = str(o.toVerdict);
            if (!symbol || !displayName || !toV) return null;
            return {
              runDate: str(o.runDate) ?? "",
              symbol,
              displayName,
              tier: toTier(o.tier),
              fromVerdict: o.fromVerdict == null ? null : toVerdict(o.fromVerdict),
              toVerdict: toVerdict(toV),
            };
          })
          .filter((r): r is BullTransitionRow => r !== null);
        setState({ status: rows.length > 0 ? "live" : "pending", rows });
      })
      .catch(() => { if (alive) setState({ status: "error", rows: [] }); });
    return () => { alive = false; };
  }, [days, strategy]);
  return state;
}

/* ── verdict display metadata — the module-spec names ─────────── */

export const BULL_VERDICT_META: Record<
  BullVerdict,
  { label: string; short: string; color: string }
> = {
  BULLISH: {
    label: "Double Confirmed — bullish daily + weekly",
    short: "DOUBLE", color: BULL_ACCENT,
  },
  CONFLICT_DAILY: {
    label: "Conflicted Early Bullish — daily only",
    short: "EARLY", color: BULL_MUTED_AMBER,
  },
  CONFLICT_WEEKLY: {
    label: "Conflicted Lagging Bullish — weekly only",
    short: "LAGGING", color: BULL_MUTED_AMBER,
  },
  BEARISH: {
    label: "Bearish — bearish daily + weekly",
    short: "BEARISH", color: BULL_MUTED_PINK,
  },
  WARMUP: {
    label: "Warm-up — insufficient history",
    short: "WARMUP", color: "var(--ink-3)",
  },
};

/** State-column label for a single-leg strategy (daily/weekly) — the
 *  D×W grammar (Double Confirmed / Conflicted …) doesn't apply since
 *  conflicts can't exist with one leg. `timeframe: "multi"` keeps
 *  today's BULL_VERDICT_META short label unchanged. */
export function bullStateLabel(verdict: BullVerdict, timeframe: StrategyTimeframe): string {
  if (timeframe === "multi") return BULL_VERDICT_META[verdict].short;
  const leg = timeframe === "weekly" ? "W" : "D";
  if (verdict === "BULLISH") return `BULL · ${leg}`;
  if (verdict === "BEARISH") return `BEAR · ${leg}`;
  return "WARMUP";
}

/** Consensus chip color — spec §1/§4: all-bull reads as agreement,
 *  any bull+bear split as active disagreement, majority-bear as a
 *  bearish read, everything else (all-neutral, mixed-without-bear)
 *  as neutral ink. */
export function bullConsensusColor(c: BullConsensus): string {
  if (c.of > 0 && c.bull === c.of) return BULL_ACCENT;
  if (c.bull > 0 && c.bear > 0) return BULL_MUTED_AMBER;
  if (c.bear > c.bull) return BULL_MUTED_PINK;
  return "var(--ink-2)";
}

export const formatConsensus = (c: BullConsensus): string =>
  c.of > 0 ? `${c.bull}/${c.of}` : "—";

export const TIER_LABEL: Record<BullTier, string> = {
  macro: "Macro 30",
  us_large: "US 500",
  ndx_extra: "NDX+",
  crypto: "Crypto",
  etf: "ETFs",
};

export const TIER_ORDER: BullTier[] = ["macro", "us_large", "ndx_extra", "crypto", "etf"];

/* ── grouping + distribution (ranked list → labeled sections) ── */

export type BullGroupKey =
  | "newlyBullish" | "double" | "early" | "lagging" | "bearish" | "warmup";

export const BULL_GROUP_LABEL: Record<BullGroupKey, string> = {
  newlyBullish: "Newly Bullish — double confirmation within 10 sessions",
  double: "Double Confirmed — bullish on daily and weekly",
  early: "Conflicted Early Bullish — daily has flipped, weekly hasn't",
  lagging: "Conflicted Lagging Bullish — weekly bull, daily has broken",
  bearish: "Bearish — daily × weekly aligned down",
  warmup: "Warm-up — insufficient history",
};

/** Per-timeframe group label overrides for single-leg strategies —
 *  "early"/"lagging" never occur there (no conflicts possible) so
 *  only newlyBullish/double/bearish/warmup need lens-specific text;
 *  "multi" uses BULL_GROUP_LABEL unchanged. */
const BULL_GROUP_LABEL_BY_TIMEFRAME: Record<
  Exclude<StrategyTimeframe, "multi">,
  Partial<Record<BullGroupKey, string>>
> = {
  weekly: {
    newlyBullish: "Newly Bullish — weekly close confirmed within 2 weeks",
    double: "Bullish — confirmed on weekly closes",
    bearish: "Bearish — weekly close confirmed down",
    warmup: "Warm-up — insufficient weekly history",
  },
  daily: {
    newlyBullish: "Newly Bullish — daily close confirmed within 10 sessions",
    double: "Bullish — confirmed on daily closes",
    bearish: "Bearish — daily close confirmed down",
    warmup: "Warm-up — insufficient daily history",
  },
};

export function bullGroupLabelFor(group: BullGroupKey, timeframe: StrategyTimeframe): string {
  if (timeframe === "multi") return BULL_GROUP_LABEL[group];
  return BULL_GROUP_LABEL_BY_TIMEFRAME[timeframe][group] ?? BULL_GROUP_LABEL[group];
}

export function bullGroupKeyFor(row: BullRow): BullGroupKey {
  if (row.verdict === "BULLISH") return row.newlyBullish ? "newlyBullish" : "double";
  if (row.verdict === "CONFLICT_DAILY") return "early";
  if (row.verdict === "CONFLICT_WEEKLY") return "lagging";
  if (row.verdict === "BEARISH") return "bearish";
  return "warmup";
}

export function withBullGroupBoundaries(
  rows: BullRow[],
): { row: BullRow; group: BullGroupKey; startsGroup: boolean }[] {
  let prev: BullGroupKey | null = null;
  return rows.map((row) => {
    const group = bullGroupKeyFor(row);
    const startsGroup = group !== prev;
    prev = group;
    return { row, group, startsGroup };
  });
}

export function bullDistribution(rows: BullRow[]): {
  double: number; early: number; lagging: number; bearish: number; warmup: number;
} {
  let double = 0, early = 0, lagging = 0, bearish = 0, warmup = 0;
  for (const r of rows) {
    if (r.verdict === "BULLISH") double++;
    else if (r.verdict === "CONFLICT_DAILY") early++;
    else if (r.verdict === "CONFLICT_WEEKLY") lagging++;
    else if (r.verdict === "BEARISH") bearish++;
    else warmup++;
  }
  return { double, early, lagging, bearish, warmup };
}

/* ── display helpers (deterministic across server/client) ─────── */

export const formatPct = (v: number | null): string => {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)}%`;
};

export const formatX = (v: number | null): string =>
  v === null ? "—" : `${v.toFixed(1)}×`;

export const formatPrice = (v: number | null): string => {
  if (v === null) return "—";
  const decimals = v >= 1000 ? 0 : v >= 10 ? 2 : 4;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export const formatDaysSince = (n: number | null): string =>
  n === null ? "—" : `D+${n}`;
