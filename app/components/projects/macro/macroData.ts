"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 Regime Shift Finder — data layer.
   One endpoint (/api/macro/latest), one snapshot shape mirroring the
   backend's MacroSnapshotRow. Field-by-field normalisation: a partial
   or malformed payload degrades to an honest "awaiting first cycle"
   state (status), never a crash and never a modeled number shown as
   live (A3RO truth-pass rule).

   Carries three layers after the macro refresh
   (docs/regime-macro-refresh.md):
     · the bottom-up GRID quadrant (what the economy is doing)
     · the VAMS risk matrix (what the market is pricing) — kept in
       separate fields, never reconciled with the quadrant
     · the six cycles, now computed server-side rather than derived
       here from hard-coded per-quadrant defaults
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

/* ── palette: cool periwinkle — a macro/top-down signal, distinct from
   regime mint (#5fc9a4) and oil amber (#d4a157) ── */
export const MACRO_ACCENT = "#8b9dff";
export const MACRO_BRIGHT = "#b4c0ff";
export const MACRO_AMBER = "#d4a157"; // Macro Override amber (divergence / pressure)
export const MACRO_PINK = "#a8496b"; // deflation / risk-off, dimmed

export const ROUTE = "/Projects/Regime-Shift";

export type MacroQuadrant = "GOLDILOCKS" | "REFLATION" | "INFLATION" | "DEFLATION" | "PENDING";

export type MacroComponent = {
  key: string;
  label: string;
  value: number | null;
  normalized: number | null;
  note: string;
};

export type PositioningStance = "CROWDED_LONG" | "CROWDED_SHORT" | "NEUTRAL" | "PENDING";
export type PositioningRead = {
  reportDate: string | null;
  market: string;
  netLength: number | null;
  percentile1y: number | null; // 0..1
  stance: PositioningStance;
};

export type MacroStatus = "loading" | "live" | "pending" | "error";

/* ── liquidity / cost-of-capital layer ── */
export type LiquidityLeg = {
  key: string;
  label: string;
  value: number | null;
  normalized: number | null;
  note: string;
  source: "fred" | "yahoo" | "derived";
};

/* ── top-down layer: the regime the MARKET is pricing (VAMS) ──
   Kept as its own shape rather than folded into the quadrant, because
   the economy and the market are allowed to disagree and that
   disagreement is the interesting part. */
export type VamsState = "BULLISH" | "BEARISH" | "NEUTRAL" | "PENDING";
export type VamsRead = {
  symbol: string;
  displayName: string;
  state: VamsState;
  z: number | null;
  return63: number | null;
  confirms: string[];
};
export type RegimeShares = Partial<Record<Exclude<MacroQuadrant, "PENDING">, number>>;

/* ── the six cycles (growth, inflation, policy, profits, liquidity,
   positioning) — computed server-side now, not derived in the UI ── */
export type CycleScore = "TAILWIND" | "NEUTRAL" | "HEADWIND";
export type LiveCycleRead = {
  key: string;
  label: string;
  score: CycleScore;
  note: string;
  value: number | null;
  detail?: { label: string; value: number | null; note: string }[];
  source: "live" | "brief";
  asOf: string | null;
};

/* ── KISS allocation target ──
   Computed server-side in the macro cycle from the regime, the matrix
   and the six cycles, then persisted — so the page renders the same
   numbers the cycle derived rather than recomputing from a partial
   view of the inputs. */
export type SleeveKey = "stocks" | "gold" | "bitcoin";
export type SleeveWeight = {
  key: SleeveKey;
  weight: number;
  cap: number;
  regimeScore: number;
  vamsMultiplier: number;
  cycleDrag: number;
  state: VamsState;
  available: boolean;
};

