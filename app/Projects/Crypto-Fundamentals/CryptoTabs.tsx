"use client";
/* Crypto page tabs (roadmap #124). Every panel is rendered on the server (so search engines see
   all of it); this only chooses which one shows, and keeps the choice in the URL (?tab=). */
import { useEffect, useState, type ReactNode } from "react";
import { LockIcon } from "../../components/LockIcon";

export interface CryptoTab { id: string; label: string; premium?: boolean }

export default function CryptoTabs({ tabs, panels }: { tabs: CryptoTab[]; panels: Record<string, ReactNode> }) {
  const [active, setActive] = useState(tabs[0].id);
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want && tabs.some((t) => t.id === want)) {
      setActive(want);
      requestAnimationFrame(() => document.getElementById(`tab-${want}`)?.scrollIntoView({ block: "nearest", inline: "center" }));
    }
  }, [tabs]);
  const choose = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === tabs[0].id) url.searchParams.delete("tab"); else url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };
  return <div className="flex flex-col gap-8">
    <div role="tablist" aria-label="Crypto sections" className="sticky top-[72px] z-10 -mx-2 flex gap-1 overflow-x-auto border-b border-[var(--line)] bg-[rgba(6,7,7,0.92)] px-2 py-2 backdrop-blur-md">
      {tabs.map((t) => <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={active === t.id} aria-controls={`panel-${t.id}`} onClick={() => choose(t.id)}
        className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-sm px-3 text-xs ${active === t.id ? "bg-[var(--depth-3)] text-[var(--ink)]" : "text-[var(--ink-2)] hover:text-[var(--ink)]"}`}>
        {t.label}{t.premium ? <LockIcon title="Premium" /> : null}
      </button>)}
    </div>
    {tabs.map((t) => <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className={active === t.id ? "flex flex-col gap-10" : "hidden"}>
      {panels[t.id]}
    </div>)}
  </div>;
}
