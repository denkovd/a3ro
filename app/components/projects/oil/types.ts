/* ────────────────────────────────────────────────────────────────
   Oil Tracker terminal — shared types for the intel rail.
   Client-safe: no backend value imports.
──────────────────────────────────────────────────────────────── */

import type { Benchmark, CorridorId } from "@a3ro/oil-backend";
import type { GateSignal, TierMove } from "./gateSignal";
import type { DailyPoint, WeeklyChange } from "./gateHistory";

export type CorridorStatus = "live" | "connecting" | "watchlist" | "stale";

export type FocusTarget =
  | { kind: "corridor"; id: string }
  | { kind: "benchmark"; id: Benchmark }
  | { kind: "refinery"; id: string }
  | { kind: "route"; id: string }
  | { kind: "gate"; id: CorridorId }
  | { kind: "producer"; id: string }
  | { kind: "company"; id: string };

export type BenchmarkRow = {
  id: Benchmark;
  title: string;
  price: number | null;
  /** Fraction change vs prior daily close (not necessarily day-over-day). */
  changePct: number | null;
  /** YYYY-MM-DD of the prior close used for changePct, when known. */
  changeVsDate: string | null;
  statusText: string;
  statusColor: string;
  suspect: boolean;
  observedAt: string | null;
  refreshFailed: boolean;
  basis: string;
};

export type CorridorWatchRow = {
  id: string;
  title: string;
  status: CorridorStatus;
  statusText: string;
  railMetric?: string;
  healthRatio?: number | null;
  rankScore: number;
};

/** One chokepoint in the "traffic vs norm" list — every gate appears exactly once. */
export type GateSignalRow = {
  id: CorridorId;
  title: string;
  /** Where selecting the row lands: a corridor hotspot panel, or the gate panel. */
  focus: FocusTarget;
  signal: GateSignal;
  /** This week against the week before, from the daily series. null until that history has loaded. */
  change: WeeklyChange | null;
  /** How the gate's tier moved against the week before; null when unchanged or unknown. */
  move: TierMove;
  /** Daily tanker transits for the detail chart. */
  history: { status: "loading" | "live" | "error"; points: DailyPoint[] };
};

export type OilIntelligence = {
  benchmarks: BenchmarkRow[];
  /** Corridors that are not chokepoint gates (exports, national activity, watchlist). */
  corridors: CorridorWatchRow[];
  /** The six PortWatch chokepoints, ranked: outside typical range first. */
  gates: GateSignalRow[];
  feedStatus: "loading" | "ready" | "error";
};

/** Static corridor index rows (map hotspots) — order is display fallback only;
    runtime ranking is by rankScore in useOilIntelligence. */
export type CorridorMeta = {
  id: string;
  title: string;
  /** Live-capable free-tier corridor (may still be connecting). */
  liveCapable: boolean;
  /** Has honest watchlist copy (no free live source). */
  watchlist: boolean;
  /** Gate corridor id for PortWatch baselines, when applicable. */
  gateCorridor?: "hormuz" | "singapore" | "usgulf";
};

export const CORRIDOR_META: CorridorMeta[] = [
  { id: "hormuz", title: "Strait of Hormuz", liveCapable: true, watchlist: false, gateCorridor: "hormuz" },
  { id: "sg", title: "Singapore Strait", liveCapable: true, watchlist: false, gateCorridor: "singapore" },
  { id: "usgc", title: "US Gulf Exports", liveCapable: true, watchlist: false, gateCorridor: "usgulf" },
  { id: "china", title: "China · Crude buying & refining", liveCapable: true, watchlist: false },
  { id: "ara", title: "ARA · Rotterdam", liveCapable: false, watchlist: true },
];

/** The six PortWatch chokepoints. Hormuz and Singapore open their corridor
    hotspot panel; the other four open the gate panel. */
export const GATE_META: { id: CorridorId; title: string; focus: FocusTarget }[] = [
  { id: "hormuz", title: "Strait of Hormuz", focus: { kind: "corridor", id: "hormuz" } },
  { id: "singapore", title: "Singapore Strait", focus: { kind: "corridor", id: "sg" } },
  { id: "suez", title: "Suez Canal", focus: { kind: "gate", id: "suez" } },
  { id: "bab_el_mandeb", title: "Bab el-Mandeb", focus: { kind: "gate", id: "bab_el_mandeb" } },
  { id: "cape", title: "Cape of Good Hope", focus: { kind: "gate", id: "cape" } },
  { id: "panama", title: "Panama Canal", focus: { kind: "gate", id: "panama" } },
];

/** Corridor hotspot ids whose traffic is reported in the gate list instead of the corridor list. */
export const GATE_HOTSPOT_IDS = new Set(["hormuz", "sg"]);

export const BENCH_TITLE: Record<Benchmark, string> = {
  WTI: "WTI Crude",
  BRENT: "Brent Crude",
};

/** Desktop intel rail width (px) — map stage pads by this amount. */
export const RAIL_WIDTH_PX = 380;
