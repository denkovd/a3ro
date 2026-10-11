"use client";
/* ────────────────────────────────────────────────────────────────
   CorridorSpark (roadmap P3) — a real sparkline of a corridor metric's
   accumulated history, fetched lazily from /api/oil/corridors/series
   when a corridor panel opens. Honest states throughout (A3RO truth
   rule): thin history (< 2 points) reads "HISTORY ACCUMULATING" rather
   than drawing a fake line — corridor_metrics only started accruing
   when the corridor cycle went live, so many gates fill in over time.
   Self-contained (its own tiny SVG) so it needs no export surface from
   the 2.5k-line OilTrackerCore.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

const AMBER = "#d4a157";

type Point = { date: string; value: number };
type SparkState = { status: "loading" | "live" | "pending" | "error"; points: Point[] };

export default function CorridorSpark({
  corridor,
  metric,
  caption,
  days = 120,
}: {
  corridor: string;
  metric: string;
  caption?: string;
  days?: number;
}) {
  const [s, setS] = useState<SparkState>({ status: "loading", points: [] });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setS({ status: "loading", points: [] });
    const url = `/api/oil/corridors/series?corridor=${encodeURIComponent(corridor)}&metric=${encodeURIComponent(metric)}&days=${days}`;
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!alive) return;
        if (!res.ok || typeof body.error === "string") {
          setS({ status: "error", points: [] });
          return;
        }
        const raw = Array.isArray(body.points) ? body.points : [];
        const points = raw
          .map((p) => p as Record<string, unknown>)
          .filter((p) => typeof p.value === "number" && Number.isFinite(p.value as number))
          .filter(p => typeof p.date === "string" && Number.isFinite(Date.parse(p.date)))
          .map((p) => ({ date: String(p.date), value: p.value as number }))
          .sort((a, b) => a.date.localeCompare(b.date));
        setS({ status: points.length >= 2 ? "live" : "pending", points });
      })
      .catch(() => {
        if (alive) setS({ status: "error", points: [] });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [corridor, metric, days]);

  if (s.status === "live") {
    const first = s.points[0], last = s.points[s.points.length - 1];
    const change = first.value === 0 ? null : (last.value - first.value) / Math.abs(first.value) * 100;
    return (
      <div className="mt-6">
        <MiniSpark values={s.points.map((p) => p.value)} id={`${corridor}-${metric}`} />
        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          {caption ?? "Reported observation history"} · {s.points.length} pts
        </p>
        <div className="mt-2 flex justify-between gap-2 font-mono text-[8px] text-[var(--ink-3)]"><span>{first.date.slice(0, 10)}</span><span>{last.date.slice(0, 10)}</span></div>
        <p className="mt-2 text-[10px] text-[var(--ink-2)]">{change === null ? "Change unavailable from zero baseline" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% across displayed observations`}</p>
      </div>
    );
  }

  const msg =
    s.status === "loading"
      ? "SERIES · LOADING"
      : s.status === "error"
        ? "SERIES UNAVAILABLE"
        : "HISTORY ACCUMULATING · CHART FILLS AS DATA LANDS";
  return (
    <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{msg}</p>
  );
}

/* tiny sparkline — mirrors OilTrackerCore's benchmark Spark, kept local
   so this component is fully self-contained. */
function MiniSpark({ values, id }: { values: number[]; id: string }) {
  const w = 240,
    h = 36,
    pad = 2;
  const min = Math.min(...values),
    max = Math.max(...values);
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`corridor-spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={AMBER} stopOpacity="0.14" />
          <stop offset="100%" stopColor={AMBER} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${h - pad} ${pts.join(" ")} ${w - pad},${h - pad}`} fill={`url(#corridor-spark-${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={AMBER} strokeWidth="1" strokeOpacity="0.85" />
    </svg>
  );
}
