"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO motion primitives
   One easing vocabulary, transform/opacity only, once-only reveals.
   All values mirror the CSS tokens in globals.css — see docs/MOTION.md.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import Lenis from "lenis";

/* Shared timing/easing constants (JS mirror of CSS tokens) */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_INOUT = [0.65, 0, 0.35, 1] as const;
export const DUR = {
  micro: 0.16,
  base: 0.32,
  reveal: 0.8,
  scene: 1.2,
} as const;
export const STAGGER = 0.08;

/* ── Smooth scroll (disabled for reduced motion) ── */
export function useSmoothScroll() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [reduced]);
}

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

/* ── Stagger group: children reveal in sequence ── */
export function StaggerGroup({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={{ show: { transition: { staggerChildren: STAGGER } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
  y = 24,
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduced ? { opacity: 1 } : { opacity: 0, y },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: DUR.reveal, ease: EASE_OUT },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/* ── Parallax: element drifts against scroll at a depth ratio ──
   depth < 0 → moves slower (background), depth > 0 → faster (foreground).
   Standard depths: bg −0.15, mid −0.35, fg +0.1. Transform-only. */
export function Parallax({
  children,
  depth = -0.15,
  className = "",
}: {
  children: React.ReactNode;
  depth?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [depth * -160, depth * 160]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={reduced ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}

/* ── useSectionProgress: 0→1 while a section crosses the viewport ── */
export function useSectionProgress(
  ref: React.RefObject<HTMLElement>
): MotionValue<number> {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  return scrollYProgress;
}

/* ── useMounted: gate entrance sequences to the client ── */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
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

/* ── Magnetic: element leans toward the cursor, springs home ── */
export function Magnetic({
  children,
  strength = 0.25,
  className = "",
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const x = useSpring(0, { stiffness: 160, damping: 16, mass: 0.2 });
  const y = useSpring(0, { stiffness: 160, damping: 16, mass: 0.2 });
  const ref = useRef<HTMLDivElement>(null);
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={`inline-block ${className}`}
      style={{ x, y }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
