"use client";
/* Daily tanker-transit history for the six chokepoints, read from the
   existing corridor-series endpoint. Feeds the week-on-week change and
   the gate detail chart. PortWatch publishes weekly, so a slow refresh
   is enough; a failed refresh keeps the last good series. */
import { useEffect, useState } from "react";
import { cleanDaily, type DailyPoint } from "./gateHistory";
import { GATE_META } from "./types";

export type GateHistory = { status: "loading" | "live" | "error"; points: DailyPoint[] };

const HISTORY_DAYS = 180;
const REFRESH_MS = 30 * 60_000;
const LOADING: GateHistory = { status: "loading", points: [] };

export default function useGateHistory(): Record<string, GateHistory> {
  const [history, setHistory] = useState<Record<string, GateHistory>>({});

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const load = async () => {
      const results = await Promise.all(GATE_META.map(async ({ id }): Promise<[string, GateHistory]> => {
        try {
          const res = await fetch(`/api/oil/corridors/series?corridor=${id}&metric=tanker_transits&days=${HISTORY_DAYS}`, { cache: "no-store", signal: controller.signal });
          const body = (await res.json().catch(() => ({}))) as { points?: unknown; error?: unknown };
          if (!res.ok || typeof body.error === "string" || !Array.isArray(body.points)) return [id, { status: "error", points: [] }];
          return [id, { status: "live", points: cleanDaily(body.points as DailyPoint[]) }];
        } catch {
          return [id, { status: "error", points: [] }];
        }
      }));
      if (!alive) return;
      setHistory(prev => Object.fromEntries(results.map(([id, next]) =>
        [id, next.status === "error" && prev[id]?.status === "live" ? prev[id] : next])));
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => { alive = false; controller.abort(); clearInterval(timer); };
  }, []);

  return history;
}

export const gateHistoryOf = (history: Record<string, GateHistory>, id: string): GateHistory => history[id] ?? LOADING;
