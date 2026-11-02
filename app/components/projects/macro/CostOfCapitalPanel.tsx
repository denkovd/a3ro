"use client";

import { useEffect, useState } from "react";
import saved from "../../../../public/data/cost-of-capital.json";
import { CAPITAL_MARKETS, commonCapitalObservations, latestCapitalObservations, validateCapitalDataset, type CapitalDataset } from "../../../../lib/costOfCapital";
import { capitalRefreshPlan } from "../../../../lib/capitalSchedule";
import { AUSTRALIA_CAPITAL, type MacroBrief } from "./macroBrief";
import { formatPct, type MacroSnapshot } from "./macroData";
import { formatMacroPeriod } from "./macroFreshness";

const savedDataset = saved as CapitalDataset;

function useCapitalDataset() {
  const [data, setData] = useState(savedDataset);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/capital/latest", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const next = await response.json();
        validateCapitalDataset(next);
        if (!disposed) {
          // A database outage must not replace a newer successful response with the older bundled seed.
          if (next.storage !== "bundled-fallback") setData(next);
          setUnavailable(next.storage === "bundled-fallback"); setNow(new Date());
        }
      } catch {
        if (!disposed) { setUnavailable(true); setNow(new Date()); }
      }
    }
    setNow(new Date());
    void refresh();
    const timer = window.setInterval(refresh, 300_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      disposed = true; controller.abort(); window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh);
    };
  }, []);
  return { data, unavailable, now };
}

