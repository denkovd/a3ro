"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — BTC Tracker · homepage teaser (P·03)
   Lightweight card: orange-themed preview globe. Expands into
   /Projects/BTC-Tracker. Never imports BtcTrackerCore.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_INOUT } from "../motion";
import BtcTrackerPreview from "./BtcTrackerPreview";
import {
  ORANGE_CSS,
  BT_ROUTE,
  BT_SESSION,
  BT_ATMOSPHERE,
  type BTView,
} from "./btcTrackerShared";

type Box = { top: number; left: number; width: number; height: number; vw: number; vh: number };

export default function BtcTracker({ className = "" }: { className?: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLAnchorElement>(null);
  const viewRef = useRef<BTView | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    router.prefetch(BT_ROUTE);
  }, [router]);

  const open = () => {
    if (box) return;
    try {
      sessionStorage.setItem(BT_SESSION, JSON.stringify({ v: viewRef.current, ts: Date.now() }));
    } catch {
      /* private mode */
    }
    if (reduced) {
      router.push(BT_ROUTE);
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

  return (
    <>
      <a
        ref={cardRef}
        href={BT_ROUTE}
        onClick={(e) => {
          e.preventDefault();
          open();
        }}
        aria-label="Open A3RO Intelligence — BTC Tracker, known stock and liquidity flows"
        className={`group/bt relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
      >
        <div className="relative flex-1 overflow-hidden">
          <div aria-hidden className="absolute inset-0" style={{ background: BT_ATMOSPHERE }} />
          <BtcTrackerPreview viewRef={viewRef} />

          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] group-hover/bt:opacity-100"
            style={{ borderColor: undefined }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
          />

          <div className="pointer-events-none absolute left-5 top-5 max-w-[50%] md:left-7 md:top-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
              P·03 — <span style={{ color: ORANGE_CSS }}>BTC</span>
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
              A3RO Intelligence
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
              BTC Tracker
            </h3>
            <p className="mt-2 max-w-[16rem] text-[12px] leading-relaxed text-[var(--ink-2)]">
              Where known Bitcoin sits — exchanges, ETFs, mining — and how liquidity flows between hubs.
            </p>
          </div>

          <span className="pointer-events-none absolute bottom-3 right-4 select-none font-mono text-[clamp(3.5rem,9vw,7rem)] font-medium leading-none text-[var(--depth-3)]">
            03
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3 md:px-7">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            Venues · ETFs · Mining · Flows
          </p>
          <p
            className="font-mono text-[9px] uppercase tracking-[0.2em] transition-colors group-hover/bt:text-[var(--ink)]"
            style={{ color: ORANGE_CSS }}
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
            onAnimationComplete={() => router.push(BT_ROUTE)}
          >
            <div className="absolute inset-0" style={{ background: BT_ATMOSPHERE }} />
            <BtcTrackerPreview labels={false} />
          </motion.div>,
          document.body,
        )}
    </>
  );
}
