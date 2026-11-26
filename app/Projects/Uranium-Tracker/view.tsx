"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Uranium-Tracker — fullscreen shell (roadmap #54)
   Free module under Commodity Watch. Esc → index.
──────────────────────────────────────────────────────────────── */
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { URANIUM_CSS, UT_ATMOSPHERE } from "../../components/projects/uraniumTrackerShared";
import { AMBER_CSS, OT_ROUTE } from "../../components/projects/oilTrackerShared";
import { GOLD_CSS, GT_ROUTE } from "../../components/projects/goldTrackerShared";
import { ORANGE_CSS, BT_ROUTE } from "../../components/projects/btcTrackerShared";
import { LockIcon } from "../../components/LockIcon";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";
import { useViewer } from "../../components/useViewer";

const UraniumTrackerCore = dynamic(() => import("../../components/projects/UraniumTrackerCore"), { ssr: false, loading: () => null });

export default function UraniumTrackerView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const viewer = useViewer();
  const [coreReady, setCoreReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const leave = useCallback(() => {
    if (leaving) return;
    if (reduced) { router.push("/#modules"); return; }
    setLeaving(true);
  }, [leaving, reduced, router]);

  const tab = "px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors hover:opacity-100 inline-flex items-center gap-1";
  return (
    <motion.main
      className="grain fixed inset-0 overflow-hidden bg-[var(--depth-0)]"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.28, ease: "easeInOut" }}
      onAnimationComplete={() => { if (leaving) router.push("/#modules"); }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: UT_ATMOSPHERE }} />
      <h1 className="sr-only">Uranium Tracker: the nuclear fuel chain from mine to reactor</h1>

      <motion.div
        className="absolute inset-x-0 bottom-0 top-12 md:bottom-10 md:top-14"
        initial={{ opacity: 0 }}
        animate={{ opacity: coreReady ? 1 : 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <UraniumTrackerCore className="h-full w-full" onExit={leave} onReady={() => setCoreReady(true)} />
      </motion.div>

      <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.72)] px-6 backdrop-blur-md md:h-14 md:px-10">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <button
            onClick={leave}
            className="sweep shrink-0 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close Uranium Tracker and return to the index"
          >
            ← Index
          </button>
          <ModuleSwitcher current="commodity" />
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="hidden truncate font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)] lg:block">A3RO Intelligence — Commodity Watch</p>
          <nav aria-label="Market surface" className="flex min-w-0 items-center gap-0.5 overflow-x-auto border-l border-[var(--line)] pl-2 sm:pl-3">
            <a href={OT_ROUTE} className={tab} style={{ color: AMBER_CSS, opacity: 0.55 }} title="Open Oil Tracker">Oil</a>
            <a href={GT_ROUTE} className={tab} style={{ color: GOLD_CSS, opacity: 0.55 }} title={viewer.premium ? "Open Gold Tracker" : "Gold Tracker · Premium"}>
              Gold{viewer.premium ? null : <LockIcon title="Premium" />}
            </a>
            <a href={BT_ROUTE} className={tab} style={{ color: ORANGE_CSS, opacity: 0.55 }} title={viewer.premium ? "Open BTC Tracker" : "BTC Tracker · Premium"}>
              BTC{viewer.premium ? null : <LockIcon title="Premium" />}
            </a>
            <span className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: URANIUM_CSS }} aria-current="page">Uranium</span>
            <a href="/Projects/Crypto-Fundamentals" className={tab} style={{ color: "#9ab8ff", opacity: 0.55 }} title="Open Crypto fundamentals">Crypto</a>
          </nav>
        </div>
        <p className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: URANIUM_CSS }} />
          <span className="hidden sm:inline">Fuel chain · mines · plants · reactors</span>
        </p>
      </header>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden h-10 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:flex md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">P·03 — Uranium Tracker</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">Reference data · prices delayed · not investment advice</p>
      </footer>
    </motion.main>
  );
}
