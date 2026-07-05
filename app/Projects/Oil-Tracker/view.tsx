"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Oil-Tracker — fullscreen experience shell
   Arrives from the expanding homepage card: shows the same light
   preview instantly (seamless hand-off), lazy-loads the heavy
   engine, then cross-fades to it. Direct visits skip the preview
   and let the engine play its own intro. Esc or "Index" returns
   smoothly to the homepage work section.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import OilTrackerPreview from "../../components/projects/OilTrackerPreview";
import { AMBER_CSS, OT_SESSION, type OTView } from "../../components/projects/oilTrackerShared";

/* the heavy globe engine — loaded only on this route, after arrival */
const OilTrackerCore = dynamic(() => import("../../components/projects/OilTrackerCore"), {
  ssr: false,
  loading: () => null,
});

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #101313 0%, var(--depth-1) 55%, #070808 100%)";

function readArrival(): OTView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(OT_SESSION);
    if (!raw) return null;
    sessionStorage.removeItem(OT_SESSION);
    const p = JSON.parse(raw) as { v: OTView | null; ts: number };
    if (!p.v || Date.now() - p.ts > 15000) return null;
    return p.v;
  } catch {
    return null;
  }
}

export default function OilTrackerView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [arrive, setArrive] = useState<OTView | null>(null);
  const [coreReady, setCoreReady] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setArrive(readArrival());
    setMounted(true);
  }, []);

  /* once the engine has drawn underneath, retire the light preview */
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
      onAnimationComplete={() => { if (leaving) router.push("/#modules"); }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />

      {/* light preview holds the frame while the engine loads (card arrivals) */}
      {mounted && arrive && showPreview && (
        <div className="absolute inset-0">
          <OilTrackerPreview initialView={arrive} />
        </div>
      )}

      {/* heavy engine — lazy chunk, fades in over the preview */}
      {mounted && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: coreReady ? 1 : 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <OilTrackerCore
            className="h-full w-full"
            initialView={arrive}
            skipIntro={!!arrive}
            onExit={leave}
            onReady={() => setCoreReady(true)}
          />
        </motion.div>
      )}

      {/* ── top chrome ── */}
      <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <div className="flex items-baseline gap-4">
          <button
            onClick={leave}
            className="sweep font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close Oil Tracker and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Oil Tracker
          </p>
        </div>
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          {!reduced ? (
            <motion.span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: AMBER_CSS }}
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: AMBER_CSS }} />
          )}
          Live monitor · benchmark feed
        </p>
      </header>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          P·01 — Featured build
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          Benchmark prices live · corridor signals modeled · not investment advice
        </p>
      </footer>
    </motion.main>
  );
}
