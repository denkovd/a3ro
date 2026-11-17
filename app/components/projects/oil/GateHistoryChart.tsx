"use client";
/* Daily tanker transits for one chokepoint, plotted against real dates.
   Dots are reported days; the line is the trailing 7-day average and is
   never drawn across a hole in the series; holes are hatched and listed.
   The shaded band is the gate's typical range around its reference norm
   (its own weekly swing when on file, otherwise the fixed 85–115%). */
import { formatEventDate } from "../intel/primitives";
import { type GateSignal } from "./gateSignal";
import { lineSegments, rollingMean, seriesGaps, type DailyPoint, type WeeklyChange } from "./gateHistory";

const W = 300, H = 110, PAD_L = 4, PAD_R = 4, PAD_T = 8, PAD_B = 14;
const DAY = 86_400_000;
const ms = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);

export default function GateHistoryChart({ id, history, signal, change, className = "" }: {
  id: string;
  history: { status: "loading" | "live" | "error"; points: DailyPoint[] };
  signal: GateSignal;
  change: WeeklyChange | null;
  className?: string;
}) {
  const points = history.points;
  if (history.status !== "live" || points.length < 2) {
    const msg = history.status === "loading" ? "Daily history · loading" : history.status === "error" ? "Daily history unavailable" : "Daily history accumulating · chart fills as data lands";
    return <p className={`font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)] ${className}`}>{msg}</p>;
  }

  const t0 = ms(points[0].date), t1 = ms(points[points.length - 1].date);
  const norm = signal.norm;
  const bandLow = signal.bandLow ?? 1, bandHigh = signal.bandHigh ?? 1;
  const normName = signal.ref === "5y" ? "5-yr" : "1-yr";
  const average = rollingMean(points);
  const gaps = seriesGaps(points);
  const top = Math.max(...points.map(p => p.value), norm !== null ? norm * bandHigh : 0, 1) * 1.06;
  const x = (date: string) => PAD_L + ((ms(date) - t0) / (t1 - t0 || 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => H - PAD_B - (v / top) * (H - PAD_T - PAD_B);
  const week = (from: string, to: string) => ({ x: x(from) - 0.8, w: Math.max(2, x(to) - x(from) + 1.6) });
  const thisWeek = change && change.current.mean !== null && ms(change.current.from) >= t0 ? week(change.current.from, change.current.to) : null;
  const lastWeek = change && change.prior.mean !== null && ms(change.prior.from) >= t0 ? week(change.prior.from, change.prior.to) : null;
  const latest = average.at(-1);
  const label = `Daily tanker transits, ${formatEventDate(points[0].date)} to ${formatEventDate(points[points.length - 1].date)}.`
    + (latest ? ` Latest 7-day average ${latest.value.toFixed(1)} a day.` : "")
    + (norm !== null ? ` ${normName} norm ${norm.toFixed(1)} a day, typical range ${(norm * bandLow).toFixed(1)} to ${(norm * bandHigh).toFixed(1)}.` : "")
    + (gaps.length ? ` ${gaps.length} period${gaps.length === 1 ? "" : "s"} with no data.` : "");

  return <figure className={className}>
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[110px] w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <pattern id={`gate-gap-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(232,235,232,0.22)" strokeWidth="1.2" />
        </pattern>
      </defs>
      {/* typical range and the reference norm */}
      {norm !== null && <>
        <rect x={PAD_L} y={y(norm * bandHigh)} width={W - PAD_L - PAD_R} height={Math.max(1, y(norm * bandLow) - y(norm * bandHigh))} fill="rgba(212,161,87,0.13)" />
        <line x1={PAD_L} x2={W - PAD_R} y1={y(norm)} y2={y(norm)} stroke="rgba(212,161,87,0.7)" strokeWidth="0.8" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </>}
      {/* the two weeks being compared */}
      {lastWeek && <rect x={lastWeek.x} y={PAD_T} width={lastWeek.w} height={H - PAD_T - PAD_B} fill="rgba(232,235,232,0.05)" />}
      {thisWeek && <rect x={thisWeek.x} y={PAD_T} width={thisWeek.w} height={H - PAD_T - PAD_B} fill="rgba(232,235,232,0.11)" />}
      {/* holes in the stored series */}
      {gaps.map(g => {
        // from the last reported day before the hole to the first one after it
        const a = x(new Date(ms(g.from) - DAY).toISOString()), b = x(new Date(ms(g.to) + DAY).toISOString());
        return <rect key={g.from} x={a + 1} y={PAD_T} width={Math.max(1.5, b - a - 2)} height={H - PAD_T - PAD_B} fill={`url(#gate-gap-${id})`} />;
      })}
      <line x1={PAD_L} x2={W - PAD_R} y1={y(0)} y2={y(0)} stroke="rgba(232,235,232,0.25)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      {/* reported days */}
      {points.map(p => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="1" fill="rgba(232,235,232,0.38)" />)}
      {/* trailing 7-day average, broken wherever the series has a hole */}
      {lineSegments(average).map(run => run.length > 1
        ? <polyline key={run[0].date} points={run.map(p => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")} fill="none" stroke="rgba(232,235,232,0.95)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        : <circle key={run[0].date} cx={x(run[0].date)} cy={y(run[0].value)} r="1.6" fill="rgba(232,235,232,0.95)" />)}
    </svg>
    <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] text-[var(--ink-3)]"><span>{formatEventDate(points[0].date)}</span><span>{formatEventDate(points[points.length - 1].date)}</span></div>
    <figcaption className="mt-2 space-y-1 text-[10px] leading-relaxed text-[var(--ink-3)]">
      <p>Dots: daily tanker transits. Line: 7-day average. {norm !== null ? `Band: typical range, ${Math.round(bandLow * 100)}–${Math.round(bandHigh * 100)}% of the ${normName} norm (${norm.toFixed(1)}/d, dashed)${signal.bandBasis === "own" ? ", sized from this gate's usual weekly swing." : "."}` : "No current norm on file, so no band is drawn."}{thisWeek ? ` Shaded column${lastWeek ? "s: this week and last week." : ": this week."}` : ""}</p>
      {gaps.length > 0 && <p>Hatched: no data stored for {gaps.map(g => `${formatEventDate(g.from)} – ${formatEventDate(g.to)} (${g.days} days)`).join("; ")}. A hole is missing data, not zero traffic.</p>}
    </figcaption>
  </figure>;
}
