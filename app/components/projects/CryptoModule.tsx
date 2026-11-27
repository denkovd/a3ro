"use client";
/* Homepage card for the Crypto module (roadmap #82): live figures from the daily DefiLlama snapshot. */
import { useEffect, useState } from "react";

export const CRYPTO_ROUTE = "/Projects/Crypto-Fundamentals";
export const CRYPTO_ACCENT = "#9ab8ff";

type Summary =
  | { status: "ready"; asOf: string; stablecoins: number | null; defiTvl: number | null; topFees: { name: string; fees30d: number | null } | null; ethShare: number | null; ethShare12mAgo: number | null }
  | { status: "empty" | "unavailable" | "loading" };

const money = (v: number | null | undefined) => v == null ? "—" : v >= 1e9 ? `$${(v / 1e9).toFixed(v >= 1e11 ? 0 : 1)}bn` : `$${(v / 1e6).toFixed(1)}m`;

export default function CryptoModule({ className = "" }: { className?: string }) {
  const [s, setS] = useState<Summary>({ status: "loading" });
  useEffect(() => {
    let live = true;
    fetch("/api/crypto/fundamentals").then((r) => r.json()).then((j) => { if (live) setS(j); }).catch(() => { if (live) setS({ status: "unavailable" }); });
    return () => { live = false; };
  }, []);
  const ready = s.status === "ready" ? s : null;
  const pending = s.status === "loading" ? "Loading…" : "Updates daily";
  const shift = ready && ready.ethShare !== null && ready.ethShare12mAgo !== null ? (ready.ethShare - ready.ethShare12mAgo) * 100 : null;
  const tiles = [
    { label: "Most fees paid · 30 days", value: ready?.topFees ? money(ready.topFees.fees30d) : "—", note: ready?.topFees?.name ?? pending },
    { label: "Ethereum's share of DeFi", value: ready?.ethShare != null ? `${(ready.ethShare * 100).toFixed(1)}%` : "—", note: shift !== null ? `${shift >= 0 ? "+" : "−"}${Math.abs(shift).toFixed(1)} pts in 12 months` : pending },
  ];
  return <a href={CRYPTO_ROUTE} className={`group relative flex flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] ${className}`}>
    <div className="flex-1 p-6 md:p-7">
      <p className="font-mono text-[10px] uppercase tracking-[.3em] text-[var(--ink-2)]">P·04 — <span style={{ color: CRYPTO_ACCENT }}>Module</span></p>
      <h3 className="mt-4 text-2xl font-semibold text-[var(--ink)]">Crypto</h3>
      <p className="mt-3 text-[13px] leading-6 text-[var(--ink-2)]">Who actually pays to use each network? Fees, revenue, value locked and stablecoins, measured the same way for every project.</p>
      <div className="mt-7 grid grid-cols-2 gap-3">{tiles.map((t) => <div key={t.label} className="border border-[var(--line)] p-3"><p className="text-[10px] text-[var(--ink-2)]">{t.label}</p><p className="mt-2 font-mono text-xl text-[var(--ink)]">{t.value}</p><p className="mt-2 text-[10px] text-[var(--ink-2)]">{t.note}</p></div>)}</div>
    </div>
    <div className="flex justify-between gap-3 px-5 py-4 hairline-t"><span className="text-sm text-[var(--ink)]">Usage scorecard · 16 projects</span><span className="font-mono text-[10px] text-[var(--ink-2)]">{ready ? `Data ${ready.asOf}` : "DefiLlama"} ↗</span></div>
  </a>;
}
