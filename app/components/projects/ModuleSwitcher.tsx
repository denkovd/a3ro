"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — module switcher
   Sits in the top chrome of each full-page module (Trend Finder,
   Regime, Earnings Beat Leaderboard) so a
   visitor can step to the next/previous module without returning
   to the homepage. Commodity Watch pages are intentionally excluded
   (they already switch assets via their own tab row).
──────────────────────────────────────────────────────────────── */
import { useRouter } from "next/navigation";

export type ModuleId = "trend" | "regime" | "earnings";

const MODULE_SEQUENCE: ModuleId[] = ["trend", "regime", "earnings"];

const MODULE_META: Record<ModuleId, { label: string; route: string }> = {
  trend: { label: "Trend Finder", route: "/Projects/Bull-Market-Finder" },
  regime: { label: "Regime", route: "/Projects/Regime-Shift" },
  earnings: { label: "Earnings Beat Leaderboard", route: "/Projects/Earnings-Beat" },
};

const switchButtonClass =
  "flex h-5 w-5 items-center justify-center rounded-[2px] border border-[var(--line)] font-mono text-[10px] leading-none text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)] hover:text-[var(--ink)]";

export default function ModuleSwitcher({ current }: { current: ModuleId }) {
  const router = useRouter();
  const idx = MODULE_SEQUENCE.indexOf(current);
  const prevId = MODULE_SEQUENCE[(idx - 1 + MODULE_SEQUENCE.length) % MODULE_SEQUENCE.length];
  const nextId = MODULE_SEQUENCE[(idx + 1) % MODULE_SEQUENCE.length];

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => router.push(MODULE_META[prevId].route)}
        aria-label={`Switch to ${MODULE_META[prevId].label}`}
        className={switchButtonClass}
      >
        ‹
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
        {idx + 1}/{MODULE_SEQUENCE.length}
      </span>
      <button
        type="button"
        onClick={() => router.push(MODULE_META[nextId].route)}
        aria-label={`Switch to ${MODULE_META[nextId].label}`}
        className={switchButtonClass}
      >
        ›
      </button>
    </div>
  );
}
