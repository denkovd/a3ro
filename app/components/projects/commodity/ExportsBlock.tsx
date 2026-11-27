"use client";
/* ────────────────────────────────────────────────────────────────
   Commodity Watch — Australia's exports of one commodity, live from
   the ABS (shared section template, #55 / #56). Latest month, last
   12 months, 36 months of bars, destinations, and (when the commodity
   has several) the split by product and by state.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Stat, pct, rowBtn } from "./RailKit";
import { periodLabel, type CommodityExports } from "../../../../lib/commodity/absExports";

export type Loadable<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

/** Fetches a JSON endpoint once; aborts on unmount. */
export function useJson<T>(url: string, label: string): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: T) => setState({ status: "ok", data }))
      .catch((e) => { if (!ctrl.signal.aborted) { console.warn(`[${label}] unavailable`, e); setState({ status: "error" }); } });
    return () => ctrl.abort();
  }, [url, label]);
  return state;
}

export const audBn = (audM: number) => (Math.abs(audM) >= 1000 ? `A$${(audM / 1000).toFixed(1)}bn` : `A$${Math.round(audM)}m`);
const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

/** Monthly export value as bars, last 36 months; stacked when there are several products. */
export function ExportBars({ data, colors }: { data: CommodityExports; colors: readonly string[] }) {
  const months = data.months.slice(-36);
  const codes = data.sitcLast12.map((s) => s.code);
  const max = Math.max(...months.map((m) => m.totalAudM), 1e-9);
  const W = 300, H = 56, gap = 1, bw = (W - gap * (months.length - 1)) / months.length;
  return <figure className="mt-2">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" role="img" aria-label={`Monthly export value, ${periodLabel(months[0].period)} to ${periodLabel(months[months.length - 1].period)}; latest ${audBn(months[months.length - 1].totalAudM)}`}>
      {months.map((m, i) => {
        let y = H;
        const last = i === months.length - 1;
        return <g key={m.period}><title>{`${periodLabel(m.period)}: ${audBn(m.totalAudM)}`}</title>
          {codes.map((c, k) => {
            const h = (m.bySitc[c] ?? 0) / max * (H - 2);
            y -= h;
            return h > 0 ? <rect key={c} x={i * (bw + gap)} y={y} width={bw} height={h} fill={colors[k % colors.length]} opacity={last ? 0.95 : 0.45} /> : null;
          })}
        </g>;
      })}
    </svg>
    <figcaption className="mt-1 flex justify-between font-mono text-[9px] text-[var(--ink-3)]"><span>{periodLabel(months[0].period)}</span><span>{periodLabel(months[months.length - 1].period)}</span></figcaption>
    {codes.length > 1 ? <p className="mt-1 flex flex-wrap gap-x-3 text-[9px] text-[var(--ink-3)]">{data.sitcLast12.map((s, k) => <span key={s.code} className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-2 w-2" style={{ background: colors[k % colors.length] }} />{s.label} · {pct(s.share)}</span>)}</p> : null}
  </figure>;
}

export default function ExportsBlock({ state, accent, colors, focus, fallback, sourceUrl, sourceLabel, footnote }: {
  state: Loadable<CommodityExports>;
  accent: string;
  /** One colour per SITC code, in spec order. */
  colors: readonly string[];
  focus: (id: string) => void;
  /** Shown when the ABS can't be reached. */
  fallback: ReactNode;
  sourceUrl: string;
  sourceLabel: string;
  footnote?: ReactNode;
}) {
  if (state.status === "loading") return <p className="mt-2 text-[11px] text-[var(--ink-3)]">Loading ABS export figures…</p>;
  if (state.status === "error") return <>
    <p className="mt-2 border-l-2 border-[var(--line)] pl-3 text-[11px] text-[var(--ink-3)]">The ABS figures could not be loaded just now.</p>
    {fallback}
  </>;
  const d = state.data;
  const latest = d.months[d.months.length - 1];
  const yearAgo = d.months.find((m) => m.period === `${Number(d.latestPeriod.slice(0, 4)) - 1}${d.latestPeriod.slice(4)}`);
  // Values the ABS keeps confidential come back as nil; leave those breakdowns out rather than show zeros.
  const states = d.states.filter((s) => s.share > 0.001);
  const dests = d.destinations.filter((x) => x.share > 0.001);
  return <>
    <dl className="mt-2 grid grid-cols-2 gap-3">
      <Stat label={periodLabel(d.latestPeriod)} value={audBn(latest.totalAudM)} sub={yearAgo && yearAgo.totalAudM > 0 ? `${signed(latest.totalAudM / yearAgo.totalAudM - 1)} on a year earlier` : undefined} />
      <Stat label="Last 12 months" value={audBn(d.last12AudM)} sub={d.prior12AudM ? `${signed(d.last12AudM / d.prior12AudM - 1)} on the 12 before` : undefined} />
    </dl>
    <ExportBars data={d} colors={colors} />
    {dests.length ? <>
    <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-3)]">Where it goes · last 12 months</p>
    <ul className="mt-1 divide-y divide-[var(--line)]">
      {dests.map((x) => <li key={x.code}><button type="button" onClick={() => focus(`flow:${x.code}`)} className={rowBtn}>
        <span className="font-mono text-[10px] text-[var(--ink)]">{x.name}</span>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: accent }}>{pct(x.share)} · {audBn(x.last12AudM)}</span>
      </button></li>)}
      {d.otherLast12AudM > 0 ? <li className="flex items-center justify-between px-1 py-2"><span className="font-mono text-[10px] text-[var(--ink-3)]">Other</span><span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">{pct(d.otherLast12AudM / d.last12AudM)}</span></li> : null}
    </ul>
    </> : null}
    {states.length > 1 ? <>
      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-3)]">Shipped from · last 12 months</p>
      <dl className="mt-1 grid grid-cols-2 gap-2">{states.map((s) => <Stat key={s.code} label={s.name} value={pct(s.share)} sub={audBn(s.last12AudM)} />)}</dl>
    </> : null}
    <p className="mt-2 text-[10px] leading-relaxed text-[var(--ink-3)]">
      {states.length === 1 ? `${states[0].name} ships ${pct(states[0].share)} of it. ` : ""}A$ value, original terms (not seasonally adjusted). The ABS publishes about five weeks after each month ends; values it keeps confidential count as nil.
      {footnote ? <> {footnote}</> : null} The goods trade balance is on <Link href="/Projects/Australia-Watch" className="underline" style={{ color: accent }}>Australia Watch</Link>.
    </p>
    <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] underline" style={{ color: accent }}>{sourceLabel} ↗</a>
  </>;
}
