"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Copper-Tracker — fullscreen shell (roadmap #56)
   Free module under Commodity Watch. Esc → index.
──────────────────────────────────────────────────────────────── */
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { COPPER_CSS, CT_ATMOSPHERE } from "../../components/projects/copperTrackerShared";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import CommodityNav from "../../components/projects/commodity/CommodityNav";

const CopperTrackerCore = dynamic(() => import("../../components/projects/CopperTrackerCore"), { ssr: false, loading: () => null });

export default function CopperTrackerView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [coreReady, setCoreReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const leave = useCallback(() => {
    if (leaving) return;
    if (reduced) { router.push("/#modules"); return; }
    setLeaving(true);
  }, [leaving, reduced, router]);

  return (
    <motion.main
      className="grain fixed inset-0 overflow-hidden bg-[var(--depth-0)]"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.28, ease: "easeInOut" }}
      onAnimationComplete={() => { if (leaving) router.push("/#modules"); }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: CT_ATMOSPHERE }} />
      <h1 className="sr-only">Copper Tracker: from mine to smelter to wire</h1>

      <motion.div
        className="absolute inset-x-0 bottom-0 top-12 md:bottom-10 md:top-14"
        initial={{ opacity: 0 }}
        animate={{ opacity: coreReady ? 1 : 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <CopperTrackerCore className="h-full w-full" onExit={leave} onReady={() => setCoreReady(true)} />
      </motion.div>

      <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.72)] px-6 backdrop-blur-md md:h-14 md:px-10">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <button
            onClick={leave}
            className="sweep shrink-0 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close Copper Tracker and return to the index"
          >
            ← Index
          </button>
          <ModuleSwitcher current="commodity" />
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="hidden truncate font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)] lg:block">A3RO Intelligence — Commodity Watch</p>
          <CommodityNav current="copper" />
        </div>
        <p className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: COPPER_CSS }} />
          <span className="hidden sm:inline">Mines · smelters · COMEX · exports</span>
        </p>
      </header>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden h-10 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:flex md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">P·03 — Copper Tracker</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">ABS exports · CME stocks · prices delayed · not investment advice</p>
      </footer>
    </motion.main>
  );
}
