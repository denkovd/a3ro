/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — chart payload + signal contract (Phase 3).

   The chart is library-agnostic on purpose: the backend emits OHLC
   bars plus a list of ChartSignal objects; the frontend has ONE
   adapter (app/components/projects/bull/chart/lwcAdapter.ts) that
   turns signals into chart calls. New signals — including Daniel's
   own trading signals — are backend-only additions: build an array
   of ChartSignal and append it in buildBullChart. Swapping the chart
   library later means rewriting the adapter only.

   Colours are NOT part of the contract: signals carry a semantic
   `tone` (bull / bear / neutral / accent) and the frontend maps it
   to the module palette. An explicit `color` is allowed as an
   escape hatch for custom signals.

   The Money Line is the first signal expressed through the contract:
   - daily + weekly levels as step lines, toned by trend
   - flip markers (D / W) at each confirmed flip
   - current "next flip" levels as horizontal price levels
   It re-runs the verified engine on the SAME closed adj series the
   scan used (closedDailyBars(adj, runDate)), so the last chart point
   always equals the stored snapshot's flip level. Pure: no I/O.
──────────────────────────────────────────────────────────────── */

import {
  closedDailyBars,
  MoneyLineTracePoint,
  resampleWeekly,
  runMoneyLine,
} from "../regime/engine";
import { RegimeBar } from "../regime/types";

/* ── contract ─────────────────────────────────────────────────── */

export type SignalTone = "bull" | "bear" | "neutral" | "accent";

