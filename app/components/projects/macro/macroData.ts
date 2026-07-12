"use client";
/* ────────────────────────────────────────────────────────────────
   P·06 Regime Shift Finder + Macro Override — data layer.
   One endpoint (/api/oil/macro), one snapshot shape mirroring the
   backend's MacroSnapshotRow. Field-by-field normalisation: a partial
   or malformed payload degrades to an honest "awaiting first cycle"
   state (status), never a crash and never a modeled number shown as
   live (A3RO truth-pass rule). Shared by the P·06 card/page and the
   Macro Override chip in the oil tracker.
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

/** Normalise /api/oil/macro ({ macro: row | null } | { error }). */
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
  };
}

/** The module's single data entry point — SSR-safe loading, then
 *  live / pending / error. Never throws past this boundary. */
export function useMacroSnapshot(): MacroSnapshot {
  const [snap, setSnap] = useState<MacroSnapshot>(EMPTY);

  useEffect(() => {
    let alive = true;
    fetch("/api/oil/macro", { cache: "no-store" })
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
