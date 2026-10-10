"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO motion primitives
   One easing vocabulary, transform/opacity only, once-only reveals.
   All values mirror the CSS tokens in globals.css — see docs/MOTION.md.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotionPreference(listener: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
/** The installed Framer hook captures only the initial preference. */
export function useMotionPreference() {
  return useSyncExternalStore(subscribeMotionPreference, () => window.matchMedia(motionQuery).matches, () => true);
}


/* Shared timing/easing constants (JS mirror of CSS tokens) */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_INOUT = [0.65, 0, 0.35, 1] as const;
export const DUR = {
  micro: 0.16,
  base: 0.32,
  reveal: 0.8,
  scene: 1.2,
} as const;


/* ── Reveal: rise + fade, once, viewport-triggered ──
   The single entrance grammar for content. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "p" | "h2" | "h3" | "li" | "span";
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  const reduced = useReducedMotion();
  const M = motion[Tag];
  return (
    <M
      ref={ref}
      className={className}
      initial={reduced ? { opacity: 1 } : { opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: DUR.reveal, delay, ease: EASE_OUT }}
    >
      {children}
    </M>
  );
}

/* ── useFinePointer: true when a real cursor exists (desktop) ── */
export function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 768px)");
    setFine(mq.matches);
    const fn = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return fine;
}

/* ── MaskText: a line rising out of a clipped mask ──
   The cinematic entrance for headlines. */
export function MaskText({
  children,
  delay = 0,
  className = "",
  trigger,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  trigger?: boolean; // if provided, animates when true; else on inView
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  const reduced = useReducedMotion();
  const go = trigger !== undefined ? trigger : inView;
  return (
    <span ref={ref} className={`block overflow-hidden ${className}`}>
      <motion.span
        className="block will-change-transform"
        initial={reduced ? { y: 0 } : { y: "115%" }}
        animate={go ? { y: 0 } : undefined}
        transition={{ duration: 0.9, delay, ease: EASE_OUT }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/* ── wrap: modulo that survives negatives — seamless loop math ── */
export const wrap = (min: number, max: number, v: number) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};
