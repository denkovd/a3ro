"use client";
// Asset search (roadmap #39): matches our asset pages by ticker or name; anything we don't cover
// links out to TradingView. Searches are logged anonymously with their result count (#46).
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { KIND_LABEL, searchAssets, type SearchItem } from "../../lib/assets";
import { track } from "../components/track";

export default function AssetSearch({ items, autoFocus = false }: { items: readonly SearchItem[]; autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchAssets(items, query, 8), [items, query]);
  const logged = useRef("");

  // Log a search once the visitor pauses typing, not on every key.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || logged.current === q) return;
    const timer = setTimeout(() => { logged.current = q; track("search", { target: q.slice(0, 80), resultCount: results.length }); }, 900);
    return () => clearTimeout(timer);
  }, [query, results.length]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (results[0]) location.href = `/assets/${results[0].s}`;
    else if (query.trim()) window.open(outside(query), "_blank", "noopener");
  }

  const outside = (q: string) => `https://www.tradingview.com/symbols/${encodeURIComponent(q.trim().toUpperCase().replace(/\s+/g, ""))}/`;

  return <form role="search" onSubmit={submit} className="flex flex-col gap-2">
    <label className="flex flex-col gap-2">
      <span className="landing-kicker">Search an asset</span>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={autoFocus} maxLength={60}
        placeholder="Ticker or name: BHP, Apple, bitcoin, SPY…" autoComplete="off" spellCheck={false}
        aria-controls="asset-search-results"
        className="rounded-sm border border-[var(--line)] bg-transparent px-3 py-2 text-base outline-none focus:border-[var(--line-2)]" />
    </label>
    {query.trim() ? <ul id="asset-search-results" className="flex flex-col divide-y divide-[var(--line)] rounded-sm border border-[var(--line)]">
      {results.map((r) => <li key={r.s}>
        <a href={`/assets/${r.s}`} className="flex items-baseline justify-between gap-4 px-3 py-2 text-sm hover:bg-[var(--depth-1)]">
          <span><span className="font-mono text-[var(--ink)]">{r.t}</span> <span className="text-[var(--ink-2)]">{r.n}</span></span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{KIND_LABEL[r.k]}</span>
        </a>
      </li>)}
      <li>
        <a href={outside(query)} target="_blank" rel="noopener nofollow" data-track-outbound="tradingview"
          className="block px-3 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--depth-1)]">
          {results.length ? "Not here? " : "We don't cover that yet. "}Open &ldquo;{query.trim().toUpperCase()}&rdquo; on TradingView ↗
        </a>
      </li>
    </ul> : null}
  </form>;
}