export function CostOfCapitalPanel({ brief, snap }: { brief: MacroBrief; snap: MacroSnapshot }) {
  const { data, unavailable, now } = useCapitalDataset();
  const [view, setView] = useState<"common" | "latest">("common");
  const latest = latestCapitalObservations(data);
  const rows = view === "common" ? commonCapitalObservations(data) : latest;
  const periods = [...new Set(rows.map((row) => row.asOf))];
  const plan = now ? capitalRefreshPlan(CAPITAL_MARKETS, latest, now) : [];
  const max = Math.max(...rows.map((row) => row.current), 1);
  return (
    <div className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">Cost of capital</h3>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">Monthly public-source estimates</p>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
        MSCI trailing earnings yield + the same month&apos;s average nominal 10-year government yield.
        Historical means are shown separately below.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="group" aria-label="Observation period">
          {(["common", "latest"] as const).map((option) => <button key={option} type="button" aria-pressed={view === option}
            onClick={() => setView(option)} className={`rounded px-2.5 py-1.5 font-mono text-[10px] ${view === option ? "bg-[var(--surface-2)] text-[var(--ink)]" : "text-[var(--ink-3)] hover:text-[var(--ink)]"}`}>
            {option === "common" ? "Same month" : "Latest releases"}
          </button>)}
        </div>
        <span className="font-mono text-[10px] text-[var(--ink-3)]">{periods.length === 1 ? formatMacroPeriod(periods[0]) : periods.length > 1 ? "Different observation months" : "Awaiting a shared month"}</span>
      </div>
      {periods.length > 1 && <p className="mt-3 text-xs text-[var(--ink-2)]">These rows cover different months. Use “Same month” to compare markets over a shared period.</p>}
      {unavailable && <p role="status" className="mt-3 text-xs text-[var(--ink-2)]">Showing saved observations; the database refresh is unavailable.</p>}
      {!rows.length ? <p className="mt-5 text-sm text-[var(--ink-3)]">No complete shared month has been published yet. Latest releases may be available.</p> : <>
        <div className="mt-5 flex justify-end gap-3 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-3)]" aria-hidden="true">
          <span className="w-28 text-right">Earnings + 10Y</span><span className="w-16 text-right">Total</span>
        </div>
        <div className="mt-2 space-y-4">
          {rows.map((row) => {
            const awaiting = plan.find((job) => job.marketId === row.marketId);
            const latestRow = latest.find((item) => item.marketId === row.marketId);
            const newer = latestRow && latestRow.asOf > row.asOf;
            return <div key={row.marketId} className="flex items-center gap-3">
              <div className="w-28 shrink-0 font-mono text-[10px] text-[var(--ink-3)]">
                <span className="uppercase tracking-[0.1em]">{row.market}</span>
                <span className="mt-1 block text-[8px]">{row.benchmark} · {formatMacroPeriod(row.asOf)}</span>
                {newer ? <span className="mt-1 block text-[8px] text-[var(--ink-2)]">{formatMacroPeriod(latestRow.asOf)} in latest releases</span>
                  : awaiting?.due && <span className="mt-1 block text-[8px] text-[var(--ink-2)]">Awaiting {formatMacroPeriod(`${awaiting.targetMonth}-01`)}</span>}
              </div>
              <div className="relative hidden h-1 flex-1 rounded bg-[var(--line)] sm:block" aria-hidden="true">
                <div className="h-1 rounded bg-[var(--ink-3)]" style={{ width: `${Math.max(0, row.current / max) * 100}%` }} />
              </div>
              <span className="ml-auto w-28 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-3)]" aria-label={`Earnings yield ${row.earningsYield.toFixed(2)} percent plus bond yield ${row.bondYield.toFixed(2)} percent`}>
                {row.earningsYield.toFixed(2)} + {row.bondYield.toFixed(2)}
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">{row.current.toFixed(2)}%</span>
            </div>;
          })}
        </div>
      </>}
      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
        The same equity methodology, 10-year tenor and monthly averaging apply across markets. Local government yield definitions and equity sector mixes still differ; Switzerland uses a zero-coupon spot yield.
        These are indicative market proxies, not company WACC estimates.
      </p>
      <details className="mt-4 text-xs leading-relaxed text-[var(--ink-3)]">
        <summary className="cursor-pointer text-[var(--ink-2)]">Monthly sources and release timing</summary>
        <p className="mt-3">Australia is checked the day after the RBA&apos;s monthly bond release. Other markets are checked after their early-month release window. Late MSCI or bond inputs are checked again daily; an older observation keeps its original date.</p>
        <div className="mt-3 space-y-4">
          {latest.map((row) => <div key={row.marketId}>
            <p className="text-[var(--ink-2)]">{row.market} · {formatMacroPeriod(row.asOf)}</p>
            <p>Trailing P/E {row.priceEarnings.toFixed(2)}. {row.bondDefinition}, monthly average {row.bondYield.toFixed(3)}%{row.bondObservations.length ? ` across ${row.bondObservations.length} published daily observations` : " as published"}.</p>
            <p>Equity checked {row.equityCheckedAt.slice(0, 10)} · bonds checked {row.bondCheckedAt.slice(0, 10)}.</p>
            {plan.find((job) => job.marketId === row.marketId) && <p>Latest expected month: {formatMacroPeriod(`${plan.find((job) => job.marketId === row.marketId)!.targetMonth}-01`)}; checks start {plan.find((job) => job.marketId === row.marketId)!.checkOn} (source-country date).</p>}
            <ul className="mt-1 list-disc pl-4">{row.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">{source.label}</a></li>)}</ul>
          </div>)}
        </div>
      </details>
      <details className="mt-5 border-t border-[var(--line)] pt-4 text-xs leading-relaxed text-[var(--ink-3)]">
        <summary className="cursor-pointer text-[var(--ink-2)]">Historical references — cost of capital vs long-run mean</summary>
        <p className="mt-3 max-w-2xl">The international figures below are the unchanged {brief.asOf} editorial snapshot. They use a different source and reference sample from the monthly estimates above. Australia&apos;s older broad-equity reference also uses a different historical benchmark. These gaps are not current signals or a comparable ranking.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left font-mono text-[10px] tabular-nums">
            <caption className="sr-only">Historical reference values, excluded from the monthly comparison</caption>
            <thead><tr><th scope="col" className="py-2 font-normal">Market / snapshot</th><th scope="col" className="px-2 text-right font-normal">Then</th><th scope="col" className="px-2 text-right font-normal">Mean</th><th scope="col" className="text-right font-normal">Gap, pp</th></tr></thead>
            <tbody>{brief.costOfCapital.map((row) => <tr key={row.market} className="border-t border-[var(--line)]">
              <th scope="row" className="py-2 font-normal">{row.market}<span className="block text-[8px]">{row.asOf || brief.asOf}</span></th>
              <td className="px-2 text-right">{row.current.toFixed(2)}%</td><td className="px-2 text-right">{row.longRunMean.toFixed(2)}%</td><td className="text-right">{row.gap > 0 ? "+" : ""}{row.gap.toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3">Australia&apos;s fixed reference: {AUSTRALIA_CAPITAL.baselineCount} quarterly observations, {formatMacroPeriod(AUSTRALIA_CAPITAL.baselineFrom)}–{formatMacroPeriod(AUSTRALIA_CAPITAL.baselineTo)}; historical ASX P/E rather than MSCI P/E.</p>
        <ul className="mt-2 list-disc pl-4">{AUSTRALIA_CAPITAL.baselineSources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">{source.label}</a></li>)}</ul>
      </details>
      <p className="mt-5 font-mono text-[10px] text-[var(--ink-3)]">
        US nominal GDP {formatPct(snap.nominalGdpYoy)} · 2015–19 trend {formatPct(snap.nominalTrend1519)} · 2003–07 {formatPct(snap.nominalTrend0307)}
        {snap.nominalGap !== null && <> · {snap.nominalGap > 0 ? "+" : ""}{snap.nominalGap.toFixed(1)}pp vs recent trend</>}
      </p>
    </div>
  );
}
