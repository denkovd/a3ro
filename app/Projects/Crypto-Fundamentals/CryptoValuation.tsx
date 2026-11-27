"use client";
/* Crypto valuation (roadmap #83 / #84), Premium: market cap against fees and revenue. Market caps are
   market data (#18), so they load from /api/crypto/valuation, which middleware gates; free viewers see a peek. */
import { useEffect, useState } from "react";
import { LockIcon } from "../../components/LockIcon";

export interface ValuationRowMeta { id: string; name: string; symbol: string; groupLabel: string }
interface MonthPoint { month: string; value: number }
interface Row { id: string; mcap: number | null; fdv: number | null; fees30d: number | null; revenue30d: number | null; priceToFees: number | null; priceToRevenue: number | null; priceToFeesMonthly: MonthPoint[]; priceToRevenueMonthly: MonthPoint[] }
interface Bench { beta: number | null; correlation: number | null; r2: number | null }
type Period = Record<"d30" | "d90" | "d365", number | null>;
interface Basket { key: string; label: string; members: { id: string; symbol: string; name: string; mcap: number | null; return90d: number | null; betaToSol90d: number | null }[]; index: { t: number; v: number }[]; returns: { basket: Period; sol: Period; btc: Period }; vsSol: { d90: Bench; d365: Bench }; vsBtc: { d90: Bench; d365: Bench }; maxDrawdown365d: number | null }
type State = { kind: "loading" } | { kind: "locked" } | { kind: "error" } | { kind: "ready"; asOf: string; cryptoMcap: number | null; stablecoins: number | null; projects: Row[]; baskets: Basket[] };

const pc = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}%`);
const n2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));

function IndexLine({ pts }: { pts: { t: number; v: number }[] }) {
  if (pts.length < 3) return null;
  const W = 320, H = 90, lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v)), span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * (W - 40), y = (v: number) => 6 + (1 - (v - lo) / span) * (H - 18);
  const end = pts[pts.length - 1].v;
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-sm" role="img" aria-label={`Basket index over 12 months, started at 100, now ${end.toFixed(0)}`}>
    <line x1="0" x2={W - 40} y1={y(100)} y2={y(100)} stroke="var(--line)" strokeDasharray="3 3" />
    <polyline points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} fill="none" stroke={end >= 100 ? "#b8e278" : "#f0b35a"} strokeWidth="1.5" />
    <text x={W - 36} y={y(end) + 3} fontSize="10" fill="var(--ink-2)">{end.toFixed(0)}</text>
    <text x="0" y={H - 1} fontSize="8" fill="var(--ink-3)">12 months ago = 100</text>
  </svg>;
}

function BasketCard({ b }: { b: Basket }) {
  return <div className="flex flex-col gap-3 rounded-sm border border-[var(--line)] p-4">
    <div className="flex items-baseline justify-between gap-3"><h3 className="text-sm font-medium">{b.label}</h3><span className="text-[10px] text-[var(--ink-3)]">equal weight · daily</span></div>
    <IndexLine pts={b.index} />
    <table className="w-full text-right font-mono text-xs"><thead><tr className="text-[10px] text-[var(--ink-3)]"><th className="text-left font-normal" /><th className="font-normal">30 d</th><th className="font-normal">90 d</th><th className="font-normal">1 yr</th></tr></thead>
      <tbody>{([["Basket", b.returns.basket], ["SOL", b.returns.sol], ["BTC", b.returns.btc]] as const).map(([k, r]) => <tr key={k}><td className="text-left text-[var(--ink-2)]">{k}</td><td>{pc(r.d30)}</td><td>{pc(r.d90)}</td><td>{pc(r.d365)}</td></tr>)}</tbody></table>
    <table className="w-full text-right font-mono text-xs"><thead><tr className="text-[10px] text-[var(--ink-3)]"><th className="text-left font-normal">Against</th><th className="font-normal">Beta 90 d</th><th className="font-normal">Beta 1 yr</th><th className="font-normal">Corr.</th><th className="font-normal">R²</th></tr></thead>
      <tbody>{([["SOL", b.vsSol], ["BTC", b.vsBtc]] as const).map(([k, v]) => <tr key={k}><td className="text-left text-[var(--ink-2)]">{k}</td><td>{n2(v.d90.beta)}</td><td>{n2(v.d365.beta)}</td><td>{n2(v.d365.correlation)}</td><td>{n2(v.d365.r2)}</td></tr>)}</tbody></table>
    <p className="text-[10px] text-[var(--ink-3)]">Worst fall from a high, last 12 months: <span className="font-mono text-[var(--ink-2)]">{pc(b.maxDrawdown365d)}</span></p>
    <details><summary className="cursor-pointer text-[10px] text-[var(--ink-3)]">Members ({b.members.length})</summary>
      <ul className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 font-mono text-[11px]">{b.members.map((m) => <li key={m.id} className="contents"><span className="truncate font-sans text-[var(--ink-2)]">{m.name} <span className="text-[var(--ink-3)]">{m.symbol}</span></span><span className="text-right">{pc(m.return90d)}</span><span className="text-right text-[var(--ink-3)]">β {n2(m.betaToSol90d)}</span></li>)}</ul>
      <p className="mt-1 text-[10px] text-[var(--ink-3)]">90-day return and beta to SOL.</p>
    </details>
  </div>;
}

const money = (v: number | null) => v == null ? "—" : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}tn` : v >= 1e9 ? `$${(v / 1e9).toFixed(v >= 1e11 ? 0 : 1)}bn` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}m` : `$${(v / 1e3).toFixed(0)}k`;
const times = (v: number | null) => v == null ? "—" : v >= 10000 ? ">10,000×" : v >= 100 ? `${Math.round(v).toLocaleString("en-AU")}×` : `${v.toFixed(1)}×`;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" });

function Trend({ pts }: { pts: MonthPoint[] }) {
  const last = pts.slice(-12).filter((p) => Number.isFinite(p.value) && p.value > 0);
  if (last.length < 3) return <span className="text-[var(--ink-3)]">—</span>;
  const logs = last.map((p) => Math.log10(p.value)), lo = Math.min(...logs), hi = Math.max(...logs), span = hi - lo || 1;
  const w = 84, h = 22, x = (i: number) => (i / (last.length - 1)) * (w - 2) + 1, y = (v: number) => h - 2 - ((v - lo) / span) * (h - 4);
  const first = last[0].value, end = last[last.length - 1].value;
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Price-to-fees ${monthLabel(last[0].month)} ${times(first)}, ${monthLabel(last[last.length - 1].month)} ${times(end)}`}>
    <polyline points={logs.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={end <= first ? "#b8e278" : "#f0b35a"} strokeWidth="1.5" />
    <title>{`${monthLabel(last[0].month)}: ${times(first)} → ${monthLabel(last[last.length - 1].month)}: ${times(end)}`}</title>
  </svg>;
}

