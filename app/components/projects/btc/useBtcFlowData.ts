"use client";
/* ────────────────────────────────────────────────────────────────
   Poll /api/btc/loci for the latest US spot ETF net-flow metric.
   Mirrors gold/useGoldFlowData.ts.
──────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";

export type BtcFlowMetric = {
  locus: string;
  metric: string;
  periodDate: string;
  value: number;
  unit: string;
  source: string;
  observedAt: string;
  meta?: Record<string, unknown>;
};

export type BtcFlowData = {
  metrics: BtcFlowMetric[];
  status: "loading" | "ready" | "empty" | "error";
  error: string | null;
  lastFetchedAt: number | null;
};

const EMPTY: BtcFlowData = {
  metrics: [],
  status: "loading",
  error: null,
  lastFetchedAt: null,
};

export function findMetric(
  metrics: BtcFlowMetric[],
  locus: string,
  metric: string,
): BtcFlowMetric | null {
  return metrics.find((m) => m.locus === locus && m.metric === metric) ?? null;
}

export function formatUsdMn(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}B`;
  return `${sign}$${abs.toFixed(1)}M`;
}

export default function useBtcFlowData(): BtcFlowData {
  const [data, setData] = useState<BtcFlowData>(EMPTY);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/btc/loci", { cache: "no-store" });
        if (!res.ok) {
          if (!alive) return;
          setData((d) => ({
            ...d,
            status: d.metrics.length ? "ready" : "error",
            error: `loci ${res.status}`,
          }));
          return;
        }
        const body = (await res.json()) as { metrics?: BtcFlowMetric[] };
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
