"use client";

import { displayValue, estimatedFreshness, useAustraliaWatch } from "../australia/australiaWatchData";

export default function AustraliaBaseline() {
  const { observations, fetchStates, status } = useAustraliaWatch();
  const latest = Object.values(observations.reduce<Record<string, typeof observations[number]>>((result, point) => {
    if (!result[point.indicator] || point.referencePeriod > result[point.indicator].referencePeriod) result[point.indicator] = point;
    return result;
  }, {}));
  return <section aria-label="Australian baseline" className="space-y-6">
    <div className="max-w-3xl"><h2 className="text-2xl text-[var(--ink)]">The Australian lens</h2><p className="mt-3 text-sm leading-7 text-[var(--ink-2)]">Official inflation and labour observations from Australia Watch. These retain their ABS definitions and reporting periods.</p></div>
    {status !== "ready" ? <p className="py-10 text-sm text-[var(--ink-2)]">{status === "error" ? "Australian observations could not be loaded." : "Loading ABS observations…"}</p> : latest.length ? <div className="grid gap-4 sm:grid-cols-2">{latest.map(point => <article key={point.indicator} className="border border-[var(--line)] bg-[var(--depth-1)] p-5"><h3 className="text-sm text-[var(--ink-2)]">{point.title}</h3><p className="mt-4 font-mono text-3xl tabular-nums text-[var(--ink)]">{displayValue(point)}</p><p className="mt-3 text-xs text-[var(--ink-2)]">{point.referencePeriod} · {estimatedFreshness(point)} · {fetchStates[point.indicator]?.health ?? "unavailable"}</p><a href={point.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs underline text-[var(--ink-2)]">Official ABS series ↗</a></article>)}</div> : <p className="py-10 text-sm text-[var(--ink-2)]">ABS observations have not yet been retrieved.</p>}
    <div className="border-t border-[var(--line)] pt-6 text-sm leading-7 text-[var(--ink-2)]"><p>Household living-cost indexes, distributional income and regional power delivery are the next additions to this lens. US income or wealth groups do not substitute for those Australian measures.</p><a href="/Projects/Australia-Watch" className="mt-3 inline-block underline">Open Australia Watch history ↗</a></div>
  </section>;
}
