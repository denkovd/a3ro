"use client";
/* ────────────────────────────────────────────────────────────────
   Client-side multi-window RS from a per-symbol daily bar feed.

   Only BTC-USD has one of those in this app (/api/btc/history, the
   BTC Tracker's Coinbase-backed daily closes) — the other ~650
   symbols in the bull universe have no generic OHLC endpoint. This
   computes a SELF-return (price vs its own past, not vs a
   benchmark) for the 21d/126d/252d windows, which is a different
   quantity from the API's benchmark-relative rs63 — every place this
   is displayed says so, it is never blended into rs63 as if it were
   the same measurement.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import type { RsWindow } from "./rsData";

type HistoryPoint = { date: string; value: number };

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function normalizePoints(raw: unknown): HistoryPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryPoint[] = [];
  for (const p of raw) {
    const o = (p ?? {}) as Record<string, unknown>;
    const date = typeof o.date === "string" ? o.date : null;
    if (!date || !isNum(o.value)) continue;
    out.push({ date, value: o.value });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function selfReturnPct(points: HistoryPoint[], sessions: number): number | null {
  if (points.length <= sessions) return null;
  const last = points[points.length - 1].value;
  const prior = points[points.length - 1 - sessions].value;
  if (prior === 0) return null;
  return ((last - prior) / prior) * 100;
}

/** symbol -> the endpoint that serves its daily closes. Extend this
 *  only when a new generic series endpoint actually ships — do not
 *  wire a symbol here speculatively. */
export const SERIES_ENDPOINT_BY_SYMBOL: Record<string, string> = {
  "BTC-USD": "/api/btc/history",
};

export type SeriesRsState = {
  status: "unavailable" | "loading" | "live" | "error";
  windows: Partial<Record<RsWindow, number>>;
};

const NO_SERIES: SeriesRsState = { status: "unavailable", windows: {} };

/** Self-return RS windows for one symbol, or `unavailable` for the
 *  vast majority of the universe that has no series endpoint yet. */
export function useSeriesRs(symbol: string): SeriesRsState {
  const endpoint = SERIES_ENDPOINT_BY_SYMBOL[symbol];
  const [state, setState] = useState<SeriesRsState>(endpoint ? { status: "loading", windows: {} } : NO_SERIES);

  useEffect(() => {
    if (!endpoint) {
      setState(NO_SERIES);
      return;
    }
    let alive = true;
    setState({ status: "loading", windows: {} });
    fetch(endpoint, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setState({ status: "error", windows: {} });
          return;
        }
        const points = normalizePoints((body as Record<string, unknown>).points);
        const windows: Partial<Record<RsWindow, number>> = {};
        for (const w of [21, 126, 252] as RsWindow[]) {
          const v = selfReturnPct(points, w);
          if (v !== null) windows[w] = v;
        }
        setState({ status: "live", windows });
      })
      .catch(() => {
        if (alive) setState({ status: "error", windows: {} });
      });
    return () => {
      alive = false;
    };
  }, [endpoint]);

  return state;
}