export type MacroSnapshot = {
  status: MacroStatus;
  runDate: string | null;
  quadrant: MacroQuadrant;
  growthYoy: number | null;
  growthMomentum: number | null;
  inflationYoy: number | null;
  inflationMomentum: number | null;
  regimeHeadline: string;
  favored: string;
  regimeCoverage: number;
  pressureScore: number | null;
  pressureStatus: string;
  diverging: boolean;
  pressureHeadline: string;
  components: MacroComponent[];
  computedAt: string | null;
  positioning: PositioningRead | null;

  /* liquidity / cost of capital */
  liquidityScore: number | null;
  liquidityStatus: string;
  riskPremiumAlert: boolean;
  liquidityHeadline: string;
  liquidityLegs: LiquidityLeg[];
  nominalGdpYoy: number | null;
  nominalTrend0307: number | null;
  nominalTrend1519: number | null;
  nominalGap: number | null;
  globalBondSymbol: string | null;

  /* top-down market regime */
  marketRegime: MacroQuadrant;
  marketShares: RegimeShares;
  marketRiskOn: number | null;
  marketScored: number;
  marketUniverse: number;
  marketHeadline: string;
  vamsReads: VamsRead[];

  /* six cycles */
  cycles: LiveCycleRead[];
  cyclesTailwinds: number;
  cyclesHeadwinds: number;
  cyclesHeadline: string;

  /* allocation target */
  allocationRegime: MacroQuadrant;
  allocationRegimeSource: string;
  allocationInvested: number | null;
  allocationCash: number | null;
  allocationWeights: SleeveWeight[];

  errorMessage?: string;
};

const EMPTY: MacroSnapshot = {
  status: "loading",
  runDate: null,
  quadrant: "PENDING",
  growthYoy: null,
  growthMomentum: null,
  inflationYoy: null,
  inflationMomentum: null,
  regimeHeadline: "",
  favored: "",
  regimeCoverage: 0,
  pressureScore: null,
  pressureStatus: "insufficient",
  diverging: false,
  pressureHeadline: "",
  components: [],
  computedAt: null,
  positioning: null,

  liquidityScore: null,
  liquidityStatus: "insufficient",
  riskPremiumAlert: false,
  liquidityHeadline: "",
  liquidityLegs: [],
  nominalGdpYoy: null,
  nominalTrend0307: null,
  nominalTrend1519: null,
  nominalGap: null,
  globalBondSymbol: null,

  marketRegime: "PENDING",
  marketShares: {},
  marketRiskOn: null,
  marketScored: 0,
  marketUniverse: 0,
  marketHeadline: "",
  vamsReads: [],

  cycles: [],
  cyclesTailwinds: 0,
  cyclesHeadwinds: 0,
  cyclesHeadline: "",

  allocationRegime: "PENDING",
  allocationRegimeSource: "none",
  allocationInvested: null,
  allocationCash: null,
  allocationWeights: [],
};

const STANCES: PositioningStance[] = ["CROWDED_LONG", "CROWDED_SHORT", "NEUTRAL", "PENDING"];
function normalizePositioning(raw: unknown): PositioningRead | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const stance = STANCES.includes(p.stance as PositioningStance) ? (p.stance as PositioningStance) : "PENDING";
  return {
    reportDate: typeof p.reportDate === "string" ? p.reportDate : null,
    market: typeof p.market === "string" ? p.market : "WTI",
    netLength: typeof p.netLength === "number" && Number.isFinite(p.netLength) ? p.netLength : null,
    percentile1y: typeof p.percentile1y === "number" && Number.isFinite(p.percentile1y) ? p.percentile1y : null,
    stance,
  };
}

/* ── normalisers: any payload → safe values, never throw ── */
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const bool = (v: unknown): boolean => v === true;

const QUADRANTS: MacroQuadrant[] = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION", "PENDING"];
const toQuadrant = (v: unknown): MacroQuadrant =>
  QUADRANTS.includes(v as MacroQuadrant) ? (v as MacroQuadrant) : "PENDING";

function normalizeComponent(raw: unknown): MacroComponent | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const key = str(o.key);
  const label = str(o.label);
  if (!key || !label) return null;
  return { key, label, value: num(o.value), normalized: num(o.normalized), note: str(o.note) ?? "" };
}

const LEG_SOURCES: LiquidityLeg["source"][] = ["fred", "yahoo", "derived"];
function normalizeLeg(raw: unknown): LiquidityLeg | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const key = str(o.key);
  const label = str(o.label);
  if (!key || !label) return null;
  return {
    key,
    label,
    value: num(o.value),
    normalized: num(o.normalized),
    note: str(o.note) ?? "",
    source: LEG_SOURCES.includes(o.source as LiquidityLeg["source"])
      ? (o.source as LiquidityLeg["source"])
      : "derived",
  };
}

