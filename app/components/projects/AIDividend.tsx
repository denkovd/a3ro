"use client";

import { DIVIDEND_ACCENT, DIVIDEND_ROUTE } from "./dividend/dividendData";
import { monthYear, usd, useValueChain } from "./dividend/valueChainData";
import { DIVIDEND_OUTLOOK_END_YEAR } from "../../../backend/src/dividend/framework";

export default function AIDividend({ className = "" }: { className?: string }) {
  const { data, loading } = useValueChain();
  const hyperscalers = data?.layers.find(layer => layer.layer === "hyperscalers");
  const labs = data?.labs.filter(lab => lab.operatingIncome != null) ?? [];
  const labsResult = labs.length ? labs.reduce((total, lab) => total + lab.operatingIncome!, 0) : null;
  const pending = loading ? "Checking filings…" : "Unavailable";
  const tiles = [
    { label: "Hyperscaler capex · last 12 months", value: usd(hyperscalers?.capex), note: hyperscalers?.periodRange ? `To ${monthYear(hyperscalers.periodRange.to)}` : pending },
    { label: "Frontier labs · operating result", value: usd(labsResult), note: labs.length ? `${labs.map(lab => lab.name).join(" + ")} · latest 12 months` : pending },
  ];
  return <a href={DIVIDEND_ROUTE} className={`group relative flex flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] ${className}`}>
    <div className="flex-1 p-6 md:p-7"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-2)]">P·02 — <span style={{ color: DIVIDEND_ACCENT }}>Module</span></p><h3 className="mt-4 text-2xl font-semibold text-[var(--ink)]">AI Dividend</h3><p className="mt-3 text-[13px] leading-6 text-[var(--ink-2)]">AI capability is rising fast. How much of it becomes real output, and who captures the value?</p>
      <div className="mt-7 grid grid-cols-2 gap-3">{tiles.map(tile => <div key={tile.label} className="border border-[var(--line)] p-3"><p className="text-[10px] text-[var(--ink-2)]">{tile.label}</p><p className="mt-2 font-mono text-xl text-[var(--ink)]">{tile.value}</p><p className="mt-2 text-[10px] text-[var(--ink-2)]">{tile.note}</p></div>)}</div>
    </div><div className="flex justify-between gap-3 px-5 py-4 hairline-t"><span className="text-sm text-[var(--ink)]">All 5 stages live</span><span className="font-mono text-[10px] text-[var(--ink-2)]">2026–{DIVIDEND_OUTLOOK_END_YEAR} ↗</span></div>
  </a>;
}
