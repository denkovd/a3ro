"use client";
/* ────────────────────────────────────────────────────────────────
   P·08 Bagholder Risk Map — data layer.
   One endpoint (/api/bagholder/triggers) for the board; two write
   endpoints (POST narratives, POST events) for hand-curation. Every
   normalizer degrades a partial/malformed payload to an honest empty
   state rather than throwing — same truth-pass rule as macroData.ts.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

/* ── palette: coral/rust — a trap/risk signal, distinct from macro
   periwinkle, regime mint, oil amber, BTC orange ── */
export const BH_ACCENT = "#e2665c";      // base module accent
export const BH_LIVE = "#ff5a4e";        // LIVE_TRIGGER — hottest
export const BH_FORMING = "#e2a13d";     // SETUP_FORMING
export const BH_WATCHLIST = "#8b9dab";   // WATCHLIST / no_trade
export const BH_INVALID = "#6b6f76";     // INVALIDATED / EXPIRED

export const ROUTE = "/Projects/Bagholder-Risk-Map";

export type CompositeBand = "no_trade" | "watchlist" | "setup_forming" | "live_trigger";
export type TriggerStateId = "WATCHLIST" | "SETUP_FORMING" | "LIVE_TRIGGER" | "INVALIDATED" | "EXPIRED";
export type TriggerTaxonomy =
  | "LATE_NARRATIVE_FADE" | "MOMENTUM_TRAP" | "FORCED_ROTATION" | "MINER_RERATING" | "STRUCTURAL_CYCLICAL_MISMATCH";
export type Timeframe = "INTRADAY" | "SWING" | "MULTI_WEEK";
export type TriggerDirection = "long" | "short" | "pair" | "basket" | "no_trade";

export interface ScoreComponentView {
  key: string;
  label: string;
  effect: number;
  detail: string;
}

export interface LayerScoreView {
  score: number;
  coverage: { available: number; total: number };
  components: ScoreComponentView[];
}

export interface CompositeView {
  raw: number;
  final: number;
  band: CompositeBand;
  confidenceMultiplier: number;
}

export interface NarrativeView {
  id: number;
  slug: string;
  headline: string;
  firstSeenAt: string;
  category: string;
  primaryDirection: "bullish" | "bearish" | "mixed";
  status: string;
}

export interface TriggerView {
  id: number;
  narrativeId: number;
  taxonomy: TriggerTaxonomy;
  state: TriggerStateId;
  direction: TriggerDirection | null;
  primarySymbol: string | null;
  timeframe: Timeframe;
  sustainCycles: number;
  enteredStateAt: string;
  updatedAt: string;
}

export interface BoardEntry {
  trigger: TriggerView;
  narrative: NarrativeView;
  latestSnapshot: {
    runDate: string;
    layers: {
      macro: LayerScoreView;
      narrative: LayerScoreView;
      positioning: LayerScoreView;
      opportunity: LayerScoreView;
      confidence: LayerScoreView;
    };
    composite: CompositeView;
    coverage: { available: number; total: number };
  } | null;
}

export type BoardStatus = "loading" | "live" | "empty" | "error";

export interface BagholderBoard {
  status: BoardStatus;
  entries: BoardEntry[];
  errorMessage?: string;
}

const EMPTY: BagholderBoard = { status: "loading", entries: [] };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

const BANDS: CompositeBand[] = ["no_trade", "watchlist", "setup_forming", "live_trigger"];
const STATES: TriggerStateId[] = ["WATCHLIST", "SETUP_FORMING", "LIVE_TRIGGER", "INVALIDATED", "EXPIRED"];

function normalizeComponents(raw: unknown): ScoreComponentView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      if (typeof o.key !== "string" || typeof o.label !== "string") return null;
      return { key: o.key, label: o.label, effect: num(o.effect), detail: str(o.detail) };
    })
    .filter((c): c is ScoreComponentView => c !== null);
}

function normalizeLayer(raw: unknown): LayerScoreView {
  const o = (raw ?? {}) as Record<string, unknown>;
  const cov = (o.coverage ?? {}) as Record<string, unknown>;
  return {
    score: num(o.score),
    coverage: { available: num(cov.available), total: num(cov.total) },
    components: normalizeComponents(o.components),
  };
}

function normalizeComposite(raw: unknown): CompositeView {
  const o = (raw ?? {}) as Record<string, unknown>;
  const band = BANDS.includes(o.band as CompositeBand) ? (o.band as CompositeBand) : "no_trade";
  return { raw: num(o.raw), final: num(o.final), band, confidenceMultiplier: num(o.confidenceMultiplier) };
}

