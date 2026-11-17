"use client";
import type { Benchmark, CorridorBaseline, CorridorMetricLatest, DailyPrice, LatestQuote } from "@a3ro/oil-backend";
import useOilData from "../useOilData";
import { currentMetrics, metricFreshness, quoteStatus, quoteBasis, comparablePriorClose } from "./dataQuality";
import { BENCH_TITLE, CORRIDOR_META, GATE_HOTSPOT_IDS, GATE_META, type OilIntelligence, type CorridorWatchRow, type GateSignalRow } from "./types";
import { gateSignal, rankGateSignals, tierMove } from "./gateSignal";
import { weeklyChange } from "./gateHistory";
import useGateHistory, { gateHistoryOf, type GateHistory } from "./useGateHistory";
import { chinaLead, chinaMapText } from "./china";

const TRACKED = ["WTI", "BRENT"] as const;

function changeVsPriorClose(q: LatestQuote | undefined, series: DailyPrice[] | undefined) {
  if (!q || !series) return null;
  const prior = [...series].sort((a, b) => b.periodDate.localeCompare(a.periodDate)).find(p => p.periodDate < q.observedAt.slice(0, 10));
  return prior && prior.price > 0 && comparablePriorClose(q, prior) ? { pct: (q.price - prior.price) / prior.price, date: prior.periodDate } : null;
}

/** Traffic vs norm for every chokepoint: 7-day tanker transits against the PortWatch 1-year mean.
 *  Each gate yields exactly one row; ranking puts departures from the norm first. */
export function gateSignalRows(metrics: CorridorMetricLatest[] | null, baselines: CorridorBaseline[] | null, histories: Record<string, GateHistory> = {}, now = Date.now()): GateSignalRow[] {
  return rankGateSignals(GATE_META.map((meta): GateSignalRow => {
    const reading = metrics?.find(m => m.corridor === meta.id && m.metric === "tanker_transits_7d") ?? null;
    const norm = (win: "1y" | "5y") => baselines?.find(b => b.corridor === meta.id && b.metric === "tanker_transits" && b.win === win) ?? null;
    const norms = { norm1y: norm("1y"), norm5y: norm("5y"), now };
    const signal = gateSignal({ reading, fresh: !!reading && metricFreshness(reading, now) === "current", ...norms });
    const history = gateHistoryOf(histories, meta.id);
    // The change covers the same week as the reading, and only a current, compared reading has one.
    const change = signal.ratio !== null && signal.periodDate && history.status === "live" ? weeklyChange(history.points, signal.periodDate) : null;
    // Last week's tier, read against the same norm as this week's.
    const prior = change && change.prior.mean !== null ? gateSignal({ reading: { value: change.prior.mean, periodDate: change.prior.to }, fresh: true, ...norms }) : null;
    return { ...meta, signal, change, move: tierMove(signal, prior), history };
  }));
}

export default function useOilIntelligence() {
  const feed = useOilData();
  const gateHistory = useGateHistory();
  // Small derived lists intentionally recompute on each feed tick, including age checks.
  const current = currentMetrics(feed.corridors);
  // Hormuz and Singapore are reported once, in the gate list below.
  const corridors = CORRIDOR_META.filter(meta => !GATE_HOTSPOT_IDS.has(meta.id)).map((meta): CorridorWatchRow => {
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
    gates: gateSignalRows(feed.corridors, feed.baselines, gateHistory),
    feedStatus: feed.status,
  };
  return { feed, intel };
}