export default function CryptoValuation({ meta }: { meta: ValuationRowMeta[] }) {
  const [s, setS] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    fetch("/api/crypto/valuation", { cache: "no-store" }).then(async (r) => {
      if (!live) return;
      if (r.status === 401 || r.status === 403) return setS({ kind: "locked" });
      const j = await r.json();
      setS(j.status === "ready" ? { kind: "ready", ...j } : { kind: "error" });
    }).catch(() => { if (live) setS({ kind: "error" }); });
    return () => { live = false; };
  }, []);

  return <section aria-label="Valuation" className="flex flex-col gap-3">
    <h2 className="landing-kicker inline-flex items-center gap-2">Valuation: price against usage <span className="rounded-sm border border-[var(--line)] px-1.5 py-0.5 text-[9px] tracking-[0.2em]">Premium</span></h2>
    <p className="max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">
      Like a P/E ratio: market cap divided by a year of fees (price-to-fees) or of revenue the project keeps (price-to-revenue), at the last 30 days&rsquo; pace.
      Lower means you pay less for each dollar of real usage. The trend shows the last 12 months: green when the token got cheaper against its usage, amber when dearer.
    </p>
    {s.kind === "locked" ? <div className="relative overflow-hidden rounded-sm border border-[var(--line)]">
      <div aria-hidden className="pointer-events-none select-none p-4 opacity-30 blur-[3px]">
        {meta.slice(0, 5).map((m, i) => <div key={m.id} className="flex justify-between border-b border-[var(--line)] py-2 font-mono text-sm"><span>{m.name}</span><span>{["$1.4tn", "$412bn", "$88.2bn", "$15.1bn", "$11.7bn"][i]}</span><span>{["1,920×", "1,710×", "542×", "12.4×", "98×"][i]}</span></div>)}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgba(6,7,7,0.55)] p-4 text-center">
        <p className="inline-flex items-center gap-2 text-sm text-[var(--ink)]"><LockIcon title="Premium" /> Part of A3RO Premium</p>
        <p className="max-w-md text-xs text-[var(--ink-2)]">Market cap against fees and revenue for every project, with 12 months of history, stablecoins&rsquo; share of the whole crypto market, and the Solana and memecoin high-beta baskets.</p>
        <a href="/private?module=crypto-valuation&next=/Projects/Crypto-Fundamentals" className="mt-1 rounded-sm border border-[var(--line-2)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink)]">See Premium</a>
      </div>
    </div>
    : s.kind === "loading" ? <p className="text-xs text-[var(--ink-3)]">Loading…</p>
    : s.kind === "error" ? <p className="text-xs text-[var(--ink-3)]">Valuation data isn&rsquo;t available right now.</p>
    : <>
      <dl className="grid grid-cols-2 gap-4 border-y border-[var(--line)] py-4 sm:grid-cols-3">
        <div><dt className="text-xs text-[var(--ink-3)]">Total crypto market cap</dt><dd className="mt-1 font-mono text-xl">{money(s.cryptoMcap)}</dd></div>
        <div><dt className="text-xs text-[var(--ink-3)]">Stablecoins&rsquo; share of it</dt><dd className="mt-1 font-mono text-xl">{s.cryptoMcap && s.stablecoins ? `${((s.stablecoins / s.cryptoMcap) * 100).toFixed(1)}%` : "—"}</dd>
          <dd className="text-[10px] text-[var(--ink-3)]">Rising in a sell-off = money parked on the sidelines</dd></div>
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead><tr className="border-b border-[var(--line)] text-xs text-[var(--ink-3)]">
            <th className="py-2 pr-3 font-normal">Project</th><th className="py-2 pr-3 text-right font-normal">Market cap</th><th className="py-2 pr-3 text-right font-normal">Fully diluted</th>
            <th className="py-2 pr-3 text-right font-normal">Price ÷ fees</th><th className="py-2 pr-3 text-right font-normal">Price ÷ revenue</th><th className="py-2 pr-3 font-normal">Price ÷ fees, 12 months</th>
          </tr></thead>
          <tbody>{meta.map((m) => {
            const r = s.projects.find((p) => p.id === m.id);
            if (!r || r.mcap == null) return null;
            return <tr key={m.id} className="border-b border-[var(--line)]">
              <td className="py-2.5 pr-3"><span className="font-medium">{m.name}</span> <span className="font-mono text-xs text-[var(--ink-3)]">{m.symbol}</span><span className="block text-[10px] text-[var(--ink-3)]">{m.groupLabel}</span></td>
              <td className="py-2.5 pr-3 text-right font-mono">{money(r.mcap)}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-[var(--ink-2)]">{money(r.fdv)}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{times(r.priceToFees)}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{times(r.priceToRevenue)}</td>
              <td className="py-2.5 pr-3"><Trend pts={r.priceToFeesMonthly} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {s.baskets?.length ? <div className="mt-4 flex flex-col gap-3">
        <h3 className="landing-kicker">High-beta baskets</h3>
        <p className="max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">The ten largest Solana tokens and the five largest memecoins, each held in equal amounts, against SOL and BTC. The memecoin basket is a gauge of speculative appetite, not a trade idea: most memecoins lose almost all their value. Beta 2 means the basket has tended to move twice as far as the benchmark on the same day, both up and down; R² shows how much of its movement the benchmark explains. Stablecoins and staked or wrapped tokens are left out.</p>
        <div className="grid gap-4 md:grid-cols-2">{s.baskets.map((b) => <BasketCard key={b.key} b={b} />)}</div>
        <p className="text-[10px] text-[var(--ink-3)]">Still to come: how new memecoins perform over their first 40 days (needs launch-by-launch data).</p>
      </div> : null}
      <p className="text-[10px] text-[var(--ink-3)]">Market caps and prices: <a className="underline" href="https://www.coingecko.com" target="_blank" rel="noreferrer">CoinGecko</a>, as of {s.asOf}. Fees and revenue: DefiLlama. A project with no revenue shows —. Compare within a group: a payments chain and a trading exchange earn in different ways. General information, not a recommendation.</p>
    </>}
  </section>;
}
