"use client";
/* ────────────────────────────────────────────────────────────────
   Chrome — persistent UI: nav bar, scroll progress thread,
   and the entrance veil that lifts once on load.
──────────────────────────────────────────────────────────────── */
import { motion, useScroll, useSpring, useReducedMotion } from "framer-motion";
import { DUR, EASE_INOUT, EASE_OUT, useMounted } from "./motion";

const LINKS = [
  { label: "Platform", href: "#platform" },
  { label: "Modules", href: "#modules" },
  { label: "Method", href: "#method" },
  { label: "Contact", href: "#contact" },
];

export function Nav() {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  return (
    <motion.header
      initial={reduced ? false : { y: -16, opacity: 0 }}
      animate={mounted ? { y: 0, opacity: 1 } : undefined}
      transition={{ duration: DUR.reveal, delay: 0.9, ease: EASE_OUT }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-10">
        <a
          href="#top"
          className="font-mono text-sm tracking-[0.25em] text-[var(--ink)]"
          aria-label="A3RO — back to top"
        >
          A3RO
        </a>
        <nav className="hidden gap-8 md:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="sweep font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <a
          href="#contact"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--acid)] md:hidden"
        >
          Contact
        </a>
      </div>
    </motion.header>
  );
}

/* The single continuous motion cue: a 1px acid thread tracking progress */
export function ProgressThread() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[55] h-px origin-left"
      style={{ scaleX, background: "var(--acid)" }}
    />
  );
}

/* Entrance veil — black frame; an acid thread draws across it,
   then the veil parts upward like a curtain. Once per visit. */
export function EntranceVeil() {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div
      aria-hidden
      initial={{ y: 0 }}
      animate={mounted ? { y: "-100%", transitionEnd: { display: "none" } } : undefined}
      transition={{ duration: DUR.scene, delay: 0.75, ease: EASE_INOUT }}
      style={{ pointerEvents: "none", background: "var(--depth-0)" }}
      className="fixed inset-0 z-[70] flex items-center justify-center will-change-transform"
    >
      <div className="relative h-px w-40 overflow-hidden bg-[var(--line)]">
        <motion.span
          className="absolute inset-0 origin-left"
          style={{ background: "var(--acid)" }}
          initial={{ scaleX: 0 }}
          animate={mounted ? { scaleX: 1 } : undefined}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT }}
        />
      </div>
    </motion.div>
  );
}
