"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Oil Tracker · homepage teaser (P·01)
   A lightweight card: low-detail slow-rotating preview globe, no
   drag, no clickable sub-regions, no data panels. The whole card
   is one link. Clicking it expands the card surface into the
   fullscreen route /Projects/Oil-Tracker, where the heavy engine
   (OilTrackerCore) is lazy-loaded — that module is deliberately
   NOT imported here, so the landing bundle stays light.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_INOUT } from "../motion";
import OilTrackerPreview from "./OilTrackerPreview";
import { AMBER_CSS, OT_ROUTE, OT_SESSION, type OTView } from "./oilTrackerShared";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #101313 0%, var(--depth-1) 55%, #070808 100%)";

type Box = { top: number; left: number; width: number; height: number; vw: number; vh: number };

export default function OilTracker({ className = "" }: { className?: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLAnchorElement>(null);
  const viewRef = useRef<OTView | null>(null);
  const [box, setBox] = useState<Box | null>(null); // set = expansion in flight
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    router.prefetch(OT_ROUTE);
  }, [router]);

  const open = () => {
    if (box) return;
    try {
      sessionStorage.setItem(OT_SESSION, JSON.stringify({ v: viewRef.current, ts: Date.now() }));
    } catch { /* private mode — route falls back to its own intro */ }
    if (reduced) {
      router.push(OT_ROUTE);
      return;
    }
    const r = cardRef.current!.getBoundingClientRect();
    setBox({
      top: r.top, left: r.left, width: r.width, height: r.height,
      vw: window.innerWidth, vh: window.innerHeight,
    });
  };

  return (
    <>
      <a
        ref={cardRef}
        href={OT_ROUTE}
        onClick={(e) => { e.preventDefault(); open(); }}
        aria-label="Open A3RO Intelligence — Oil Tracker, the live corridor intelligence preview"
        className={`group/ot relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
      >
        {/* stage */}
        <div className="relative flex-1 overflow-hidden">
          <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />
          <OilTrackerPreview viewRef={viewRef} />

          {/* corner registration marks — directory grammar */}
          <span aria-hidden className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] group-hover/ot:border-[var(--acid)] group-hover/ot:opacity-100" />
          <span aria-hidden className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30" />

          {/* identity */}
          <div className="pointer-events-none absolute left-5 top-5 max-w-[46%] md:left-7 md:top-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
              P·01 — <span style={{ color: AMBER_CSS }}>Featured</span>
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
              A3RO Intelligence
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
              Oil Tracker
            </h3>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
              Live corridor intelligence for crude, products, and price-sensitive flows.
            </p>
            <p className="mt-2 hidden text-xs leading-relaxed text-[var(--ink-3)] md:block">
              Tracking strategic chokepoints, demand shifts, and price pressure
              across the global oil system.
            </p>
          </div>

          {/* feed status */}
          <p className="pointer-events-none absolute right-5 top-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] md:right-7 md:top-7">
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
            Live monitor · simulated feed
          </p>

          {/* the one affordance */}
          <p className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-base)] group-hover/ot:text-[var(--ink)] md:bottom-6 md:right-7">
            Enter live platform
            <span
              aria-hidden
              className="inline-block transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/ot:translate-x-1"
              style={{ color: AMBER_CSS }}
            >
              →
            </span>
          </p>
        </div>

        {/* card footer — matches the directory grammar */}
        <div className="flex items-baseline justify-between px-5 py-4 hairline-t">
          <h3 className="text-sm font-medium text-[var(--ink)]">A3RO Intelligence — Oil Tracker</h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            Corridor intelligence — live preview
          </p>
        </div>
      </a>

      {/* ── expansion: the card surface morphs into the route ── */}
      {mounted && box && createPortal(
        <motion.div
          className="fixed z-[80] overflow-hidden"
          style={{ background: ATMOSPHERE }}
          initial={{
            top: box.top, left: box.left, width: box.width, height: box.height,
            borderRadius: 2, opacity: 1,
          }}
          animate={{ top: 0, left: 0, width: box.vw, height: box.vh, borderRadius: 0 }}
          transition={{ duration: 0.8, ease: EASE_INOUT as unknown as number[] }}
          onAnimationComplete={() => router.push(OT_ROUTE)}
        >
          {/* the same light globe rides along — the heavy scene loads on the route */}
          <OilTrackerPreview initialView={viewRef.current} />
        </motion.div>,
        document.body
      )}
    </>
  );
}
