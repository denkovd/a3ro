"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Gold-Tracker — fullscreen experience shell
   Same handoff pattern as Oil/BTC: preview → lazy core, Esc → index.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import GoldTrackerPreview from "../../components/projects/GoldTrackerPreview";
import {
  GOLD_CSS,
  GT_SESSION,
  GT_ATMOSPHERE,
  type GTView,
} from "../../components/projects/goldTrackerShared";
import { AMBER_CSS, OT_ROUTE } from "../../components/projects/oilTrackerShared";
import { ORANGE_CSS, BT_ROUTE } from "../../components/projects/btcTrackerShared";

const GoldTrackerCore = dynamic(
  () => import("../../components/projects/GoldTrackerCore"),
  { ssr: false, loading: () => null },
);

function readArrival(): GTView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GT_SESSION);
    if (!raw) return null;
    sessionStorage.removeItem(GT_SESSION);
    const p = JSON.parse(raw) as { v: GTView | null; ts: number };
    if (!p.v || Date.now() - p.ts > 15000) return null;
    return p.v;
  } catch {
    return null;
  }
}

export default function GoldTrackerView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [arrive, setArrive] = useState<GTView | null>(null);
  const [coreReady, setCoreReady] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setArrive(readArrival());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!coreReady) return;
    const t = setTimeout(() => setShowPreview(false), 600);
    return () => clearTimeout(t);
  }, [coreReady]);

  const leave = useCallback(() => {
    if (leaving) return;
    if (reduced) {
      router.push("/#modules");
      return;
    }
    setLeaving(true);
  }, [leaving, reduced, router]);

  return (
    <motion.main
      className="grain fixed inset-0 overflow-hidden bg-[var(--depth-0)]"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.28, ease: "easeInOut" }}
      onAnimationComplete={() => {
        if (leaving) router.push("/#modules");
      }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: GT_ATMOSPHERE }} />

      {mounted && arrive && showPreview && (
        <div className="absolute inset-0">
          <GoldTrackerPreview initialView={arrive} />
        </div>
      )}

      {mounted && (
        <motion.div
          className="absolute inset-x-0 bottom-0 top-12 md:bottom-10 md:top-14"
          initial={{ opacity: 0 }}
          animate={{ opacity: coreReady ? 1 : 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <GoldTrackerCore
            className="h-full w-full"
            initialView={arrive}
            skipIntro={!!arrive}
            onExit={leave}
            onReady={() => setCoreReady(true)}
          />
        </motion.div>
      )}

      <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.72)] px-4 backdrop-blur-md md:h-14 md:px-6">
        <div className="flex min-w-0 items-baseline gap-3 md:gap-4">
          <button
            onClick={leave}
            className="sweep shrink-0 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close Gold Tracker and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">
            /
          </span>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence
          </p>
          <nav
            aria-label="Market surface"
            className="ml-1 hidden items-center gap-0.5 border-l border-[var(--line)] pl-3 sm:flex"
          >
            <a
              href={OT_ROUTE}
              className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors hover:opacity-100"
              style={{ color: AMBER_CSS, opacity: 0.55 }}
              title="Open Oil Tracker"
            >
              Oil
            </a>
            <span
              className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em]"
              style={{ color: GOLD_CSS }}
              aria-current="page"
            >
              Gold
            </span>
            <a
              href={BT_ROUTE}
              className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors hover:opacity-100"
              style={{ color: ORANGE_CSS, opacity: 0.55 }}
              title="Open BTC Tracker"
            >
              BTC
            </a>
          </nav>
        </div>
        <p className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          {!reduced ? (
            <motion.span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: GOLD_CSS }}
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: GOLD_CSS }}
            />
          )}
          <span className="hidden sm:inline">Terminal · mines · holders · flows</span>
          <span className="sm:hidden">Live</span>
        </p>
      </header>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden h-10 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:flex md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          P·02 — Gold Tracker
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          Illustrative routes · live data where shown · not investment advice
        </p>
      </footer>
    </motion.main>
  );
}
