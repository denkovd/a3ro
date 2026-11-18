"use client";

import { DIVIDEND_ACCENT } from "./dividendData";
import { monthYear, pct, usd, useValueChain } from "./valueChainData";
import { VALUE_CHAIN_LAYERS, type ValueChainLayerId } from "../../../../backend/src/dividend/framework";
import { edgarCompanyUrl } from "../../../../backend/src/dividend/valueChain/companies";
import type { LabRead } from "../../../../backend/src/dividend/valueChain/labs";
import type { CompanyRead, LayerTotals } from "../../../../backend/src/dividend/valueChain/types";

const AMBER = "#d4a157";
const GREEN = "#5fc9a4";
const cell = "px-3 py-3 text-right font-mono text-xs tabular-nums";
const head = "px-3 py-3 text-right font-normal";

function signColor(value: number | null | undefined) {
  return value == null ? undefined : value < 0 ? AMBER : undefined;
}

function labTotals(labs: LabRead[]) {
  const withIncome = labs.filter(lab => lab.revenue != null && lab.operatingIncome != null);
  const revenue = withIncome.reduce((total, lab) => total + lab.revenue!, 0);
  const operatingIncome = withIncome.reduce((total, lab) => total + lab.operatingIncome!, 0);
  return { revenue: withIncome.length ? revenue : null, operatingIncome: withIncome.length ? operatingIncome : null, margin: revenue > 0 ? operatingIncome / revenue : null };
}

function FlowCard({ eyebrow, value, detail, note, tone }: { eyebrow: string; value: string; detail: string; note: string; tone?: string }) {
  return <article className="border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><p className="text-xs text-[var(--ink-2)]">{eyebrow}</p><p className="mt-4 font-mono text-3xl tabular-nums tracking-tight" style={{ color: tone }}>{value}</p><p className="mt-3 text-xs leading-6 text-[var(--ink)]">{detail}</p><p className="mt-1 text-[11px] leading-5 text-[var(--ink-2)]">{note}</p></article>;
}

/** Horizontal bars of operating profit by layer, so it is obvious where profit pools and where it is lost. */
function ProfitBars({ rows }: { rows: { id: string; title: string; value: number | null; note?: string }[] }) {
  const max = Math.max(1, ...rows.map(row => Math.abs(row.value ?? 0)));
  return <div className="space-y-3">{rows.map(row => {
    const width = row.value == null ? 0 : Math.max(0.5, Math.abs(row.value) / max * 50);
    const negative = (row.value ?? 0) < 0;
    return <div key={row.id} className="grid grid-cols-[1fr_5.5rem] items-center gap-x-3 gap-y-1 text-xs sm:grid-cols-[11rem_1fr_6rem]">
      <span className="col-span-2 truncate text-[var(--ink-2)] sm:col-span-1">{row.title}</span>
      <div className="relative h-5" aria-hidden="true"><div className="absolute inset-y-0 left-1/2 w-px bg-[var(--line-2)]" />{row.value != null && <div className="absolute inset-y-1 rounded-[1px]" style={{ left: negative ? `${50 - width}%` : "50%", width: `${width}%`, background: negative ? AMBER : GREEN, opacity: 0.85 }} />}</div>
      <span className="text-right font-mono tabular-nums" style={{ color: signColor(row.value) }}>{usd(row.value)}</span>
    </div>;
  })}</div>;
}

