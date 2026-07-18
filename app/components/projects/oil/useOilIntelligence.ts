"use client";
/* ────────────────────────────────────────────────────────────────
   Derives the intel-rail view-model from useOilData + /api/oil/tape.
   Pure presentation math — never invents live numbers.
──────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from "react";
import type { Benchmark, CorridorBaseline, CorridorMetricLatest, DailyPrice, LatestQuote, ScoreSnapshot } from "@a3ro/oil-backend";
import useOilData from "../useOilData";
import { formatUsdBbl, formatUtcDateTime, formatUtcTime, isUtcToday } from "../oilFormat";
import { AMBER_CSS, flowHealth } from "../oilTrackerShared";
import {
  BENCH_TITLE,
  CORRIDOR_META,
  type BenchmarkRow,
  type CorridorWatchRow,
  type OilIntelligence,
  type RailDriver,
  type SpreadView,
  type StanceView,
} from "./types";

const TRACKED = ["WTI", "BRENT"] as const satisfies readonly Benchmark[];

type TapeBody = {
  runDate: string | null;
  stance: string;
  label: string;
  headline: string;
  drivers: { key: string; label: string; value: number | null }[];
  coverage: number;
};

function baselineFor(
  baselines: CorridorBaseline[] | null,
  corridor: string,
  metric: string,
  win: "1y" | "5y",
): CorridorBaseline | null {
  return baselines?.find((b) => b.corridor === corridor && b.metric === metric && b.win === win) ?? null;
}

function gateHealthRatio(
  corridors: CorridorMetricLatest[] | null,
  baselines: CorridorBaseline[] | null,
  gateCorridor: string,
): number | null {
  const transits7d = corridors?.find(
    (m) => m.corridor === gateCorridor && m.metric === "tanker_transits_7d",
  );
  if (!transits7d) return null;
  const b = baselineFor(baselines, gateCorridor, "tanker_transits", "1y");
  if (!b || b.meanValue <= 0) return null;
  return transits7d.value / b.meanValue;
}

function benchStatus(q: LatestQuote | undefined): { text: string; color: string } {
  if (!q) return { text: "—", color: "var(--ink-3)" };
  if (q.kind === "live" || q.kind === "delayed") {
    switch (q.staleness) {
      case "fresh":
        return { text: "Live", color: AMBER_CSS };
      case "aging":
        return { text: "Live", color: "var(--ink-2)" };
      case "stale":
      case "dead":
        return { text: "Last trade", color: "var(--ink-3)" };
    }
  }
  switch (q.staleness) {
    case "fresh":
    case "aging":
      return { text: "Settled", color: "var(--ink-2)" };
    case "stale":
    case "dead":
      return { text: "Settled", color: "var(--ink-3)" };
  }
}

function changePct(q: LatestQuote | undefined, series: DailyPrice[] | undefined): number | null {
  if (!q || !series || series.length === 0) return null;
  const observedDate = q.observedAt.slice(0, 10);
  const prior = [...series].reverse().find((p) => p.periodDate < observedDate);
  if (!prior || prior.price <= 0) return null;
  return (q.price - prior.price) / prior.price;
}

function buildSpread(scores: ScoreSnapshot[] | null): SpreadView | null {
  const spreadSig = scores?.find((s) => s.scoreId === "brent_wti_spread");
  const leg = spreadSig?.components[0];
  if (!spreadSig || spreadSig.score === null || !leg || leg.value === null) return null;
  return { value: leg.value, label: spreadSig.label };
}

function buildDrivers(
  corridors: CorridorMetricLatest[] | null,
  baselines: CorridorBaseline[] | null,
  scores: ScoreSnapshot[] | null,
  spread: SpreadView | null,
): RailDriver[] {
  const out: RailDriver[] = [];

  // 1 — worst gate vs 1Y norm (Hormuz / Singapore)
  const gateCandidates: { id: string; title: string; ratio: number; gate: string }[] = [];
  for (const meta of CORRIDOR_META) {
    if (!meta.gateCorridor || meta.gateCorridor === "usgulf") continue;
    const ratio = gateHealthRatio(corridors, baselines, meta.gateCorridor);
    if (ratio == null) continue;
    gateCandidates.push({ id: meta.id, title: meta.title, ratio, gate: meta.gateCorridor });
  }
  if (gateCandidates.length > 0) {
    // Prefer the gate furthest from 1.0 (most stressed / elevated)
    gateCandidates.sort((a, b) => Math.abs(1 - b.ratio) - Math.abs(1 - a.ratio));
    const worst = gateCandidates[0];
    // Suppress near-neutral noise (|ratio - 1| < 0.05) unless it's the only driver later
    if (Math.abs(1 - worst.ratio) >= 0.05 || gateCandidates.length === 1) {
      out.push({
        id: `gate-${worst.gate}`,
        label: `${worst.title.split("·")[0].trim()} vs 1Y`,
        value: `${Math.round(worst.ratio * 100)}%`,
        color: flowHealth(worst.ratio),
        focus: { kind: "corridor", id: worst.id },
      });
    }
  }

  // 2 — Flow Stress
  const flowStress = scores?.find((s) => s.scoreId === "flow_stress");
  if (flowStress && flowStress.score !== null) {
    out.push({
      id: "flow_stress",
      label: "Flow stress",
      value: `${flowStress.score} · ${flowStress.label}`,
      color: flowStress.status === "elevated" ? AMBER_CSS : undefined,
      focus: { kind: "corridor", id: "usgc" },
    });
  }

  // 3 — Tightness
  const tightness = scores?.find((s) => s.scoreId === "tightness");
  if (tightness && tightness.score !== null) {
    out.push({
      id: "tightness",
      label: "Tightness",
      value: `${tightness.score} · ${tightness.label}`,
      color: tightness.status === "elevated" ? AMBER_CSS : undefined,
      focus: { kind: "corridor", id: "usgc" },
    });
  }

  // 4 — Brent–WTI spread
  if (spread) {
    const sign = spread.value >= 0 ? "+" : "−";
    out.push({
      id: "spread",
      label: "Brent–WTI",
      value: `${sign}$${Math.abs(spread.value).toFixed(2)} · ${spread.label}`,
      color: spread.label !== "NORMAL" ? AMBER_CSS : undefined,
      focus: { kind: "benchmark", id: "BRENT" },
    });
  }

  return out.slice(0, 4);
}

function buildCorridorRows(
  corridors: CorridorMetricLatest[] | null,
  baselines: CorridorBaseline[] | null,
  scores: ScoreSnapshot[] | null,
): CorridorWatchRow[] {
  const flowStress = scores?.find((s) => s.scoreId === "flow_stress");
  const hasLive = (id: string): boolean => {
    if (id === "hormuz") {
      return !!corridors?.find((m) => m.corridor === "hormuz" && m.metric === "tanker_transits_7d");
    }
    if (id === "sg") {
      return !!corridors?.find((m) => m.corridor === "singapore" && m.metric === "tanker_transits_7d");
    }
    if (id === "usgc") {
      return !!corridors?.find(
        (m) =>
          m.corridor === "usgulf" &&
          (m.metric === "crude_exports" || m.metric === "refinery_utilization"),
      );
    }
    return false;
  };

  const rows: CorridorWatchRow[] = CORRIDOR_META.map((meta) => {
    const live = hasLive(meta.id);
    let status: CorridorWatchRow["status"];
    let statusText: string;
    if (live) {
      status = "live";
      if (meta.id === "usgc" && flowStress && flowStress.score !== null) {
        statusText = `Stress ${flowStress.score}`;
      } else if (meta.gateCorridor && meta.gateCorridor !== "usgulf") {
        statusText = "Satellite";
      } else {
        statusText = "Weekly";
      }
    } else if (meta.watchlist) {
      status = "watchlist";
      statusText = "Watchlist";
    } else {
      status = "connecting";
      statusText = "Connecting";
    }

    const healthRatio =
      meta.gateCorridor && meta.gateCorridor !== "usgulf"
        ? gateHealthRatio(corridors, baselines, meta.gateCorridor)
        : null;

    let railMetric: string | undefined;
    if (healthRatio != null) {
      railMetric = `${Math.round(healthRatio * 100)}% of 1Y`;
    } else if (live && meta.id === "usgc") {
      const exports = corridors?.find((m) => m.corridor === "usgulf" && m.metric === "crude_exports");
      if (exports) railMetric = `${exports.value.toFixed(1)} Mb/d`;
    } else if (live && meta.gateCorridor) {
      const t = corridors?.find(
        (m) => m.corridor === meta.gateCorridor && m.metric === "tanker_transits_7d",
      );
      if (t) railMetric = `${t.value.toFixed(1)}/d`;
    }

    // Ranking: live stressed first, then live, connecting, watchlist
    let rankScore = 0;
    if (status === "live") rankScore += 300;
    else if (status === "connecting") rankScore += 100;
    else rankScore += 0;
    if (healthRatio != null) rankScore += Math.abs(1 - healthRatio) * 100;
    if (meta.id === "usgc" && flowStress?.status === "elevated") rankScore += 40;
    if (flowStress && flowStress.score !== null && meta.id === "usgc") {
      rankScore += flowStress.score * 0.2;
    }

    return {
      id: meta.id,
      title: meta.title,
      status,
      statusText,
      railMetric,
      healthRatio,
      rankScore,
    };
  });

  return rows.sort((a, b) => b.rankScore - a.rankScore);
}

function buildBenchmarks(
  quotes: LatestQuote[] | null,
  series: Partial<Record<Benchmark, DailyPrice[]>>,
): BenchmarkRow[] {
  return TRACKED.map((id) => {
    const q = quotes?.find((x) => x.benchmark === id);
    const st = benchStatus(q);
    return {
      id,
      title: BENCH_TITLE[id],
      price: q ? q.price : null,
      changePct: changePct(q, series[id]),
      statusText: st.text,
      statusColor: st.color,
      suspect: !!q?.suspect,
    };
  });
}

function feedClockFrom(quotes: LatestQuote[] | null): string | null {
  if (!quotes || quotes.length === 0) return null;
  const newest = quotes.reduce(
    (latest, q) => (q.observedAt > latest ? q.observedAt : latest),
    quotes[0].observedAt,
  );
  return isUtcToday(newest) ? formatUtcTime(newest) : formatUtcDateTime(newest);
}

function useTapeStance(): StanceView {
  const [stance, setStance] = useState<StanceView>({
    status: "loading",
    stance: "PENDING",
    label: "—",
    headline: "",
    coverage: 0,
  });

  useEffect(() => {
    let alive = true;
    fetch("/api/oil/tape", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!alive) return;
        if (!res.ok || typeof body.error === "string") {
          setStance((s) => ({ ...s, status: "error" }));
          return;
        }
        const t = body.tape as TapeBody | null;
        if (!t || typeof t !== "object" || t.stance === "PENDING") {
          setStance({
            status: "pending",
            stance: "PENDING",
            label: t?.label ?? "Pending",
            headline: t?.headline ?? "Awaiting composite scores.",
            coverage: t?.coverage ?? 0,
          });
          return;
        }
        setStance({
          status: "live",
          stance: t.stance,
          label: t.label,
          headline: t.headline,
          coverage: t.coverage,
        });
      })
      .catch(() => {
        if (alive) setStance((s) => ({ ...s, status: "error" }));
      });
    return () => {
      alive = false;
    };
  }, []);

  return stance;
}

export type OilIntelligenceBundle = {
  /** Shared live feed — single poll cycle for globe + rail. */
  feed: ReturnType<typeof useOilData>;
  intel: OilIntelligence;
};

export default function useOilIntelligence(): OilIntelligenceBundle {
  const feed = useOilData();
  const stance = useTapeStance();

  const intel = useMemo((): OilIntelligence => {
    const spread = buildSpread(feed.scores);
    return {
      stance,
      drivers: buildDrivers(feed.corridors, feed.baselines, feed.scores, spread),
      benchmarks: buildBenchmarks(feed.quotes, feed.series),
      spread,
      corridors: buildCorridorRows(feed.corridors, feed.baselines, feed.scores),
      feedClock: feed.status === "error" ? "OFFLINE" : feedClockFrom(feed.quotes),
      feedStatus: feed.status,
    };
  }, [feed.quotes, feed.series, feed.corridors, feed.baselines, feed.scores, feed.status, stance]);

  return { feed, intel };
}

export { formatUsdBbl };
