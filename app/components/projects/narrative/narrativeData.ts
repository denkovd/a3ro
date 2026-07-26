"use client";
/* ────────────────────────────────────────────────────────────────
   Narrative Rotation (Task 3) — client data layer.
   Combines three sources per PLAN-frontend-intelligence-modules.md:
     1. Curated narrative definitions — static JSON at
        /narratives/narratives.json (public/, so it's a plain GET,
        no backend route).
     2. Attention datapoints the user feeds — localStorage-backed,
        see narrativeStore.ts.
     3. Market corroboration — computed client-side from the same
        /api/bull/latest snapshot the Bull Market Finder reads
        (median RS63 + % bullish among the narrative's symbols).
   Same posture as bullData.ts/thesisData.ts: field-by-field
   normalisation, honest states, nothing modeled shown as live.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BullRow } from "../bull/bullData";
import {
  scoreNarratives,
  latestDateOf,
  type AttentionDatapoint,
  type NarrativeScore,
  type Window,
} from "./narrativeScoring";
import {
  loadDatapoints,
  saveDatapoints,
  mergeDatapoints,
  removeDatapoint,
  type StoredDatapoint,
} from "./narrativeStore";

/* ── palette: attention coral — distinct from bull steel-blue, macro
   periwinkle, regime mint, thesis cyan, gold tan, earnings violet ── */
export const NARR_ACCENT = "#e8896f";
export const NARR_MUTED_AMBER = "#b8a375"; // house neutral-warm
export const NARR_MUTED_PINK = "#a8496b"; // house losing/bearish

export const NARR_ROUTE = "/Projects/Narrative-Rotation";

export type NarrativeDef = {
  id: string;
  label: string;
  symbols: string[];
  keywords: string[];
  notes: string;
};

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function normalizeNarrativeDef(raw: unknown): NarrativeDef | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = isStr(o.id) ? o.id : null;
  const label = isStr(o.label) ? o.label : null;
  if (!id || !label) return null;
  return {
    id,
    label,
    symbols: strArr(o.symbols),
    keywords: strArr(o.keywords),
    notes: isStr(o.notes) ? o.notes : "",
  };
}

export type NarrativeDefsStatus = "loading" | "live" | "error";

export function useNarrativeDefs(): {
  status: NarrativeDefsStatus;
  defs: NarrativeDef[];
  errorMessage?: string;
} {
  const [state, setState] = useState<{ status: NarrativeDefsStatus; defs: NarrativeDef[]; errorMessage?: string }>({
    status: "loading",
    defs: [],
  });
  useEffect(() => {
    let alive = true;
    fetch("/narratives/narratives.json", { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) {
          setState({ status: "error", defs: [], errorMessage: `narratives feed responded ${res.status}` });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const raw = Array.isArray(body.narratives) ? body.narratives : [];
        const defs = raw.map(normalizeNarrativeDef).filter((d): d is NarrativeDef => d !== null);
        setState({ status: "live", defs });
      })
      .catch((err) => {
        if (!alive) return;
        setState({ status: "error", defs: [], errorMessage: err instanceof Error ? err.message : "network error" });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/* ── market corroboration ─────────────────────────────────────── */

export type Corroboration = {
  matchedCount: number;
  totalSymbols: number;
  medianRs63: number | null;
  pctBullish: number | null; // 0–100
};

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeCorroboration(bullRows: BullRow[], symbols: string[]): Corroboration {
  const set = new Set(symbols);
  const matched = bullRows.filter((r) => set.has(r.symbol));
  const rs63s = matched.map((r) => r.rs63).filter((v): v is number => v !== null);
  const bullish = matched.filter((r) => r.verdict === "BULLISH").length;
  return {
    matchedCount: matched.length,
    totalSymbols: symbols.length,
    medianRs63: median(rs63s),
    pctBullish: matched.length > 0 ? (bullish / matched.length) * 100 : null,
  };
}

/* ── combined board ────────────────────────────────────────────── */

export type NarrativeBoardRow = {
  def: NarrativeDef;
  scoreRow: NarrativeScore;
  corroboration: Corroboration;
  lastInputDate: string | null;
};

const EMPTY_CHIPS: Record<Window, number | null> = { "1d": null, "1w": null, "1m": null };

/** `bullRows`/`bullLive` come from the caller's own `useBullSnapshot()`
 *  (bullData.ts) — one fetch shared across every narrative card rather
 *  than one fetch per card. */
export function useNarrativeBoard(bullRows: BullRow[], bullLive: boolean) {
  const defsState = useNarrativeDefs();
  const [datapoints, setDatapoints] = useState<StoredDatapoint[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setDatapoints(loadDatapoints());
    setLoaded(true);
  }, []);

  const addDatapoints = useCallback((incoming: AttentionDatapoint[]) => {
    setDatapoints((prev) => {
      const merged = mergeDatapoints(prev, incoming);
      saveDatapoints(merged);
      return merged;
    });
  }, []);

  const deleteDatapoint = useCallback((id: string) => {
    setDatapoints((prev) => {
      const next = removeDatapoint(prev, id);
      saveDatapoints(next);
      return next;
    });
  }, []);

  const ids = useMemo(() => defsState.defs.map((d) => d.id), [defsState.defs]);
  const asOf = useMemo(() => latestDateOf(datapoints) ?? new Date().toISOString().slice(0, 10), [datapoints]);
  const scores = useMemo(() => scoreNarratives(ids, datapoints, asOf), [ids, datapoints, asOf]);

  const lastInputByNarrative = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of datapoints) {
      const prev = map.get(d.narrativeId);
      if (!prev || d.date > prev) map.set(d.narrativeId, d.date);
    }
    return map;
  }, [datapoints]);

  const rows: NarrativeBoardRow[] = defsState.defs.map((def) => ({
    def,
    scoreRow:
      scores[def.id] ??
      ({ narrativeId: def.id, inputCount: 0, status: "insufficient_data", score: null, chips: EMPTY_CHIPS, contributions: [], asOf } as NarrativeScore),
    corroboration: bullLive
      ? computeCorroboration(bullRows, def.symbols)
      : { matchedCount: 0, totalSymbols: def.symbols.length, medianRs63: null, pctBullish: null },
    lastInputDate: lastInputByNarrative.get(def.id) ?? null,
  }));

  return {
    status: defsState.status,
    errorMessage: defsState.errorMessage,
    loaded,
    rows,
    asOf,
    datapoints,
    addDatapoints,
    deleteDatapoint,
  };
}

/* ── display helpers ──────────────────────────────────────────── */

export const fmtScore = (v: number | null): string => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`);

export const fmtRs = (v: number | null): string => {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}%`;
};

export const fmtPctBullish = (v: number | null): string => (v === null ? "—" : `${Math.round(v)}%`);

export const scoreColor = (v: number | null): string =>
  v === null ? "var(--ink-3)" : v > 0.15 ? NARR_ACCENT : v < -0.15 ? NARR_MUTED_PINK : "var(--ink-2)";

export function daysSince(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const then = new Date(`${dateIso}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return null;
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

export const formatStaleness = (days: number | null): string => {
  if (days === null) return "no inputs yet";
  if (days === 0) return "updated today";
  if (days === 1) return "1 day stale";
  return `${days} days stale`;
};
