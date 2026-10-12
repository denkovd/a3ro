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
  series: BtcFlowMetric[];
  seriesError: string | null;
  status: "loading" | "ready" | "empty" | "error";
  error: string | null;
  lastFetchedAt: number | null;
};

const EMPTY: BtcFlowData = {
  metrics: [],
  series: [],
  seriesError: null,
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
    let busy = false;
    const controller = new AbortController();
    const load = async () => {
      if (busy) return;
      busy = true;
      const from = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
      try {
        const [latest, history] = await Promise.allSettled([
          fetch("/api/btc/loci", { cache: "no-store", signal: controller.signal }).then(async (res) => {
            if (!res.ok) throw new Error(`ETF feed ${res.status}`);
            return res.json() as Promise<{ metrics?: BtcFlowMetric[] }>;
          }),
          fetch(`/api/btc/loci/series?locus=etf_us&metric=etf_flow_usd_mn&from=${from}`, { cache: "no-store", signal: controller.signal }).then(async (res) => {
            if (!res.ok) throw new Error(`ETF history ${res.status}`);
            return res.json() as Promise<{ series?: BtcFlowMetric[] }>;
          }),
        ]);
        if (!alive) return;
        setData((previous) => {
          const metrics = latest.status === "fulfilled" && Array.isArray(latest.value.metrics) ? latest.value.metrics : previous.metrics;
          const series = history.status === "fulfilled" && Array.isArray(history.value.series) ? history.value.series : previous.series;
          return { metrics, series,
            status: metrics.length ? "ready" : latest.status === "rejected" ? "error" : "empty",
            error: latest.status === "rejected" ? "ETF refresh unavailable. Retrying automatically." : null,
            seriesError: history.status === "rejected" ? "Flow history unavailable" : null,
            lastFetchedAt: latest.status === "fulfilled" ? Date.now() : previous.lastFetchedAt };
        });
      } finally { busy = false; }
    };
    void load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; controller.abort(); clearInterval(id); };
  }, []);

  return data;
}
