"use client";
/* ────────────────────────────────────────────────────────────────
   Chrome — persistent header and scroll progress thread.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { useMotionPreference } from "./motion";
import { useViewer } from "./useViewer";

// Section links are "/#…" so they also work from pages other than the homepage. Commodity Watch opens the globe.
const LINKS = [
  { label: "Commodity Watch", href: "/Projects/Oil-Tracker" },
  { label: "Modules", href: "/#modules" },
  { label: "Markets", href: "/markets" },
  { label: "Assets", href: "/assets" },
  { label: "Calendar", href: "/calendar" },
  { label: "Contact", href: "/#contact" },
];

const authClass = "whitespace-nowrap rounded-sm border border-[var(--line)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)]";

const sideLink = "whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-2)] hover:text-[var(--ink)]";

/** Log in when signed out; Account and Log out when signed in, with Admin for admins. */
function AuthLinks() {
  const viewer = useViewer();
  if (!viewer.signedIn) return <a href="/login" className={authClass}>Log in</a>;
  return <span className="flex items-center gap-3">
    {viewer.admin ? <a href="/owner" className={sideLink}>Admin</a> : null}
    <a href="/account" className={sideLink}>Account</a>
    <form method="post" action="/auth/logout"><button type="submit" className={authClass}>Log out</button></form>
  </span>;
}

const linkClass = "sweep whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]";

/** Full link row from 1280px; below that a Menu button opens the same links, so nothing wraps or overlaps. */
export function Nav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-[rgba(6,7,7,0.9)] hairline-b">
      <div className="flex items-center justify-between gap-6 px-6 py-5 md:px-[max(40px,5vw)]">
        <a href="/#top" className="shrink-0 font-mono text-sm tracking-[0.25em] text-[var(--ink)]" aria-label="A3RO — back to top">
          A3RO
        </a>
        <nav className="hidden min-w-0 items-center gap-6 xl:flex 2xl:gap-8" aria-label="Primary">
          {LINKS.map((l) => <a key={l.href} href={l.href} className={linkClass}>{l.label}</a>)}
        </nav>
        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-2)] hover:text-[var(--ink)] xl:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
          <AuthLinks />
        </div>
      </div>
      {open ? (
        <nav id="site-menu" aria-label="Primary" className="flex flex-col bg-[var(--depth-0)] px-6 pb-4 hairline-t md:px-[max(40px,5vw)] xl:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={`${linkClass} border-b border-[var(--line)] py-3 last:border-b-0`}>
              {l.label}
            </a>
          ))}
        </nav>
      ) : null}
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
