"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — module switcher
   Sits in the top chrome of each full-page module (Bull Market
   Finder, Regime Shift Finder, Earnings Beat Leaderboard) so a
   visitor can step to the next/previous module without returning
   to the homepage. Commodity Watch pages are intentionally excluded
   (they already switch assets via their own tab row).
──────────────────────────────────────────────────────────────── */
import { useRouter } from "next/navigation";
import { canSeeRoute } from "../../../lib/access";
import { useViewer } from "../useViewer";

export type ModuleId = "trend" | "regime" | "earnings" | "australia" | "dividend";

// Same order as the homepage: free modules first, then Premium.
const MODULE_SEQUENCE: ModuleId[] = ["australia", "dividend", "trend", "regime", "earnings"];

const MODULE_META: Record<ModuleId, { label: string; route: string }> = {
  trend: { label: "Bull Market Finder", route: "/Projects/Bull-Market-Finder" },
  regime: { label: "US regime", route: "/Projects/Regime-Shift" },
  earnings: { label: "Earnings Beat Leaderboard", route: "/Projects/Earnings-Beat" },
  australia: { label: "Australia Watch", route: "/Projects/Australia-Watch" },
  dividend: { label: "AI Dividend", route: "/Projects/AI-Dividend" },
};

const switchButtonClass =
  "flex h-5 w-5 items-center justify-center rounded-[2px] border border-[var(--line)] font-mono text-[10px] leading-none text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)] hover:text-[var(--ink)]";

export default function ModuleSwitcher({ current }: { current: ModuleId }) {
  const router = useRouter();
  const viewer = useViewer();
  // Every module stays in the cycle; Premium ones the viewer hasn't unlocked are marked with a lock
  // and open the Premium page (lib/access.ts).
  const sequence = MODULE_SEQUENCE;
  const locked = (id: ModuleId) => !canSeeRoute(MODULE_META[id].route, viewer);
  const idx = sequence.indexOf(current);
  const prevId = sequence[(idx - 1 + sequence.length) % sequence.length];
  const nextId = sequence[(idx + 1) % sequence.length];

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => router.push(MODULE_META[prevId].route)}
        aria-label={`Switch to ${MODULE_META[prevId].label}${locked(prevId) ? " (Premium)" : ""}`}
        title={`${MODULE_META[prevId].label}${locked(prevId) ? " · Premium" : ""}`}
        className={switchButtonClass}
      >
        ‹
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
        {idx + 1}/{sequence.length}
      </span>
      <button
        type="button"
        onClick={() => router.push(MODULE_META[nextId].route)}
        aria-label={`Switch to ${MODULE_META[nextId].label}${locked(nextId) ? " (Premium)" : ""}`}
        title={`${MODULE_META[nextId].label}${locked(nextId) ? " · Premium" : ""}`}
        className={switchButtonClass}
      >
        ›
      </button>
    </div>
  );
}
