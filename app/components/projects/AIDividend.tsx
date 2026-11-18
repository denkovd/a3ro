"use client";

import { DIVIDEND_ACCENT, DIVIDEND_ROUTE, useDividendBaseline } from "./dividend/dividendData";
import { DIVIDEND_CURRENT_STEP, DIVIDEND_OUTLOOK_END_YEAR } from "../../../backend/src/dividend/framework";
import type { DividendRead } from "../../../backend/src/dividend/types";

function annualChange(indicator: DividendRead | undefined): string {
  return indicator?.annualChange == null ? "—" : `${indicator.annualChange > 0 ? "+" : ""}${indicator.annualChange.toFixed(1)}%`;
}

export default function AIDividend({ className = "" }: { className?: string }) {
  const { snapshot, loading } = useDividendBaseline();
  const tiles = [
    { key: "productivity", label: "Output per hour · annual change" },
    { key: "real_compensation", label: "Real hourly pay · annual change" },
  ].map(tile => ({ ...tile, indicator: snapshot?.indicators.find(indicator => indicator.key === tile.key) }));
  return <a href={DIVIDEND_ROUTE} className={`group relative flex flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] ${className}`}>
    <div className="flex-1 p-6 md:p-7"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-2)]">P·06 — <span style={{ color: DIVIDEND_ACCENT }}>Module</span></p><h3 className="mt-4 text-2xl font-semibold text-[var(--ink)]">AI Dividend</h3><p className="mt-3 text-[13px] leading-6 text-[var(--ink-2)]">AI capability is rising fast. How much of it becomes real output, and who captures the value?</p>
      <div className="mt-7 grid grid-cols-2 gap-3">{tiles.map(tile => <div key={tile.key} className="border border-[var(--line)] p-3"><p className="text-[10px] text-[var(--ink-2)]">{tile.label}</p><p className="mt-2 font-mono text-xl text-[var(--ink)]">{annualChange(tile.indicator)}</p><p className="mt-2 text-[10px] text-[var(--ink-2)]">{tile.indicator?.latest?.period ?? (loading ? "Checking source…" : "Unavailable")}</p></div>)}</div>
    </div><div className="flex justify-between gap-3 px-5 py-4 hairline-t"><span className="text-sm text-[var(--ink)]">Build {DIVIDEND_CURRENT_STEP} of 5 · Workers & households</span><span className="font-mono text-[10px] text-[var(--ink-2)]">2026–{DIVIDEND_OUTLOOK_END_YEAR} ↗</span></div>
  </a>;
}