export interface ChartBar {
  /** YYYY-MM-DD (business day). */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SignalPoint {
  time: string;
  value: number;
  tone?: SignalTone;
  color?: string;
}

interface SignalBase {
  /** Stable id — used for toggles and React keys. */
  id: string;
  /** Legend label. */
  label: string;
  /** Legend group: signals sharing a group toggle together. */
  group?: string;
  /** Start hidden (user can toggle on). */
  hidden?: boolean;
}

export type ChartSignal =
  | (SignalBase & {
      kind: "line" | "step";
      /** 0 = price pane (default); 1+ = separate panes below. */
      pane?: number;
      points: SignalPoint[];
      width?: 1 | 2 | 3;
      style?: "solid" | "dashed" | "dotted";
    })
  | (SignalBase & {
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
  | (SignalBase & {
      kind: "level";
      value: number;
      tone?: SignalTone;
      color?: string;
      style?: "solid" | "dashed" | "dotted";
    })
  | (SignalBase & {
      kind: "band";
      pane?: number;
      upper: SignalPoint[];
      lower: SignalPoint[];
      tone?: SignalTone;
    })
  | (SignalBase & {
      kind: "histogram";
      pane: number;
      points: SignalPoint[];
    });

export interface BullChartPayload {
  symbol: string;
  runDate: string;
  range: ChartRange;
  bars: ChartBar[];
  signals: ChartSignal[];
}

/* ── ranges ───────────────────────────────────────────────────── */

export const CHART_RANGES = ["3m", "6m", "1y", "2y", "5y", "max"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const DEFAULT_CHART_RANGE: ChartRange = "1y";

export function isChartRange(v: unknown): v is ChartRange {
  return typeof v === "string" && (CHART_RANGES as readonly string[]).includes(v);
}

const RANGE_MONTHS: Record<Exclude<ChartRange, "max">, number> = {
  "3m": 3, "6m": 6, "1y": 12, "2y": 24, "5y": 60,
};

/** First date to show: `range` back from the last bar (calendar months). */
export function rangeStart(lastDate: string, range: ChartRange): string | null {
  if (range === "max") return null;
  const d = new Date(`${lastDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - RANGE_MONTHS[range]);
  return d.toISOString().slice(0, 10);
}

/* ── Money Line → signals ─────────────────────────────────────── */

const toneOf = (trend: number): SignalTone =>
  trend === 1 ? "bull" : trend === -1 ? "bear" : "neutral";

function levelPoints(trace: MoneyLineTracePoint[], from: string | null): SignalPoint[] {
  const out: SignalPoint[] = [];
  for (const p of trace) {
    if (p.line === null || p.trend === 0) continue;
    if (from !== null && p.date < from) continue;
    out.push({ time: p.date, value: p.line, tone: toneOf(p.trend) });
  }
  return out;
}

export function moneyLineSignals(
  closedDaily: RegimeBar[],
  runDate: string,
  from: string | null,
): ChartSignal[] {
  const weeklyBars = resampleWeekly(closedDaily, runDate);
  const dTrace: MoneyLineTracePoint[] = [];
  const wTrace: MoneyLineTracePoint[] = [];
  // Full history in, so the Donchian warm-up never starts inside the view.
  const d = runMoneyLine(closedDaily, undefined, undefined, dTrace);
  const w = runMoneyLine(weeklyBars, undefined, undefined, wTrace);

  // Weekly flips are stamped with the last trading day of the week,
  // which is always a daily bar date — markers land on real candles.
  const inView = (date: string) => from === null || date >= from;
  const flipMarkers = [
    ...d.flips.filter((f) => inView(f.date)).map((f) => ({
      time: f.date,
      position: f.direction === 1 ? ("below" as const) : ("above" as const),
      shape: f.direction === 1 ? ("up" as const) : ("down" as const),
      tone: toneOf(f.direction),
      text: "D",
    })),
  ];
  const weeklyMarkers = w.flips.filter((f) => inView(f.date)).map((f) => ({
    time: f.date,
    position: f.direction === 1 ? ("below" as const) : ("above" as const),
    shape: f.direction === 1 ? ("up" as const) : ("down" as const),
    tone: toneOf(f.direction),
    text: "W",
  }));

  const signals: ChartSignal[] = [
    {
      id: "ml-daily", label: "Money Line · daily", group: "Money Line daily",
      kind: "step", width: 2, points: levelPoints(dTrace, from),
    },
    {
      id: "ml-weekly", label: "Money Line · weekly", group: "Money Line weekly",
      kind: "step", width: 1, style: "dashed", points: levelPoints(wTrace, from),
    },
    {
      id: "ml-daily-flips", label: "Daily flips", group: "Money Line daily",
      kind: "markers", points: flipMarkers,
    },
    {
      id: "ml-weekly-flips", label: "Weekly flips", group: "Money Line weekly",
      kind: "markers", points: weeklyMarkers,
    },
  ];
  if (d.line !== null && d.trend !== 0) {
    signals.push({
      id: "ml-daily-level", label: "D flip", group: "Money Line daily",
      kind: "level", value: d.line, tone: toneOf(d.trend), style: "solid",
    });
  }
  if (w.line !== null && w.trend !== 0) {
    signals.push({
      id: "ml-weekly-level", label: "W flip", group: "Money Line weekly",
      kind: "level", value: w.line, tone: toneOf(w.trend), style: "dashed",
    });
  }
  return signals;
}

/**
 * Full chart payload for one symbol. `adjBars` = the stored adj
 * series (oldest → newest, forming bar allowed — stripped here).
 * Append further signal builders here; each receives the same closed
 * series so every overlay is computed on what the scan saw.
 */
export function buildBullChart(
  symbol: string,
  adjBars: RegimeBar[],
  runDate: string,
  range: ChartRange,
): BullChartPayload {
  const closed = closedDailyBars(adjBars, runDate);
  const last = closed.length > 0 ? closed[closed.length - 1].date : null;
  const from = last ? rangeStart(last, range) : null;
  const bars: ChartBar[] = closed
    .filter((b) => from === null || b.date >= from)
    .map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close }));
  const signals: ChartSignal[] = [
    ...moneyLineSignals(closed, runDate, from),
    // ...yourSignals(closed, runDate, from)
  ];
  return { symbol, runDate, range, bars, signals };
}