const VAMS_STATES: VamsState[] = ["BULLISH", "BEARISH", "NEUTRAL", "PENDING"];
function normalizeVams(raw: unknown): VamsRead | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const symbol = str(o.symbol);
  if (!symbol) return null;
  return {
    symbol,
    displayName: str(o.displayName) ?? symbol,
    state: VAMS_STATES.includes(o.state as VamsState) ? (o.state as VamsState) : "PENDING",
    z: num(o.z),
    return63: num(o.return63),
    confirms: Array.isArray(o.confirms) ? o.confirms.filter((c): c is string => typeof c === "string") : [],
  };
}

const CYCLE_SCORES: CycleScore[] = ["TAILWIND", "NEUTRAL", "HEADWIND"];
function normalizeCycle(raw: unknown): LiveCycleRead | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const key = str(o.key);
  const label = str(o.label);
  if (!key || !label) return null;
  return {
    key,
    label,
    score: CYCLE_SCORES.includes(o.score as CycleScore) ? (o.score as CycleScore) : "NEUTRAL",
    note: str(o.note) ?? "",
    value: num(o.value),
    detail: Array.isArray(o.detail)
      ? o.detail.map((d) => {
          const dd = (d ?? {}) as Record<string, unknown>;
          return { label: str(dd.label) ?? "", value: num(dd.value), note: str(dd.note) ?? "" };
        })
      : undefined,
    source: o.source === "live" ? "live" : "brief",
    asOf: str(o.asOf),
  };
}

const SLEEVE_KEYS: SleeveKey[] = ["stocks", "gold", "bitcoin"];
function normalizeSleeve(raw: unknown): SleeveWeight | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!SLEEVE_KEYS.includes(o.key as SleeveKey)) return null;
  // A weight that isn't a finite number is dropped entirely rather
  // than coerced to 0 — a missing sleeve is visible, a silent zero
  // reads as a deliberate "hold nothing".
  const weight = num(o.weight);
  if (weight === null) return null;
  return {
    key: o.key as SleeveKey,
    weight,
    cap: num(o.cap) ?? 0,
    regimeScore: num(o.regimeScore) ?? 0,
    vamsMultiplier: num(o.vamsMultiplier) ?? 0,
    cycleDrag: num(o.cycleDrag) ?? 1,
    state: VAMS_STATES.includes(o.state as VamsState) ? (o.state as VamsState) : "PENDING",
    available: o.available !== false,
  };
}

/** Regime shares arrive as a jsonb object; drop anything that isn't a
 *  finite number so a malformed payload can't render a bar chart of
 *  NaNs. */
function normalizeShares(raw: unknown): RegimeShares {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: RegimeShares = {};
  for (const q of ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"] as const) {
    const v = num(o[q]);
    if (v !== null) out[q] = v;
  }
  return out;
}

/** Normalise the macro payload ({ macro: row | null, positioning } |
 *  { error }). Shape is shared by /api/macro/latest and the legacy
 *  /api/oil/macro, so either can back this hook. */
