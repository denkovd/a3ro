"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Gold Tracker · homepage teaser (P·02)
   Gold-themed preview globe + price strip. Expands into
   /Projects/Gold-Tracker. Never imports GoldTrackerCore.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_INOUT } from "../motion";
import GoldTrackerPreview from "./GoldTrackerPreview";
import {
  GOLD_CSS,
  GT_ROUTE,
  GT_SESSION,
  GT_ATMOSPHERE,
  type GTView,
} from "./goldTrackerShared";
import {
  useGoldSnapshot,
  formatPrice,
  formatPct,
  formatAsOf,
} from "./gold/goldData";

type Box = { top: number; left: number; width: number; height: number; vw: number; vh: number };

export default function GoldTracker({ className = "" }: { className?: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLAnchorElement>(null);
  const viewRef = useRef<GTView | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [mounted, setMounted] = useState(false);
  const snap = useGoldSnapshot();

  useEffect(() => {
    setMounted(true);
    router.prefetch(GT_ROUTE);
  }, [router]);

  const open = () => {
    if (box) return;
    try {
      sessionStorage.setItem(GT_SESSION, JSON.stringify({ v: viewRef.current, ts: Date.now() }));
    } catch {
      /* private mode */
    }
    if (reduced) {
      router.push(GT_ROUTE);
      return;
    }
    const r = cardRef.current!.getBoundingClientRect();
    setBox({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      vw: window.innerWidth,
      vh: window.innerHeight,
    });
  };

  const d1 = snap.changes.d1;
  const d1Color = d1 > 0 ? GOLD_CSS : d1 < 0 ? "var(--ink-2)" : "var(--ink-3)";

  return (
    <>
      <a
        ref={cardRef}
        href={GT_ROUTE}
        onClick={(e) => {
          e.preventDefault();
          open();
        }}
        aria-label="Open A3RO Intelligence — Gold Tracker, mines holders and flows"
        className={`group/gt relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
      >
        <div className="relative flex-1 overflow-hidden">
          <div aria-hidden className="absolute inset-0" style={{ background: GT_ATMOSPHERE }} />
          <GoldTrackerPreview viewRef={viewRef} />

          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] group-hover/gt:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
          />

          <div className="pointer-events-none absolute left-5 top-5 max-w-[50%] md:left-7 md:top-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
              P·02 — <span style={{ color: GOLD_CSS }}>Gold</span>
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
              A3RO Intelligence
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
              Gold Tracker
            </h3>
            <p className="mt-2 max-w-[16rem] text-[12px] leading-relaxed text-[var(--ink-2)]">
              Mines, holders, and metal/paper flows — where gold is produced and stock sits.
            </p>
          </div>

          <div className="pointer-events-none absolute right-5 top-5 text-right md:right-7 md:top-7">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
              XAU · {snap.source === "live" ? "live" : "baseline"}
            </p>
            <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-[var(--ink)] md:text-3xl">
              {formatPrice(snap.price.value)}
            </p>
            <p className="mt-0.5 font-mono text-[10px] tabular-nums" style={{ color: d1Color }}>
              {formatPct(d1)} · 1D
            </p>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              As of {formatAsOf(snap.asOf)}
            </p>
          </div>

          <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(3.5rem,9vw,7rem)] font-medium leading-none text-[var(--depth-3)]">
            02
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3 md:px-7">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            Mines · Holders · Flows
          </p>
          <p
            className="font-mono text-[9px] uppercase tracking-[0.2em] transition-colors group-hover/gt:text-[var(--ink)]"
            style={{ color: GOLD_CSS }}
          >
            Open →
          </p>
        </div>
      </a>

      {mounted &&
        box &&
        createPortal(
          <motion.div
            className="fixed z-[100] overflow-hidden bg-[var(--depth-0)]"
            initial={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              borderRadius: 2,
            }}
            animate={{
              top: 0,
              left: 0,
              width: box.vw,
              height: box.vh,
              borderRadius: 0,
            }}
            transition={{ duration: 0.55, ease: EASE_INOUT as unknown as number[] }}
            onAnimationComplete={() => router.push(GT_ROUTE)}
          >
            <div className="absolute inset-0" style={{ background: GT_ATMOSPHERE }} />
            <GoldTrackerPreview labels={false} />
          </motion.div>,
          document.body,
        )}
    </>
  );
}
