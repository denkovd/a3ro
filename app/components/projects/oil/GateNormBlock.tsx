"use client";
/* Norm context for one chokepoint, shown at the top of its detail panel:
   the reading against its reference norm, the gate's own typical range,
   where the reading ranks among past weeks, and the other norm as
   context. Describes traffic only. */
import { flowHealth } from "../oilTrackerShared";
import { formatEventDate } from "../intel/primitives";
import GateHistoryChart from "./GateHistoryChart";
import { GATE_NORM_DRIFT_PCT, gateArrow, gateBandText, gateColourRatio, gateRankText, gateShortfallText, gateStatusText, gateTier, gateTierText, gateTypicalText, tierMoveText } from "./gateSignal";
import { weeklyChangeText } from "./gateHistory";
import type { GateSignalRow } from "./types";

export default function GateNormBlock({ gate, unit = "vessels/d", className = "" }: { gate: GateSignalRow; unit?: string; className?: string }) {
  const s = gate.signal;
  const gap = gateShortfallText(s);
  const weekly = gate.change?.status === "insufficient" ? "not compared · fewer than 5 reported days in one of the two weeks" : weeklyChangeText(gate.change);
  const move = tierMoveText(gate.move);
  const colourRatio = gateColourRatio(s);
  const color = colourRatio !== null ? flowHealth(colourRatio) : "var(--ink-3)";
  const drift = !s.switched && s.ratio !== null && s.normYoyPct !== null && Math.abs(s.normYoyPct) >= GATE_NORM_DRIFT_PCT;
  const typical = gateTypicalText(s);
  const rank = gateRankText(s);
  const normRow = (mean: number, ratio: number | null, isRef: boolean) => `${mean.toFixed(1)} ${unit}${ratio !== null ? ` · reading is ${Math.round(ratio * 100)}%` : ""}${isRef ? " · reference" : ""}`;
  const rows: [string, string][] = [];
  if (s.value !== null) rows.push(["7-day reading", `${s.value.toFixed(1)} ${unit}${s.periodDate ? ` · ${formatEventDate(s.periodDate)}` : ""}`]);
  if (s.norm1y !== null) rows.push(["1-yr norm · mean", normRow(s.norm1y, s.ratio1y, s.ref === "1y")]);
  if (s.norm5y !== null) rows.push(["5-yr norm · mean", normRow(s.norm5y, s.ratio5y, s.ref === "5y")]);
  if (s.norm !== null && s.bandLow !== null && s.bandHigh !== null) rows.push(["Typical range", `${(s.norm * s.bandLow).toFixed(1)}–${(s.norm * s.bandHigh).toFixed(1)} ${unit}`]);
  if (rank) rows.push(["Among 7-day averages", rank]);
  if (s.ratio !== null && s.normYoyPct !== null) rows.push(["1-yr norm vs prior year", `${s.normYoyPct > 0 ? "+" : "−"}${Math.abs(s.normYoyPct).toFixed(1)}%`]);
  return <section aria-label="Traffic against norm" className={`border-l-2 pl-3 ${className}`} style={{ borderColor: color }}>
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Traffic vs norm</p>
    <p className="mt-2 flex items-baseline gap-2 text-lg text-[var(--ink)]">
      {gateArrow(s) && <span aria-hidden style={{ color }}>{gateArrow(s)}</span>}
      <span>{gateStatusText(s)}</span>
    </p>
    <p className="mt-1 text-[11px] text-[var(--ink-2)]">{gateTier(s) > 0 ? `${gateTierText(s)} · ${gap}` : gateBandText(s)}{typical ? ` · ${typical}` : ""}</p>
    {(weekly || move) && <p className="mt-2 text-[11px] text-[var(--ink)]">{move && <span className="mr-2 border border-[var(--line-2)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]">{move}</span>}{weekly && <>Week on week: {weekly}</>}</p>}
    {rows.length > 0 && <dl className="mt-3 space-y-1.5">
      {rows.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3"><dt className="text-[11px] text-[var(--ink-3)]">{k}</dt><dd className="text-right font-mono text-[11px] text-[var(--ink-2)]">{v}</dd></div>)}
    </dl>}
    {s.switched && s.normGapPct !== null && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">The 1-yr norm is {Math.abs(s.normGapPct).toFixed(0)}% {s.normGapPct < 0 ? "below" : "above"} the 5-yr norm, so the past year is itself out of line with the longer record. This gate is read against the 5-yr norm; the 1-yr figure is context.</p>}
    {drift && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">The 1-yr norm has itself moved {s.normYoyPct! > 0 ? "up" : "down"} {Math.abs(s.normYoyPct!).toFixed(0)}% on the year before, so it is a moving reference. Read it alongside the 5-yr norm.</p>}
    {s.bandBasis === "fixed" && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">This gate&apos;s own weekly spread is not on file yet, so its typical range is the fixed 85–115% band used for every gate.</p>}
    {s.bandBasis === "own" && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">The typical range is sized from how much this gate&apos;s 7-day average normally moves{s.rank ? ` (${s.rank.n.toLocaleString("en-US")} seven-day averages on record)` : ""}. The rank counts every one of them, so a long disruption is part of it.</p>}
    {s.state === "stale" && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">This reading is outside the source&apos;s publication window. It is not compared with the norm and does not describe current traffic.</p>}
    {s.state === "no-norm" && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">No current norm is on file for this gate, so the reading is shown without comparison.</p>}
    {s.state === "no-reading" && <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">No traffic reading is on file. That is an absence of data, not a statement about traffic.</p>}
    {s.state !== "no-reading" && <GateHistoryChart className="mt-4" id={gate.id} history={gate.history} signal={s} change={gate.change} />}
    <p className="mt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">IMF PortWatch publishes weekly, about four days behind the period it covers. Vessel counts describe traffic, not cargo volume or operating status.</p>
  </section>;
}
