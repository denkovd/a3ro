"use client";
import type { CorridorMetricLatest } from "@a3ro/oil-backend";
import { useState } from "react";
import CorridorSpark from "../CorridorSpark";
import { chinaRows, chinaPeriod, chinaSummary, chinaYoy } from "./china";
import { metricFreshness } from "./dataQuality";

export default function ChinaDetail({ metrics, failed }: { metrics: CorridorMetricLatest[] | null; failed: boolean }) {
  const [expanded, setExpanded] = useState("crude_imports");
  return <div className="space-y-5">
    <header><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">China · Monthly oil activity</p><h3 className="mt-2 text-xl text-[var(--ink)]">Crude buying &amp; refining</h3><p className="mt-2 text-[10px] text-[var(--ink-3)]">National coverage · coastal marker is a navigation anchor</p></header>
    <p className="border-l-2 border-[#d4a157] pl-3 text-xs leading-relaxed text-[var(--ink-2)]">{chinaSummary(metrics)}</p>
    {failed && <p className="text-[10px] text-[#d4a157]">Physical feed could not be loaded · retained readings shown where available.</p>}
    {chinaRows(metrics).map(({ metric, title, detail, source, row }) => {
      const open = expanded === metric;
      const yoy = chinaYoy(row);
      const daily = row?.meta?.dailyKt ? Number(row.meta.dailyKt) : null;
      const sourceUrl = row?.meta?.sourceUrl;
      const safeSource = sourceUrl && /^https?:\/\/(?:www\.stats\.gov\.cn|english\.customs\.gov\.cn)\//.test(sourceUrl) ? sourceUrl : undefined;
      return <section key={metric} className="border-t border-[var(--line)] pt-4">
        <button type="button" onClick={() => setExpanded(open ? "" : metric)} aria-expanded={open} className="w-full text-left hover:bg-white/[0.03]">
          <span className="flex justify-between text-[11px] text-[var(--ink-2)]"><span>{title}</span><span aria-hidden>{open ? "−" : "+"}</span></span>
          <span className="mt-2 block font-mono text-2xl text-[var(--ink)]">{row ? `${row.value.toFixed(2)} Mt` : "Unavailable"}</span>
          {row && <span className="mt-2 block font-mono text-[10px] text-[var(--ink-2)]">{yoy === null ? "YoY unavailable" : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}% YoY`}{daily !== null && Number.isFinite(daily) ? ` · ${daily.toFixed(0)} kt/day` : ""}</span>}
          <span className="mt-2 block font-mono text-[9px] text-[var(--ink-3)]">{row ? `${metricFreshness(row) === "stale" ? "Historical · stale" : "Reported monthly"} · ${chinaPeriod(row)}` : `${source} release not available`}</span>
        </button>
        <p className="mt-2 text-[10px] text-[var(--ink-3)]">{detail}</p>
        {row && <p className="mt-2 text-[10px] text-[var(--ink-3)]">{source}{row.meta?.preliminary === "true" ? " · preliminary" : ""} · published {row.meta?.publishedDate ?? row.observedAt.slice(0, 10)}{safeSource && <> · <a className="text-[#d4a157] underline" href={safeSource} target="_blank" rel="noreferrer">Source ↗</a></>}</p>}
        {open && <><CorridorSpark corridor="china" metric={metric} days={800} caption={title} monthly />{row?.meta?.yoyBasis && <p className="mt-2 text-[10px] text-[var(--ink-3)]">{row.meta.yoyBasis}.</p>}</>}
      </section>;
    })}
    <footer className="space-y-2 border-t border-[var(--line)] pt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
      <p>Mt = million tonnes · kt/day = thousand tonnes per calendar day. January–February is one combined period; totals span both months.</p>
      <p>Refinery processing includes production for exports and petrochemicals. It is not a direct measure of domestic fuel consumption. NBS covers enterprises above its designated size.</p>
      <p>Crude purchases and processing alone do not establish inventory levels or strategic-reserve changes.</p>
      <p>Monthly releases describe the stated period. Refreshing an old reading does not make it current.</p>
    </footer>
  </div>;
}
