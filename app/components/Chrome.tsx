"use client";
/* ────────────────────────────────────────────────────────────────
   Chrome — persistent header and scroll progress thread.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { useMotionPreference } from "./motion";
import { useViewer } from "./useViewer";
import { LockIcon } from "./LockIcon";
import { canSeeRoute, type Viewer } from "../../lib/access";
import { NAV_COMMODITIES, NAV_MODULES, type NavItem } from "../../lib/navModules";

// Section links are "/#…" so they also work from pages other than the homepage. Commodity Watch opens the globe.
// Commodity Watch and Modules open a list so a visitor can go straight to one (28 Nov).
const LINKS: { label: string; href: string; menu?: readonly NavItem[]; menuFooter?: { label: string; href: string } }[] = [
  { label: "Commodity Watch", href: "/Projects/Oil-Tracker", menu: NAV_COMMODITIES },
  { label: "Modules", href: "/#modules", menu: NAV_MODULES, menuFooter: { label: "All modules on the home page", href: "/#modules" } },
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

const isLocked = (item: NavItem, viewer: Viewer) => (item.premium ? !viewer.premium : !canSeeRoute(item.route, viewer));

function MenuItems({ items, viewer, onPick, row }: { items: readonly NavItem[]; viewer: Viewer; onPick: () => void; row: string }) {
  return <>{items.map((item) => {
    const locked = isLocked(item, viewer);
    return <a key={item.route} href={item.route} onClick={onPick} className={row} title={locked ? `${item.label} · Premium` : undefined}>
      <span>{item.label}</span>
      {locked ? <span className="flex items-center gap-1 text-[9px] text-[var(--ink-3)]"><LockIcon title="Premium" />Premium</span> : null}
    </a>;
  })}</>;
}

/** Desktop dropdown: opens on click, closes on a pick, Escape or a click elsewhere. */
function NavMenu({ link, viewer }: { link: (typeof LINKS)[number]; viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const id = `menu-${link.label.toLowerCase().replace(/\s+/g, "-")}`;
  return <div ref={ref} className="relative">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} className={`${linkClass} inline-flex items-center gap-1.5`}>
      {link.label}<span aria-hidden className={`text-[8px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
    {open ? <div id={id} className="absolute left-1/2 top-full z-50 mt-4 w-64 -translate-x-1/2 rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.97)] py-1.5 shadow-2xl backdrop-blur-md">
      <MenuItems items={link.menu!} viewer={viewer} onPick={() => setOpen(false)}
        row="flex items-center justify-between gap-3 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-2)] hover:bg-[var(--depth-1)] hover:text-[var(--ink)]" />
      {link.menuFooter ? <a href={link.menuFooter.href} onClick={() => setOpen(false)} className="mt-1 block border-t border-[var(--line)] px-4 pb-1 pt-2.5 text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]">{link.menuFooter.label} ↓</a> : null}
    </div> : null}
  </div>;
}

/** Full link row from 1280px; below that a Menu button opens the same links, so nothing wraps or overlaps. */
export function Nav() {
  const [open, setOpen] = useState(false);
  const viewer = useViewer();
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
          {LINKS.map((l) => l.menu ? <NavMenu key={l.href} link={l} viewer={viewer} /> : <a key={l.href} href={l.href} className={linkClass}>{l.label}</a>)}
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
          {LINKS.map((l) => l.menu ? (
            <details key={l.href} className="border-b border-[var(--line)]">
              <summary className={`${linkClass} flex cursor-pointer list-none items-center justify-between py-3`}>{l.label}<span aria-hidden className="text-[8px]">▾</span></summary>
              <div className="pb-2 pl-3">
                <MenuItems items={l.menu} viewer={viewer} onPick={() => setOpen(false)}
                  row="flex items-center justify-between gap-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-2)] hover:text-[var(--ink)]" />
              </div>
            </details>
          ) : (
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
