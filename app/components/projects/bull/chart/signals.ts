"use client";
/* ────────────────────────────────────────────────────────────────
   Bull chart — frontend side of the signal contract.
   Mirrors backend/src/bull/chartSignals.ts (ChartSignal). Field-by-
   field normalisation like the rest of the module: anything malformed
   is dropped rather than drawn wrong. Plus the fetch hook.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import { fetchMarketSnapshot } from "../../marketFetch";

export type SignalTone = "bull" | "bear" | "neutral" | "accent";
export type LineStyleName = "solid" | "dashed" | "dotted";

export type ChartBar = { time: string; open: number; high: number; low: number; close: number };
export type SignalPoint = { time: string; value: number; tone?: SignalTone; color?: string };

type Base = { id: string; label: string; group: string; hidden: boolean };

export type ChartSignal =
  | (Base & { kind: "line" | "step"; pane: number; points: SignalPoint[]; width: 1 | 2 | 3; style: LineStyleName })
  | (Base & {
      kind: "markers";
      points: {
        time: string;
        position: "above" | "below";
        shape: "up" | "down" | "dot" | "square";
        tone?: SignalTone;
        color?: string;
        text?: string;
      }[];
    })
  | (Base & { kind: "level"; value: number; tone?: SignalTone; color?: string; style: LineStyleName })
  | (Base & { kind: "band"; pane: number; upper: SignalPoint[]; lower: SignalPoint[]; tone?: SignalTone })
  | (Base & { kind: "histogram"; pane: number; points: SignalPoint[] });

export const CHART_RANGES = ["3m", "6m", "1y", "2y", "5y", "max"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export type BullChartState = {
  status: "loading" | "live" | "empty" | "error";
  bars: ChartBar[];
  signals: ChartSignal[];
  runDate: string | null;
  errorMessage?: string;
};

/* ── normalisation ── */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const date = (v: unknown): string | null => (typeof v === "string" && DATE.test(v) ? v : null);
const TONES: SignalTone[] = ["bull", "bear", "neutral", "accent"];
const tone = (v: unknown): SignalTone | undefined => (TONES.includes(v as SignalTone) ? (v as SignalTone) : undefined);
const style = (v: unknown): LineStyleName => (v === "dashed" || v === "dotted" ? v : "solid");
const CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
const color = (v: unknown): string | undefined => (typeof v === "string" && CSS_COLOR.test(v) ? v : undefined);

function bars(raw: unknown): ChartBar[] {
  if (!Array.isArray(raw)) return [];
  const out: ChartBar[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const t = date(o.time);
    const op = num(o.open), hi = num(o.high), lo = num(o.low), cl = num(o.close);
    if (t && op !== null && hi !== null && lo !== null && cl !== null) {
      out.push({ time: t, open: op, high: hi, low: lo, close: cl });
    }
  }
  // lightweight-charts requires strictly ascending, unique times.
  return out.filter((b, i) => i === 0 || b.time > out[i - 1].time);
}

function points(raw: unknown): SignalPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: SignalPoint[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const t = date(o.time);
    const v = num(o.value);
    if (t && v !== null) out.push({ time: t, value: v, tone: tone(o.tone), color: color(o.color) });
  }
  return out.filter((p, i) => i === 0 || p.time > out[i - 1].time);
}

function signal(raw: unknown): ChartSignal | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = str(o.id);
  const label = str(o.label);
  if (!id || !label) return null;
  const base: Base = { id, label, group: str(o.group) ?? label, hidden: o.hidden === true };
  const pane = Math.max(0, Math.min(4, Math.trunc(num(o.pane) ?? 0)));
  switch (o.kind) {
    case "line":
    case "step": {
      const w = num(o.width);
      return {
        ...base, kind: o.kind, pane, points: points(o.points),
        width: w === 2 || w === 3 ? w : 1, style: style(o.style),
      };
    }
    case "markers": {
      const pts = (Array.isArray(o.points) ? o.points : [])
        .map((r) => {
          const p = (r ?? {}) as Record<string, unknown>;
          const t = date(p.time);
          if (!t) return null;
          const shape = p.shape === "up" || p.shape === "down" || p.shape === "square" ? p.shape : "dot";
          return {
            time: t,
            position: p.position === "above" ? ("above" as const) : ("below" as const),
            shape: shape as "up" | "down" | "dot" | "square",
            tone: tone(p.tone),
            color: color(p.color),
            text: str(p.text)?.slice(0, 12),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      return { ...base, kind: "markers", points: pts };
    }
    case "level": {
      const v = num(o.value);
      if (v === null) return null;
      return { ...base, kind: "level", value: v, tone: tone(o.tone), color: color(o.color), style: style(o.style) };
    }
    case "band":
      return { ...base, kind: "band", pane, upper: points(o.upper), lower: points(o.lower), tone: tone(o.tone) };
    case "histogram":
      return { ...base, kind: "histogram", pane: Math.max(1, pane), points: points(o.points) };
    default:
      return null;
  }
}

export function normalizeChart(raw: unknown): BullChartState {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof o.error === "string") {
    return { status: "error", bars: [], signals: [], runDate: null, errorMessage: o.error };
  }
  const b = bars(o.bars);
  const signals = (Array.isArray(o.signals) ? o.signals : [])
    .map(signal)
    .filter((s): s is ChartSignal => s !== null);
  return { status: b.length > 0 ? "live" : "empty", bars: b, signals, runDate: date(o.runDate) };
}

export function useBullChart(symbol: string, range: ChartRange): BullChartState {
  const [state, setState] = useState<BullChartState>({ status: "loading", bars: [], signals: [], runDate: null });
  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, status: "loading" }));
    fetchMarketSnapshot(`/api/bull/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          const msg = (body as Record<string, unknown>)?.error;
          setState({ status: "error", bars: [], signals: [], runDate: null,
            errorMessage: typeof msg === "string" ? msg : `chart api responded ${res.status}` });
          return;
        }
        setState(normalizeChart(body));
      })
      .catch((err) => {
        if (alive) setState({ status: "error", bars: [], signals: [], runDate: null,
          errorMessage: err instanceof Error ? err.message : "network error" });
      });
    return () => { alive = false; };
  }, [symbol, range]);
  return state;
}
