"use client";
/* Norm context for one chokepoint, shown at the top of its detail panel:
   the reading, how it compares with the 1-year norm (which drives colour),
   and the 5-year norm and 1-year drift as context. Describes traffic only. */
import { flowHealth } from "../oilTrackerShared";
import { formatEventDate } from "../intel/primitives";
import { GATE_NORM_DRIFT_PCT, gateArrow, gateBandText, gateStatusText, type GateSignal } from "./gateSignal";

export default function GateNormBlock({ signal: s, unit = "vessels/d", className = "" }: { signal: GateSignal; unit?: string; className?: string }) {
  const color = s.ratio !== null ? flowHealth(s.ratio) : "var(--ink-3)";
  const drift = s.normYoyPct !== null && Math.abs(s.normYoyPct) >= GATE_NORM_DRIFT_PCT;
  const rows: [string, string][] = [];
  if (s.value !== null) rows.push(["7-day reading", `${s.value.toFixed(1)} ${unit}${s.periodDate ? ` · ${formatEventDate(s.periodDate)}` : ""}`]);
  if (s.norm1y !== null) rows.push(["1-yr norm · mean", `${s.norm1y.toFixed(1)} ${unit}`]);
  if (s.norm5y !== null && s.ratio5y !== null) rows.push(["5-yr norm · mean", `${s.norm5y.toFixed(1)} ${unit} · reading is ${Math.round(s.ratio5y * 100)}%`]);
  if (s.ratio !== null && s.normYoyPct !== null) rows.push(["1-yr norm vs prior year", `${s.normYoyPct > 0 ? "+" : "−"}${Math.abs(s.normYoyPct).toFixed(1)}%`]);
  return <section aria-label="Traffic against norm" className={`border-l-2 pl-3 ${className}`} style={{ borderColor: color }}>
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Traffic vs norm</p>
    <p className="mt-2 flex items-baseline gap-2 text-lg text-[var(--ink)]">
      {gateArrow(s) && <span aria-hidden style={{ color }}>{gateArrow(s)}</span>}
      <span>{gateStatusText(s)}</span>
    </p>
    <p className="mt-1 text-[11px] text-[var(--ink-2)]">{gateBandText(s)}{s.ratio !== null ? " · typical is 85–115% of the 1-yr norm" : ""}</p>
    {rows.length > 0 && <dl className="mt-3 space-y-1.5">
      {rows.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3"><dt className="text-[11px] text-[var(--ink-3)]">{k}</dt><dd className="text-right font-mono text-[11px] text-[var(--ink-2)]">{v}</dd></div>)}
    </dl>}
    {drift && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">The 1-yr norm has itself moved {s.normYoyPct! > 0 ? "up" : "down"} {Math.abs(s.normYoyPct!).toFixed(0)}% on the year before, so it is a moving reference. Read it alongside the 5-yr norm.</p>}
    {s.state === "stale" && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">This reading is outside the source&apos;s publication window. It is not compared with the norm and does not describe current traffic.</p>}
    {s.state === "no-norm" && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">No current norm is on file for this gate, so the reading is shown without comparison.</p>}
    {s.state === "no-reading" && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">No traffic reading is on file. That is an absence of data, not a statement about traffic.</p>}
    <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">IMF PortWatch publishes weekly, about four days behind the period it covers. Vessel counts describe traffic, not cargo volume or operating status.</p>
  </section>;
}
