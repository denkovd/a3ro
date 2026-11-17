"use client";
/* Map key for the globe: what each mark's colour, outline and line style
   means. Every colour is paired with a shape, arrow or word so the key
   (and the marks it explains) never relies on colour alone. */
import { flowHealth } from "../oilTrackerShared";

const INK_DIM = "rgba(232,235,232,0.5)";

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: color }} />;
}

function Ring({ dashed = false }: { dashed?: boolean }) {
  return <svg aria-hidden viewBox="0 0 10 10" className="h-[10px] w-[10px] shrink-0"><circle cx="5" cy="5" r="3.6" fill="none" stroke={INK_DIM} strokeWidth="1.2" strokeDasharray={dashed ? "2 1.6" : undefined} /></svg>;
}

function Line({ color, dashed = false, pulse = false }: { color: string; dashed?: boolean; pulse?: boolean }) {
  return <svg aria-hidden viewBox="0 0 22 6" className="h-[6px] w-[22px] shrink-0">
    <line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="1.4" strokeDasharray={dashed ? "3 3" : undefined} />
    {pulse && <line x1="12" y1="3" x2="18" y2="3" stroke="rgba(232,190,120,0.95)" strokeWidth="2.4" strokeLinecap="round" />}
  </svg>;
}

const BANDS = [
  { color: flowHealth(0.5), label: "Below 85%", short: "<85%", arrow: "▼" },
  { color: flowHealth(1), label: "85–115%", short: "85–115%", arrow: "" },
  { color: flowHealth(1.5), label: "Above 115%", short: ">115%", arrow: "▲" },
];

export default function FlowHealthLegend({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  if (compact) {
    return <div role="note" aria-label="Map key: gate tanker traffic against its one-year norm" className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-2)] ${className}`}>
      {BANDS.map(b => <span key={b.short} className="flex items-center gap-[5px]"><Dot color={b.color} />{b.short}{b.arrow && <span aria-hidden>{b.arrow}</span>}</span>)}
      <span className="flex items-center gap-[5px]"><Ring />No reading</span>
    </div>;
  }
  return <div role="note" aria-label="Map key" className={className}>
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Gate traffic vs 1-yr norm</p>
    <ul className="mt-2 space-y-[5px] font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
      {BANDS.map(b => <li key={b.label} className="flex items-center gap-2"><Dot color={b.color} /><span>{b.label}{b.arrow && <span aria-hidden> {b.arrow}</span>}</span></li>)}
      <li className="flex items-center gap-2"><Ring /><span>No current reading</span></li>
      <li className="flex items-center gap-2"><Ring dashed /><span>Stale reading</span></li>
    </ul>
    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Routes · illustrative paths</p>
    <ul className="mt-2 space-y-[5px] font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-2)]">
      <li className="flex items-center gap-2"><Line color="rgba(212,161,87,0.75)" pulse /><span>Gates at or above norm</span></li>
      <li className="flex items-center gap-2"><Line color={flowHealth(0.5)} dashed /><span>A gate below norm</span></li>
      <li className="flex items-center gap-2"><Line color={INK_DIM} /><span>No gate reading</span></li>
    </ul>
    <p className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
      <svg aria-hidden viewBox="0 0 10 10" className="h-[10px] w-[10px] shrink-0"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="rgba(232,235,232,0.35)" strokeWidth="1" /></svg>
      Refinery · status unverified
    </p>
  </div>;
}
