"use client";
// Free crypto usage panel on a coin's asset page (#38): what users pay to use the network, from the
// Crypto module's open DefiLlama data (/api/crypto/usage). No prices or market caps.
import { useEffect, useState } from "react";

interface Usage {
  status: string; asOf: string; name: string; role: string; chain: boolean;
  fees30d: number | null; revenue30d: number | null; tvl: number | null; tvlShare: number | null;
  stablecoins: number | null; stablecoinShare: number | null;
}

const money = (v: number | null) => v === null ? "—" : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}bn` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}m` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`;
const share = (v: number | null) => (v === null ? null : `${(v * 100).toFixed(1)}%`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return <div><p className="text-xs text-[var(--ink-3)]">{label}</p><p className="mt-1 font-mono text-lg text-[var(--ink)]">{value}</p>{sub ? <p className="text-[11px] text-[var(--ink-3)]">{sub}</p> : null}</div>;
}

export function CryptoUsage({ projectId, ticker }: { projectId: string; ticker: string }) {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/crypto/usage?id=${encodeURIComponent(projectId)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.status === "ready") setU(j); }).catch(() => {});
    return () => { live = false; };
  }, [projectId]);
  if (!u) return null;
  return <section aria-labelledby="crypto-usage" className="flex max-w-3xl flex-col gap-4 rounded-sm border border-[var(--line)] p-5">
    <p className="landing-kicker">Crypto · who pays to use it · {u.asOf}</p>
    <h2 id="crypto-usage" className="text-lg font-medium">How much {u.name} is used</h2>
    <p className="text-sm leading-relaxed text-[var(--ink-2)]">{u.role}</p>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat label="Fees, 30 days" value={money(u.fees30d)} sub={u.fees30d !== null ? `${money((u.fees30d * 365) / 30)} a year` : null} />
      <Stat label="Revenue, 30 days" value={money(u.revenue30d)} sub="kept by the project" />
      {u.chain && u.tvl !== null ? <Stat label="Value locked" value={money(u.tvl)} sub={share(u.tvlShare) ? `${share(u.tvlShare)} of DeFi` : null} /> : null}
      {u.chain && u.stablecoins !== null ? <Stat label="Stablecoins held" value={money(u.stablecoins)} sub={share(u.stablecoinShare) ? `${share(u.stablecoinShare)} of all` : null} /> : null}
    </div>
    <p className="text-xs text-[var(--ink-3)]">DefiLlama open data, updated daily. Usage, not price: {ticker} can rise or fall whatever these show.</p>
    <a href="/Projects/Crypto-Fundamentals" className="text-sm text-[var(--acid)]">Compare every network in Crypto →</a>
  </section>;
}