function normalizeEntry(raw: unknown): BoardEntry | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const t = (o.trigger ?? {}) as Record<string, unknown>;
  const n = (o.narrative ?? {}) as Record<string, unknown>;
  if (typeof t.id !== "number" || typeof n.id !== "number") return null;

  const snap = o.latestSnapshot as Record<string, unknown> | null;
  const layers = (snap?.layers ?? {}) as Record<string, unknown>;

  return {
    trigger: {
      id: num(t.id),
      narrativeId: num(t.narrativeId),
      taxonomy: str(t.taxonomy) as TriggerTaxonomy,
      state: STATES.includes(t.state as TriggerStateId) ? (t.state as TriggerStateId) : "WATCHLIST",
      direction: (t.direction as TriggerDirection) ?? null,
      primarySymbol: typeof t.primarySymbol === "string" ? t.primarySymbol : null,
      timeframe: (str(t.timeframe, "SWING") as Timeframe),
      sustainCycles: num(t.sustainCycles),
      enteredStateAt: str(t.enteredStateAt),
      updatedAt: str(t.updatedAt),
    },
    narrative: {
      id: num(n.id),
      slug: str(n.slug),
      headline: str(n.headline, "Untitled narrative"),
      firstSeenAt: str(n.firstSeenAt),
      category: str(n.category, "CROSS_ASSET"),
      primaryDirection: (str(n.primaryDirection, "mixed") as NarrativeView["primaryDirection"]),
      status: str(n.status, "active"),
    },
    latestSnapshot: snap
      ? {
          runDate: str(snap.runDate),
          layers: {
            macro: normalizeLayer(layers.macro),
            narrative: normalizeLayer(layers.narrative),
            positioning: normalizeLayer(layers.positioning),
            opportunity: normalizeLayer(layers.opportunity),
            confidence: normalizeLayer(layers.confidence),
          },
          composite: normalizeComposite(snap.composite),
          coverage: { available: num((snap.coverage as Record<string, unknown> | undefined)?.available), total: num((snap.coverage as Record<string, unknown> | undefined)?.total) },
        }
      : null,
  };
}

export function normalizeBoard(raw: unknown): BagholderBoard {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof o.error === "string") return { status: "error", entries: [], errorMessage: o.error };
  if (!Array.isArray(o.board)) return { status: "pending" as BoardStatus, entries: [] };
  const entries = o.board.map(normalizeEntry).filter((e): e is BoardEntry => e !== null);
  return { status: entries.length > 0 ? "live" : "empty", entries };
}

const POLL_MS = 5 * 60 * 1000; // curator-driven data — daily cron cadence is the real refresh, this just catches manual cycle runs

export function useBagholderBoard(): BagholderBoard {
  const [board, setBoard] = useState<BagholderBoard>(EMPTY);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/bagholder/triggers", { cache: "no-store" })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!alive) return;
          if (!res.ok) {
            const err = (body as Record<string, unknown>)?.error;
            setBoard({ status: "error", entries: [], errorMessage: typeof err === "string" ? err : `bagholder api ${res.status}` });
            return;
          }
          setBoard(normalizeBoard(body));
        })
        .catch((err) => {
          if (!alive) return;
          setBoard({ status: "error", entries: [], errorMessage: err instanceof Error ? err.message : "network error" });
        });
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return board;
}

/* ── write helpers (curation form) ─────────────────────────────── */

export async function submitNarrative(payload: Record<string, unknown>): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const res = await fetch("/api/bagholder/narratives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

export async function submitEvent(narrativeId: number, payload: Record<string, unknown>): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const res = await fetch(`/api/bagholder/narratives/${narrativeId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

/* ── display helpers ───────────────────────────────────────────── */

export const BAND_META: Record<CompositeBand, { label: string; color: string }> = {
  no_trade: { label: "No trade", color: BH_WATCHLIST },
  watchlist: { label: "Watchlist", color: BH_WATCHLIST },
  setup_forming: { label: "Setup forming", color: BH_FORMING },
  live_trigger: { label: "Live trigger", color: BH_LIVE },
};

export const STATE_META: Record<TriggerStateId, { label: string; color: string }> = {
  WATCHLIST: { label: "Watchlist", color: BH_WATCHLIST },
  SETUP_FORMING: { label: "Setup forming", color: BH_FORMING },
  LIVE_TRIGGER: { label: "Live trigger", color: BH_LIVE },
  INVALIDATED: { label: "Invalidated", color: BH_INVALID },
  EXPIRED: { label: "Expired", color: BH_INVALID },
};

export const TAXONOMY_LABEL: Record<TriggerTaxonomy, string> = {
  LATE_NARRATIVE_FADE: "Late narrative fade",
  MOMENTUM_TRAP: "Momentum continuation trap",
  FORCED_ROTATION: "Forced rotation unwind",
  MINER_RERATING: "Miner/infra re-rating exhaustion",
  STRUCTURAL_CYCLICAL_MISMATCH: "Structural story, cyclical timing",
};

export const formatScore = (v: number): string => Math.round(v).toString();

export const formatDaysSince = (iso: string): string => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const days = Math.max(0, Math.round((Date.now() - t) / 86_400_000));
  return `${days}d`;
};

export const coveragePct = (c: { available: number; total: number }): number =>
  c.total > 0 ? Math.round((c.available / c.total) * 100) : 0;

export { numOrNull };
