"use client";
import { AU_ACCENT, AU_ROUTE, displayValue, useAustraliaWatch } from "./australia/australiaWatchData";

export default function AustraliaWatch({ className = "" }: { className?: string }) {
  const { observations, status } = useAustraliaWatch();
  const latest = Object.values(observations.reduce<Record<string, typeof observations[0]>>((a, o) => (!a[o.indicator] || a[o.indicator].referencePeriod < o.referencePeriod ? { ...a, [o.indicator]: o } : a), {}));
  return <a href={AU_ROUTE} className={`group relative flex flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] ${className}`}>
    <div className="flex-1 p-6 md:p-7"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-3)]">P·09 — <span style={{ color: AU_ACCENT }}>Module</span></p><h3 className="mt-4 text-2xl font-semibold text-[var(--ink)]">Australia Watch</h3><p className="mt-2 text-[13px] text-[var(--ink-2)]">Australian macro conditions — observation-led, no signal.</p>
      {status !== "ready" ? <p className="mt-8 font-mono text-[10px] uppercase text-[var(--ink-3)]">{status === "error" ? "Feed unreachable" : "Connecting"}</p> : <div className="mt-7 grid grid-cols-2 gap-3">{latest.map((o) => <div key={o.indicator} className="border border-[var(--line)] p-3"><p className="font-mono text-[9px] uppercase text-[var(--ink-3)]">{o.indicator === "hours_worked" ? "Hours" : o.indicator.includes("cpi") ? "CPI" : "Unemployment"}</p><p className="mt-1 text-lg text-[var(--ink)]">{displayValue(o)}</p><p className="font-mono text-[9px] text-[var(--ink-3)]">{o.referencePeriod}</p></div>)}</div>}</div>
    <div className="flex justify-between px-5 py-4 hairline-t"><span className="text-sm text-[var(--ink)]">A3RO Intelligence — Australia Watch</span><span className="font-mono text-[10px] uppercase text-[var(--ink-3)]">ABS macro</span></div>
  </a>;
}