export function normalizeMacro(raw: unknown): MacroSnapshot {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof o.error === "string") {
    return { ...EMPTY, status: "error", errorMessage: o.error };
  }
  const m = (o.macro ?? null) as Record<string, unknown> | null;
  if (!m || typeof m !== "object") {
    return { ...EMPTY, status: "pending", positioning: normalizePositioning(o.positioning) };
  }
  const components = Array.isArray(m.components)
    ? m.components.map(normalizeComponent).filter((c): c is MacroComponent => c !== null)
    : [];
  return {
    status: "live",
    runDate: str(m.runDate),
    quadrant: toQuadrant(m.quadrant),
    growthYoy: num(m.growthYoy),
    growthMomentum: num(m.growthMomentum),
    inflationYoy: num(m.inflationYoy),
    inflationMomentum: num(m.inflationMomentum),
    regimeHeadline: str(m.regimeHeadline) ?? "",
    favored: str(m.favored) ?? "",
    regimeCoverage: num(m.regimeCoverage) ?? 0,
    pressureScore: num(m.pressureScore),
    pressureStatus: str(m.pressureStatus) ?? "insufficient",
    diverging: bool(m.diverging),
    pressureHeadline: str(m.pressureHeadline) ?? "",
    components,
    computedAt: str(m.computedAt),
    positioning: normalizePositioning(o.positioning),

    liquidityScore: num(m.liquidityScore),
    liquidityStatus: str(m.liquidityStatus) ?? "insufficient",
    riskPremiumAlert: bool(m.riskPremiumAlert),
    liquidityHeadline: str(m.liquidityHeadline) ?? "",
    liquidityLegs: Array.isArray(m.liquidityLegs)
      ? m.liquidityLegs.map(normalizeLeg).filter((l): l is LiquidityLeg => l !== null)
      : [],
    nominalGdpYoy: num(m.nominalGdpYoy),
    nominalTrend0307: num(m.nominalTrend0307),
    nominalTrend1519: num(m.nominalTrend1519),
    nominalGap: num(m.nominalGap),
    globalBondSymbol:
      m.globalBonds && typeof m.globalBonds === "object"
        ? str((m.globalBonds as Record<string, unknown>).symbol)
        : null,

    marketRegime: toQuadrant(m.marketRegime),
    marketShares: normalizeShares(m.marketShares),
    marketRiskOn: num(m.marketRiskOn),
    marketScored: num(m.marketScored) ?? 0,
    marketUniverse: num(m.marketUniverse) ?? 0,
    marketHeadline: str(m.marketHeadline) ?? "",
    vamsReads: Array.isArray(m.vamsReads)
      ? m.vamsReads.map(normalizeVams).filter((v): v is VamsRead => v !== null)
      : [],

    cycles: Array.isArray(m.cycles)
      ? m.cycles.map(normalizeCycle).filter((c): c is LiveCycleRead => c !== null)
      : [],
    cyclesTailwinds: num(m.cyclesTailwinds) ?? 0,
    cyclesHeadwinds: num(m.cyclesHeadwinds) ?? 0,
    cyclesHeadline: str(m.cyclesHeadline) ?? "",

    allocationRegime: toQuadrant(m.allocationRegime),
    allocationRegimeSource: str(m.allocationRegimeSource) ?? "none",
    allocationInvested: num(m.allocationInvested),
    allocationCash: num(m.allocationCash),
    allocationWeights: Array.isArray(m.allocationWeights)
      ? m.allocationWeights.map(normalizeSleeve).filter((s): s is SleeveWeight => s !== null)
      : [],
  };
}

/** The module's single data entry point — SSR-safe loading, then
 *  live / pending / error. Never throws past this boundary.
 *
 *  Reads the asset-neutral /api/macro/latest. The oil route still
 *  exists and still serves the Oil Tracker's Macro Override chip off
 *  the same row — a macro page just shouldn't be reading an oil
 *  namespace to find out what the market is pricing. */
export function useMacroSnapshot(): MacroSnapshot {
  const [snap, setSnap] = useState<MacroSnapshot>(EMPTY);

  useEffect(() => {
    let alive = true;
    fetch("/api/macro/latest", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          const err = (body as Record<string, unknown>)?.error;
          setSnap({ ...EMPTY, status: "error", errorMessage: typeof err === "string" ? err : `macro api ${res.status}` });
          return;
        }
        setSnap(normalizeMacro(body));
      })
      .catch((err) => {
        if (!alive) return;
        setSnap({ ...EMPTY, status: "error", errorMessage: err instanceof Error ? err.message : "network error" });
      });
    return () => {
      alive = false;
    };
  }, []);

  return snap;
}

/* ── quadrant display metadata — positions on a 2×2 GRID dial.
   x = inflation (left decel → right accel), y = growth (top accel →
   bottom decel). ── */
export const QUADRANT_META: Record<
  Exclude<MacroQuadrant, "PENDING">,
  { label: string; col: 0 | 1; row: 0 | 1; color: string; short: string }
> = {
  GOLDILOCKS: { label: "Goldilocks", short: "growth↑ · inflation↓", col: 0, row: 0, color: MACRO_BRIGHT },
  REFLATION: { label: "Reflation", short: "growth↑ · inflation↑", col: 1, row: 0, color: MACRO_ACCENT },
  INFLATION: { label: "Inflation", short: "growth↓ · inflation↑", col: 1, row: 1, color: MACRO_AMBER },
  DEFLATION: { label: "Deflation", short: "growth↓ · inflation↓", col: 0, row: 1, color: MACRO_PINK },
};

/* ── display helpers (deterministic, no locale drift) ── */
export const formatPct = (v: number | null, dp = 1): string => {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(dp)}%`;
};

export const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${M[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** Accel/decel arrow for an axis momentum. */
export const trendArrow = (momentum: number | null): string =>
  momentum === null ? "·" : momentum >= 0 ? "▲" : "▼";
