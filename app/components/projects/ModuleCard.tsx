"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — module switcher
   Each homepage module card (Trend Finder, Regime, Earnings Beat)
   renders through this wrapper so the header carries a prev/next
   control letting the visitor cycle the card in place between the
   three modules, without touching the landing page's layout, scroll
   traverse, or card count. Commodity Watch is intentionally excluded
   (it already switches assets via its own tab row).
──────────────────────────────────────────────────────────────── */
import { useState, type MouseEvent, type ReactNode, type ComponentType } from "react";
import { TrendFinderContent } from "./BullFinder";
import { RegimeContent } from "./RegimeShiftFinder";
import { EarningsBeatContent } from "./EarningsBeat";

export type ModuleId = "trend" | "regime" | "earnings";

export const MODULE_SEQUENCE: ModuleId[] = ["trend", "regime", "earnings"];

export const MODULE_LABELS: Record<ModuleId, string> = {
  trend: "Trend Finder",
  regime: "Regime",
  earnings: "Earnings Beat Leaderboard",
};

const CONTENT_MAP: Record<ModuleId, ComponentType<{ className?: string; switcher?: ReactNode }>> = {
  trend: TrendFinderContent,
  regime: RegimeContent,
  earnings: EarningsBeatContent,
};

const switchButtonClass =
  "flex h-5 w-5 items-center justify-center rounded-[2px] border border-[var(--line)] font-mono text-[10px] leading-none text-[var(--ink-3)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] hover:text-[var(--ink)]";

export default function ModuleCard({
  initial,
  className = "",
}: {
  initial: ModuleId;
  className?: string;
}) {
  const [id, setId] = useState<ModuleId>(initial);
  const idx = MODULE_SEQUENCE.indexOf(id);

  const go = (e: MouseEvent, dir: 1 | -1) => {
    e.preventDefault();
    e.stopPropagation();
    const next = (idx + dir + MODULE_SEQUENCE.length) % MODULE_SEQUENCE.length;
    setId(MODULE_SEQUENCE[next]);
  };

  const switcher = (
    <div className="pointer-events-auto mt-2 flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Switch to ${MODULE_LABELS[MODULE_SEQUENCE[(idx - 1 + MODULE_SEQUENCE.length) % MODULE_SEQUENCE.length]]}`}
        onClick={(e) => go(e, -1)}
        className={switchButtonClass}
      >
        ‹
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
        {idx + 1}/{MODULE_SEQUENCE.length}
      </span>
      <button
        type="button"
        aria-label={`Switch to ${MODULE_LABELS[MODULE_SEQUENCE[(idx + 1) % MODULE_SEQUENCE.length]]}`}
        onClick={(e) => go(e, 1)}
        className={switchButtonClass}
      >
        ›
      </button>
    </div>
  );

  const Content = CONTENT_MAP[id];
  return <Content className={className} switcher={switcher} />;
}
