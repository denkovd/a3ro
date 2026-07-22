"use client";
/* ────────────────────────────────────────────────────────────────
   Poll /api/gold/loci for latest COMEX + ETF stock/flow metrics.
──────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";

export type GoldFlowMetric = {
  locus: string;
  metric: string;
  periodDate: string;
  value: number;
  unit: string;
  source: string;
  observedAt: string;
  meta?: Record<string, unknown>;
};

export type GoldFlowData = {
  metrics: GoldFlowMetric[];
  status: "loading" | "ready" | "empty" | "error";
  error: string | null;
  lastFetchedAt: number | null;
};

const EMPTY: GoldFlowData = {
  metrics: [],
  status: "loading",
  error: null,
  lastFetchedAt: null,
};

export function findMetric(
  metrics: GoldFlowMetric[],
  locus: string,
  metric: string,
): GoldFlowMetric | null {
  return metrics.find((m) => m.locus === locus && m.metric === metric) ?? null;
}

export function formatTonnes(v: number): string {
  if (Math.abs(v) >= 1000) return `${v.toFixed(0)} t`;
  if (Math.abs(v) >= 10) return `${v.toFixed(1)} t`;
  return `${v.toFixed(2)} t`;
}

export function formatToz(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M oz`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)} k oz`;
  return `${v.toFixed(0)} oz`;
}

export function formatFlowT(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${formatTonnes(Math.abs(v))}`;
}

export default function useGoldFlowData(): GoldFlowData {
  const [data, setData] = useState<GoldFlowData>(EMPTY);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/gold/loci", { cache: "no-store" });
        if (!res.ok) {
          if (!alive) return;
          setData((d) => ({
            ...d,
            status: d.metrics.length ? "ready" : "error",
            error: `loci ${res.status}`,
          }));
          return;
        }
        const body = (await res.json()) as { metrics?: GoldFlowMetric[] };
        const metrics = Array.isArray(body.metrics) ? body.metrics : [];
        if (!alive) return;
        setData({
          metrics,
          status: metrics.length ? "ready" : "empty",
          error: null,
          lastFetchedAt: Date.now(),
        });
      } catch (e) {
        if (!alive) return;
        setData((d) => ({
          ...d,
          status: d.metrics.length ? "ready" : "error",
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    };
    load();
    const id = setInterval(load, 60 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return data;
}
