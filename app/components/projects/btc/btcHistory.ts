"use client";
/* ────────────────────────────────────────────────────────────────
   BTC Tracker — weekly price bars for BtcPriceChart.

   /api/btc/history serves daily closes from btc_prices (Coinbase);
   there is no weekly aggregation in storage or ingest, so bucketing
   into ISO weeks (Mon–Sun, last close of the week wins) happens here,
   client-side, rather than adding a new table for a view concern.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

export type WeeklyBar = { weekStart: string; weekEnd: string; close: number };

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
  return out;
}

/** Monday (UTC) of the ISO week a date falls in, as an anchor key. */
function weekStartOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayFromMonday = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayFromMonday);
  return d.toISOString().slice(0, 10);
}

function toWeeklyBars(points: HistoryPoint[]): WeeklyBar[] {
  const byWeek = new Map<string, HistoryPoint[]>();
  for (const p of points) {
    const key = weekStartOf(p.date);
    const arr = byWeek.get(key);
    if (arr) arr.push(p);
    else byWeek.set(key, [p]);
  }
  const bars: WeeklyBar[] = [];
  for (const [weekStart, pts] of byWeek) {
    pts.sort((a, b) => a.date.localeCompare(b.date));
    bars.push({ weekStart, weekEnd: pts[pts.length - 1].date, close: pts[pts.length - 1].value });
  }
  bars.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return bars;
}

export type BtcHistoryState = {
  status: "loading" | "live" | "error";
  bars: WeeklyBar[];
};

const EMPTY: BtcHistoryState = { status: "loading", bars: [] };

export function useBtcWeeklyHistory(): BtcHistoryState {
  const [state, setState] = useState<BtcHistoryState>(EMPTY);

  useEffect(() => {
    let alive = true;
    fetch("/api/btc/history", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setState({ status: "error", bars: [] });
          return;
        }
        const points = normalizePoints((body as Record<string, unknown>).points);
        setState({ status: "live", bars: toWeeklyBars(points) });
      })
      .catch(() => {
        if (alive) setState({ status: "error", bars: [] });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
