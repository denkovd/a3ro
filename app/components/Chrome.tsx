"use client";
/* ────────────────────────────────────────────────────────────────
   Chrome — persistent header and scroll progress thread.
──────────────────────────────────────────────────────────────── */
import { motion, useScroll, useSpring } from "framer-motion";
import { useMotionPreference } from "./motion";
import { useViewer } from "./useViewer";

// Section links are "/#…" so they also work from pages other than the homepage.
const LINKS = [
  { label: "Commodity Watch", href: "/#top" },
  { label: "Modules", href: "/#modules" },
  { label: "Markets", href: "/markets" },
  { label: "Assets", href: "/assets" },
  { label: "Calendar", href: "/calendar" },
  { label: "Contact", href: "/#contact" },
];

const authClass = "rounded-sm border border-[var(--line)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)]";

/** Log in when signed out; Log out when signed in, with Admin for admins. */
function AuthLinks() {
  const viewer = useViewer();
  if (!viewer.signedIn) return <a href="/login" className={authClass}>Log in</a>;
  return <span className="flex items-center gap-3">
    {viewer.admin ? <a href="/owner" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-2)] hover:text-[var(--ink)]">Admin</a> : null}
    <form method="post" action="/auth/logout"><button type="submit" className={authClass}>Log out</button></form>
  </span>;
}

export function Nav() {
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 bg-[rgba(6,7,7,0.9)] hairline-b"
    >
      <div className="flex items-center justify-between px-6 py-5 md:px-[max(40px,5vw)]">
        <a
          href="/#top"
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
        <div className="flex items-center gap-4">
          <a
            href="/#contact"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--acid)] md:hidden"
          >
            Contact
          </a>
          <AuthLinks />
        </div>
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
