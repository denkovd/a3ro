"use client";
/* ────────────────────────────────────────────────────────────────
   Chrome — persistent header and scroll progress thread.
──────────────────────────────────────────────────────────────── */
import { motion, useScroll, useSpring } from "framer-motion";
import { useMotionPreference } from "./motion";

const LINKS = [
  { label: "Commodity Watch", href: "#top" },
  { label: "Modules", href: "#modules" },
  { label: "Index", href: "#index" },
  { label: "Contact", href: "#contact" },
];

export function Nav() {
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 bg-[rgba(6,7,7,0.9)] hairline-b"
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
    </header>
  );
}

/* The single continuous motion cue: a 1px acid thread tracking progress */
export function ProgressThread() {
  const reduced = useMotionPreference();
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
      style={{ scaleX: reduced ? scrollYProgress : scaleX, background: "var(--acid)" }}
    />
  );
}
