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

type Point = { date: string; value: number; periodStart?: string };
type SparkState = { status: "loading" | "live" | "pending" | "error"; points: Point[] };

export default function CorridorSpark({
  corridor,
  metric,
  caption,
  days = 120,
  monthly = false,
}: {
  corridor: string;
  metric: string;
  caption?: string;
  days?: number;
  /** Monthly China totals are charted as daily averages to compare Jan–Feb fairly. */
  monthly?: boolean;
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
          .map((p) => ({ date: String(p.date), value: p.value as number, ...(typeof p.periodStart === "string" ? { periodStart: p.periodStart } : {}) }))
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
    const chartPoints = monthly ? s.points.map(p => {
      const end = new Date(Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)), 0));
      const start = Date.parse(`${p.periodStart ?? p.date}T00:00:00Z`);
      const count = (end.getTime() - start) / 86_400_000 + 1;
      return { ...p, value: p.value * 1000 / count };
    }).filter(p => Number.isFinite(p.value)) : s.points;
    const firstChart = chartPoints[0], lastChart = chartPoints[chartPoints.length - 1];
    const chartChange = monthly ? (firstChart?.value ? (lastChart.value / firstChart.value - 1) * 100 : null) : change;
    const holes = sparkRuns(chartPoints.map(p => p.date)).length - 1;
    return (
      <div className="mt-6">
        {chartPoints.length >= 2 && <MiniSpark values={chartPoints.map((p) => p.value)} dates={chartPoints.map(p => p.date)} id={`${corridor}-${metric}`} />}
        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          {caption ?? "Reported observation history"} · {s.points.length} pts{monthly ? " · daily average, kt/day" : ""}{holes > 0 ? ` · ${holes} gap${holes === 1 ? "" : "s"} in the record` : ""}
        </p>
        <div className="mt-2 flex justify-between gap-2 font-mono text-[8px] text-[var(--ink-3)]"><span>{first.date.slice(0, 10)}</span><span>{last.date.slice(0, 10)}</span></div>
        <p className="mt-2 text-[10px] text-[var(--ink-2)]">{chartChange === null ? "Change unavailable from zero baseline" : `${chartChange >= 0 ? "+" : ""}${chartChange.toFixed(1)}% across displayed observations${monthly ? " · daily average" : ""}`}</p>
        {monthly && <p className="mt-2 text-[10px] text-[var(--ink-3)]">Jan–Feb totals use both months’ calendar days. Dates follow actual reporting periods.</p>}
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

/* Index ranges of consecutive observations. A step more than 2.5× the
   series' usual spacing is a hole in the record: the line stops there
   rather than implying a reading for the missing period. */
function sparkRuns(dates: string[]): [number, number][] {
  const t = dates.map(d => Date.parse(d));
  const steps = t.slice(1).map((v, i) => v - t[i]).filter(v => v > 0).sort((a, b) => a - b);
  const usual = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
  const runs: [number, number][] = [];
  let start = 0;
  for (let i = 1; i < t.length; i++) {
    if (usual > 0 && t[i] - t[i - 1] > usual * 2.5) { runs.push([start, i - 1]); start = i; }
  }
  runs.push([start, t.length - 1]);
  return runs;
}

/* tiny sparkline — mirrors OilTrackerCore's benchmark Spark, kept local
   so this component is fully self-contained. Plotted against real dates. */
function MiniSpark({ values, dates, id }: { values: number[]; dates: string[]; id: string }) {
  const w = 240,
    h = 36,
    pad = 2;
  const min = Math.min(...values),
    max = Math.max(...values);
  const t0 = Date.parse(dates[0]), span = Date.parse(dates[dates.length - 1]) - t0 || 1;
  const xy = values.map((v, i) => {
    const x = pad + ((Date.parse(dates[i]) - t0) / span) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return [x, y] as const;
  });
  const fmt = ([x, y]: readonly [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`corridor-spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={AMBER} stopOpacity="0.14" />
          <stop offset="100%" stopColor={AMBER} stopOpacity="0" />
        </linearGradient>
      </defs>
      {sparkRuns(dates).map(([a, b]) => {
        const run = xy.slice(a, b + 1);
        if (run.length === 1) return <circle key={a} cx={run[0][0]} cy={run[0][1]} r="1.4" fill={AMBER} fillOpacity="0.85" />;
        return <g key={a}>
          <polygon points={`${run[0][0].toFixed(1)},${h - pad} ${run.map(fmt).join(" ")} ${run[run.length - 1][0].toFixed(1)},${h - pad}`} fill={`url(#corridor-spark-${id})`} />
          <polyline points={run.map(fmt).join(" ")} fill="none" stroke={AMBER} strokeWidth="1" strokeOpacity="0.85" />
        </g>;
      })}
    </svg>
  );
}
