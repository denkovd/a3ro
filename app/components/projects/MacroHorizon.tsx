"use client";

import { HORIZON_ACCENT, HORIZON_ROUTE, horizonNumber, useHorizonBaseline } from "./horizon/horizonData";

export default function MacroHorizon({ className = "" }: { className?: string }) {
  const { snapshot, loading } = useHorizonBaseline();
  const productivity = snapshot?.indicators.find(indicator => indicator.key === "productivity");
  const incomeShare = snapshot?.indicators.find(indicator => indicator.key === "income_bottom40");
  return <a href={HORIZON_ROUTE} className={`group relative flex flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] ${className}`}>
    <div className="flex-1 p-6 md:p-7"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-2)]">P·06 — <span style={{ color: HORIZON_ACCENT }}>Module</span></p><h3 className="mt-4 text-2xl font-semibold text-[var(--ink)]">Macro Horizon</h3><p className="mt-3 text-[13px] leading-6 text-[var(--ink-2)]">Can productive capacity become broadly shared prosperity? Follow the evidence from output to household income.</p>
      <div className="mt-7 grid grid-cols-2 gap-3"><div className="border border-[var(--line)] p-3"><p className="text-[10px] text-[var(--ink-2)]">Productivity · annual change</p><p className="mt-2 font-mono text-xl text-[var(--ink)]">{productivity?.annualChange == null ? "—" : `${productivity.annualChange > 0 ? "+" : ""}${productivity.annualChange.toFixed(1)}%`}</p><p className="mt-2 text-[10px] text-[var(--ink-2)]">{productivity?.latest?.period ?? (loading ? "Checking source…" : "Unavailable")}</p></div><div className="border border-[var(--line)] p-3"><p className="text-[10px] text-[var(--ink-2)]">Bottom 40% income share</p><p className="mt-2 font-mono text-xl text-[var(--ink)]">{horizonNumber(incomeShare?.latest?.value ?? null, "percent")}</p><p className="mt-2 text-[10px] text-[var(--ink-2)]">{incomeShare?.latest?.period ?? (loading ? "Checking source…" : "Unavailable")}</p></div></div>
    </div><div className="flex justify-between gap-3 px-5 py-4 hairline-t"><span className="text-sm text-[var(--ink)]">Stage 04 · Themes & expectations</span><span className="font-mono text-[10px] text-[var(--ink-2)]">2026–2046 ↗</span></div>
  </a>;
}
