"use client";
import type { Benchmark, DailyPrice, LatestQuote } from "@a3ro/oil-backend";
import useOilData from "../useOilData";
import { currentMetrics, metricFreshness, quoteStatus, quoteBasis, comparablePriorClose } from "./dataQuality";
import { BENCH_TITLE, CORRIDOR_META, type OilIntelligence, type CorridorWatchRow } from "./types";
import { chinaLead, chinaMapText } from "./china";

const TRACKED = ["WTI", "BRENT"] as const;

function changeVsPriorClose(q: LatestQuote | undefined, series: DailyPrice[] | undefined) {
  if (!q || !series) return null;
  const prior = [...series].sort((a, b) => b.periodDate.localeCompare(a.periodDate)).find(p => p.periodDate < q.observedAt.slice(0, 10));
  return prior && prior.price > 0 && comparablePriorClose(q, prior) ? { pct: (q.price - prior.price) / prior.price, date: prior.periodDate } : null;
}

export default function useOilIntelligence() {
  const feed = useOilData();
  // Small derived lists intentionally recompute on each feed tick, including age checks.
  const current = currentMetrics(feed.corridors);
  const corridors = CORRIDOR_META.map((meta): CorridorWatchRow => {
    if (meta.id === "china") {
      const row = chinaLead(feed.corridors);
      const stale = row ? metricFreshness(row) === "stale" : false;
      return { id: meta.id, title: meta.title, status: stale ? "stale" : row ? "live" : "connecting", statusText: stale ? "Historical" : row ? "Monthly" : "Unavailable", railMetric: row ? chinaMapText(feed.corridors) : undefined, healthRatio: null, rankScore: row && !stale ? 300 : 0 };
    }
    const raw = feed.corridors?.find(m => m.corridor === meta.gateCorridor && m.metric === (meta.id === "usgc" ? "crude_exports" : "tanker_transits_7d"));
    const stale = raw ? metricFreshness(raw) === "stale" : false;
    const row = current.find(m => m === raw);
    const baseline = feed.baselines?.find(b => b.corridor === meta.gateCorridor && b.metric === "tanker_transits" && b.win === "1y");
    const baselineAge = baseline ? Date.now() - Date.parse(baseline.sampleTo) : Infinity;
    const ratio = row && baseline && baseline.meanValue > 0 && baselineAge <= 45 * 86_400_000 ? row.value / baseline.meanValue : null;
    return {
      id: meta.id, title: meta.title,
      status: stale ? "stale" : row ? "live" : meta.watchlist ? "watchlist" : "connecting",
      statusText: stale ? "Stale" : row ? "Reported" : meta.watchlist ? "Watchlist" : "Unavailable",
      railMetric: raw ? `${raw.value.toFixed(1)} ${raw.unit} · ${raw.periodDate}${ratio !== null ? ` · ${Math.round(ratio * 100)}% of 1Y` : ""}` : undefined,
      healthRatio: ratio, rankScore: row ? 300 + (ratio === null ? 0 : Math.abs(1 - ratio) * 100) : 0,
    };
  }).sort((a, b) => b.rankScore - a.rankScore);
  const intel: OilIntelligence = {
    benchmarks: TRACKED.map((id: Benchmark) => {
      const q = feed.quotes?.find(x => x.benchmark === id);
      const change = changeVsPriorClose(q, feed.series[id]);
      return { id, title: BENCH_TITLE[id], price: q?.price ?? null, changePct: change?.pct ?? null,
        changeVsDate: change?.date ?? null, statusText: quoteStatus(q),
        statusColor: "var(--ink-2)", suspect: !!q?.suspect, observedAt: q?.observedAt ?? null, refreshFailed: feed.quoteFailed, basis: quoteBasis(q) };
    }),
    corridors,
    feedStatus: feed.status,
  };
  return { feed, intel };
}