function CompanyTable({ companies }: { companies: CompanyRead[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left"><thead className="text-[10px] uppercase tracking-[.1em] text-[var(--ink-2)]"><tr><th className="px-3 py-2 font-normal">Company</th><th className={head}>12 months to</th><th className={head}>Revenue</th><th className={head}>Growth</th><th className={head}>Op. margin</th><th className={head}>Capex</th><th className={head}>Free cash flow</th></tr></thead><tbody>{companies.map(company => <tr key={company.ticker} className="border-t border-[var(--line)]"><td className="px-3 py-2.5"><a href={edgarCompanyUrl(company.cik)} target="_blank" rel="noreferrer" className="text-sm hover:underline">{company.name} <span className="font-mono text-[10px] text-[var(--ink-2)]">{company.ticker}</span></a><span className="block text-[11px] text-[var(--ink-2)]">{company.role}{company.stale ? " · out of date, not in totals" : ""}</span></td><td className={cell}>{monthYear(company.periodEnd)}</td><td className={cell}>{usd(company.ttm.revenue?.value)}</td><td className={cell}>{pct(company.revenueGrowth, true)}</td><td className={cell} style={{ color: signColor(company.operatingMargin) }}>{pct(company.operatingMargin)}</td><td className={cell}>{usd(company.ttm.capex?.value)}</td><td className={cell} style={{ color: signColor(company.freeCashFlow) }}>{usd(company.freeCashFlow)}</td></tr>)}</tbody></table></div>;
}

export default function ValueChainPanel() {
  const { data, loading, error, retry } = useValueChain();
  const layer = (id: ValueChainLayerId) => data?.layers.find(item => item.layer === id) ?? null;
  const labs = data ? labTotals(data.labs) : null;
  const hyperscalers = layer("hyperscalers");
  const infrastructure = layer("infrastructure");
  const filingsReady = data && data.status !== "unavailable";
  const periodEnds = data?.layers.flatMap(item => item.periodRange ? [item.periodRange.from, item.periodRange.to] : []).sort() ?? [];

  if (!data) return <div className="mt-8 border border-[var(--line)] p-6 text-sm text-[var(--ink-2)]" aria-busy={loading}>{loading ? "Loading company figures…" : <span>{error} <button type="button" onClick={retry} className="underline">Try again</button></span>}</div>;

  const rows: { id: ValueChainLayerId; totals: LayerTotals | null }[] = VALUE_CHAIN_LAYERS.filter(item => item.id !== "households").map(item => ({ id: item.id, totals: layer(item.id) }));

  return <div className="mt-8">
    {!filingsReady && <p className="mb-5 border border-amber-300/30 p-4 text-sm leading-6 text-amber-200" role="status">Company filings haven’t been loaded yet. They refresh weekly from SEC EDGAR. Frontier lab figures below are entered by hand and shown regardless.</p>}

    <div className="grid gap-4 md:grid-cols-3">
      <FlowCard eyebrow="Hyperscalers spent" value={usd(hyperscalers?.capex)} detail={`on buildings and equipment in the last 12 months${hyperscalers?.capexGrowth != null ? `, ${pct(hyperscalers.capexGrowth, true)} on a year earlier` : ""}`} note={`Total capex across ${hyperscalers?.included ?? 0} cloud companies, not only AI. ${pct(hyperscalers?.capexIntensity)} of their revenue.`} />
      <FlowCard eyebrow="Infrastructure suppliers kept" value={usd(infrastructure?.operatingIncome)} detail={`in operating profit, a ${pct(infrastructure?.operatingMargin)} margin on ${usd(infrastructure?.revenue)} of sales`} note={`Chips, memory, networking, servers and data centres · ${infrastructure?.included ?? 0} companies.`} tone={GREEN} />
      <FlowCard eyebrow="Frontier labs lost" value={usd(labs?.operatingIncome)} detail={`at the operating line, on ${usd(labs?.revenue)} of revenue`} note={`${data.labs.map(lab => `${lab.name} (12 months to ${monthYear(lab.periodEnd)})`).join(", ")}. Periods differ.`} tone={AMBER} />
    </div>

    <article className="mt-5 border border-[var(--line)] bg-[var(--depth-1)] p-5 md:p-6"><h4 className="text-base">Where the operating profit sits</h4><p className="mb-6 mt-2 text-xs text-[var(--ink-2)]">Last 12 months reported · left of centre is a loss</p><ProfitBars rows={[...rows.map(row => ({ id: row.id, title: VALUE_CHAIN_LAYERS.find(item => item.id === row.id)!.title, value: row.id === "labs" ? labs?.operatingIncome ?? null : row.totals?.operatingIncome ?? null }))]} /><p className="mt-5 text-xs leading-6 text-[var(--ink-2)]">Sizes partly reflect how many companies each layer covers. Compare the signs and margins more than the bar lengths.</p></article>

    <div className="mt-5 overflow-x-auto border border-[var(--line)]"><table className="w-full min-w-[760px] text-left"><caption className="sr-only">Value-chain layer totals, last 12 months reported</caption><thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-[.1em] text-[var(--ink-2)]"><tr><th className="px-3 py-3 font-normal">Layer</th><th className={head}>Revenue</th><th className={head}>Growth</th><th className={head}>Op. margin</th><th className={head}>Capex</th><th className={head}>Capex / revenue</th><th className={head}>Free cash flow</th><th className={head}>Covered</th></tr></thead><tbody>
      {rows.map(({ id, totals }) => {
        const meta = VALUE_CHAIN_LAYERS.find(item => item.id === id)!;
        if (id === "labs") return <tr key={id} className="border-b border-[var(--line)]"><td className="px-3 py-3"><span className="text-sm">{meta.title}</span><span className="block text-[11px] text-[var(--ink-2)]">S-1 and press reports · periods differ</span></td><td className={cell}>{usd(labs?.revenue)}</td><td className={cell}>—</td><td className={cell} style={{ color: signColor(labs?.margin) }}>{pct(labs?.margin)}</td><td className={cell}>—</td><td className={cell}>—</td><td className={cell}>—</td><td className={cell}>{data.labs.length} labs</td></tr>;
        return <tr key={id} className="border-b border-[var(--line)]"><td className="px-3 py-3"><span className="text-sm">{meta.title}</span><span className="block text-[11px] text-[var(--ink-2)]">{meta.examples}</span></td><td className={cell}>{usd(totals?.revenue)}</td><td className={cell}>{pct(totals?.revenueGrowth, true)}</td><td className={cell} style={{ color: signColor(totals?.operatingMargin) }}>{pct(totals?.operatingMargin)}</td><td className={cell}>{usd(totals?.capex)}</td><td className={cell}>{pct(totals?.capexIntensity)}</td><td className={cell} style={{ color: signColor(totals?.freeCashFlow) }}>{usd(totals?.freeCashFlow)}</td><td className={cell}>{totals ? `${totals.included}/${totals.companies}` : "—"}</td></tr>;
      })}
      <tr><td className="px-3 py-3"><span className="text-sm">Workers & households</span><span className="block text-[11px] text-[var(--ink-2)]">Official statistics, below</span></td><td className={cell} colSpan={7} style={{ color: DIVIDEND_ACCENT }}>See wages, jobs and income shares ↓</td></tr>
    </tbody></table></div>

    <div className="mt-5 space-y-2">
      {rows.filter(row => row.id !== "labs").map(({ id }) => {
        const companies = data.companies.filter(company => company.layer === id);
        if (!companies.length) return null;
        return <details key={id} className="border border-[var(--line)]"><summary className="cursor-pointer px-4 py-3 text-sm">{VALUE_CHAIN_LAYERS.find(item => item.id === id)!.title} · {companies.length} companies</summary><div className="border-t border-[var(--line)]"><CompanyTable companies={companies} /></div></details>;
      })}
      <details className="border border-[var(--line)]"><summary className="cursor-pointer px-4 py-3 text-sm">Frontier labs · how these figures were sourced</summary><div className="space-y-4 border-t border-[var(--line)] p-4 text-xs leading-6 text-[var(--ink-2)]">{data.labs.map(lab => <div key={lab.name}><p className="text-sm text-[var(--ink)]">{lab.name} <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: lab.basis === "filed" ? DIVIDEND_ACCENT : AMBER }}>{lab.basis === "filed" ? "SEC filing" : "Press report"}</span></p><p>12 months to {monthYear(lab.periodEnd)}: revenue {usd(lab.revenue)}, operating result {usd(lab.operatingIncome)} ({pct(lab.operatingMargin)} margin). {lab.basisNote}</p><p>{lab.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="mr-4 underline">{source.label} ↗</a>)}</p></div>)}<p>Operating results exclude large non-cash charges below the operating line, such as fair-value changes on convertible instruments, which make headline net losses much bigger. xAI isn’t included: its last figures are from 2025. Checked {data.labsCheckedOn}.</p></div></details>
      {data.failures.length > 0 && <p className="text-xs text-amber-200">Latest filings could not be read for {data.failures.map(failure => failure.ticker).join(", ")}. They are left out of the totals.</p>}
    </div>

    <p className="mt-5 max-w-3xl text-xs leading-6 text-[var(--ink-2)]">Whole-company figures from 10-K and 10-Q filings, because most companies don’t report AI separately. Last 12 months = latest fiscal year plus year-to-date, minus the same period a year earlier.{periodEnds.length ? monthYear(periodEnds[0]) === monthYear(periodEnds.at(-1)) ? ` Company periods end in ${monthYear(periodEnds[0])}.` : ` Company periods end between ${monthYear(periodEnds[0])} and ${monthYear(periodEnds.at(-1))}.` : ""} Capex is cash spent on property and equipment, so it excludes finance leases. Free cash flow is operating cash flow minus capex.{data.retrievedAt ? ` Filings checked ${data.retrievedAt.slice(0, 10)}.` : ""}</p>
  </div>;
}
