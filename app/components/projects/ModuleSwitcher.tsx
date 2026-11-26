"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — module switcher
   Sits in the top chrome of every full-page module, directly after
   "← Index", so it stays in the same spot while a visitor steps
   through the modules without returning to the homepage. The four
   commodity trackers (Oil, Gold, BTC, Uranium) count as one module,
   Commodity Watch, and switch assets via their own tab row.
──────────────────────────────────────────────────────────────── */
import { useRouter } from "next/navigation";
import { canSeeRoute } from "../../../lib/access";
import { useViewer } from "../useViewer";

export type ModuleId = "australia" | "dividend" | "commodity" | "trend" | "regime" | "earnings";

// Same order as the homepage module list (components/landing/LandingExperience.tsx).
const MODULE_SEQUENCE: ModuleId[] = ["australia", "dividend", "commodity", "trend", "regime", "earnings"];

const MODULE_META: Record<ModuleId, { label: string; route: string }> = {
  australia: { label: "Australia Watch", route: "/Projects/Australia-Watch" },
  dividend: { label: "AI Dividend", route: "/Projects/AI-Dividend" },
  commodity: { label: "Commodity Watch", route: "/Projects/Oil-Tracker" },
  trend: { label: "Trend Finder", route: "/Projects/Bull-Market-Finder" },
  regime: { label: "Regime", route: "/Projects/Regime-Shift" },
  earnings: { label: "Earnings Beat", route: "/Projects/Earnings-Beat" },
};

const switchButtonClass =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border border-[var(--line)] font-mono text-[10px] leading-none text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)] hover:text-[var(--ink)]";

export default function ModuleSwitcher({ current }: { current: ModuleId }) {
  const router = useRouter();
  const viewer = useViewer();
  // Every module stays in the cycle; Premium ones the viewer hasn't unlocked open the Premium page (lib/access.ts).
  const sequence = MODULE_SEQUENCE;
  const locked = (id: ModuleId) => !canSeeRoute(MODULE_META[id].route, viewer);
  const idx = sequence.indexOf(current);
  const prevId = sequence[(idx - 1 + sequence.length) % sequence.length];
  const nextId = sequence[(idx + 1) % sequence.length];
  const label = (id: ModuleId) => `${MODULE_META[id].label}${locked(id) ? " · Premium" : ""}`;

  return (
    <nav aria-label="Switch module" className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => router.push(MODULE_META[prevId].route)}
        aria-label={`Previous module: ${label(prevId)}`}
        title={label(prevId)}
        className={switchButtonClass}
      >
        ‹
      </button>
      {/* fixed width so the arrows never shift between modules */}
      <span className="hidden w-7 text-center font-mono text-[9px] tabular-nums text-[var(--ink-3)] sm:inline">
        {idx + 1}/{sequence.length}
      </span>
      <button
        type="button"
        onClick={() => router.push(MODULE_META[nextId].route)}
        aria-label={`Next module: ${label(nextId)}`}
        title={label(nextId)}
        className={switchButtonClass}
      >
        ›
      </button>
    </nav>
  );
}
