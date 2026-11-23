// Part-to-whole charts for /markets (roadmap #68 / #69). Server-rendered HTML: a segmented bar for
// the whole at a glance, ranked bars to compare the parts. Colours: validated dark categorical
// palette (6 slots, fixed order, never cycled); text always in ink tokens, never the series colour.
import type { AssetClass, CurrencyShare } from "../../lib/globalMarkets";

/** Dark categorical slots 1–6 (dataviz reference palette), validated on #060707. */
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"];
const pct = (n: number) => `${n < 1 ? n.toFixed(1) : n < 10 ? n.toFixed(1) : Math.round(n)}%`;
const tn = (n: number) => `$${n >= 10 ? Math.round(n) : n.toFixed(1)}T`;

export function WorldAssetsChart({ assets }: { assets: readonly AssetClass[] }) {
  const total = assets.reduce((s, a) => s + a.valueTn, 0);
  const rows = assets.map((a, i) => ({ ...a, color: SERIES[i % SERIES.length], share: (a.valueTn / total) * 100 }));
  const max = Math.max(...rows.map((r) => r.valueTn));
  return <figure aria-label="World assets by class">
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Total, all classes shown</p>
    <p className="mt-1 text-4xl font-semibold tracking-tight text-[var(--ink)]">≈ {tn(total)}</p>

    {/* The whole: one segmented bar, 2px gaps, figure printed where the segment is wide enough */}
    <div className="mt-5 flex h-14 w-full gap-[2px]" role="img" aria-label={rows.map((r) => `${r.label} ${pct(r.share)}`).join(", ")}>
      {rows.map((r, i) => <div key={r.id} title={`${r.label}: ${tn(r.valueTn)} · ${pct(r.share)} (${r.source}, ${r.asOf})`}
        className={`flex min-w-[3px] items-end overflow-hidden px-2 pb-1.5 ${i === 0 ? "rounded-l-[4px]" : ""} ${i === rows.length - 1 ? "rounded-r-[4px]" : ""}`}
        style={{ width: `${r.share}%`, background: r.color }}>
        {r.share >= 7 ? <span className="font-mono text-[11px] font-medium text-[#060707]">{pct(r.share)}</span> : null}
      </div>)}
    </div>
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--ink-2)]" aria-label="Legend">
      {rows.map((r) => <li key={r.id} className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: r.color }} />{r.label}</li>)}
    </ul>

    {/* The parts: ranked bars on one baseline, figures beside them */}
    <table className="mt-6 w-full text-xs">
      <caption className="sr-only">World assets by class, US dollars</caption>
      <thead><tr className="text-left text-[var(--ink-3)]"><th className="pb-2 font-normal">Asset class</th><th className="hidden pb-2 font-normal sm:table-cell" /><th className="pb-2 text-right font-normal">Value</th><th className="pb-2 text-right font-normal">Share</th><th className="hidden pb-2 pl-4 font-normal md:table-cell">Source</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-[var(--line)] align-middle" title={r.note}>
        <td className="py-2 pr-3"><span className="flex items-center gap-2"><span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: r.color }} />{r.label}</span></td>
        <td className="hidden w-[40%] py-2 pr-3 sm:table-cell"><div className="h-2 rounded-r-[4px]" style={{ width: `${(r.valueTn / max) * 100}%`, background: r.color }} /></td>
        <td className="py-2 text-right font-mono text-[var(--ink)]">{tn(r.valueTn)}</td>
        <td className="py-2 text-right font-mono text-[var(--ink-2)]">{pct(r.share)}</td>
        <td className="hidden py-2 pl-4 text-[var(--ink-3)] md:table-cell"><a href={r.url} target="_blank" rel="noreferrer" className="underline">{r.source}</a>, {r.asOf}</td>
      </tr>)}</tbody>
    </table>
  </figure>;
}

export function CurrencySharesChart({ shares }: { shares: readonly CurrencyShare[] }) {
  // Ranked largest first; "Other currencies" always last whatever its size.
  const rows = [...shares.filter((s) => s.code !== "OTHC").sort((a, b) => b.share - a.share), ...shares.filter((s) => s.code === "OTHC")];
  const max = Math.max(...rows.map((r) => r.share));
  return <figure aria-label="Share of world foreign-exchange reserves by currency">
    <table className="w-full text-xs">
      <caption className="sr-only">Share of world foreign-exchange reserves by currency</caption>
      <tbody>{rows.map((r) => <tr key={r.code} className="border-t border-[var(--line)] first:border-t-0" title={`${r.label}: ${r.share.toFixed(2)}%`}>
        <td className="w-36 py-2 pr-3 sm:w-48">{r.label}</td>
        <td className="py-2 pr-3"><div className="h-3 rounded-r-[4px]" style={{ width: `${(r.share / max) * 100}%`, minWidth: 3, background: r.code === "OTHC" ? "var(--ink-3)" : SERIES[0] }} /></td>
        <td className="w-16 py-2 text-right font-mono text-[var(--ink)]">{r.share < 1 ? r.share.toFixed(2) : r.share.toFixed(1)}%</td>
      </tr>)}</tbody>
    </table>
  </figure>;
}
