"use client";
/* ────────────────────────────────────────────────────────────────
   Module stage (roadmap #65) — replaces the spine.

   Each module gets the full viewport. A pinned stage steps through
   them with native scroll; moving to the next module plays a pixel
   dissolve: square blocks cover the outgoing module in random order,
   the module swaps under full cover, then the blocks clear in a new
   random order to reveal the next one.

   Phones get the same pinned dissolve with a stacked layout (story on
   top, preview below, index along the bottom). Short viewports (e.g.
   phones in landscape) and reduced motion get plain full-height
   sections in normal flow — no pinning, no dissolve.
──────────────────────────────────────────────────────────────── */
import { LockIcon } from "../LockIcon";
import { Component, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import DeferredModule, { ModulePlaceholder } from "../DeferredModule";

export type StageModule = {
  name: string; category: string; description: string; href: string;
  Component: ComponentType<{ className?: string }>;
  /** Premium module the viewer hasn't unlocked: shown with a lock and no live preview. */
  locked?: boolean;
};

const MIN_HEIGHT = 620;       // desktop / tablet
const MIN_HEIGHT_PHONE = 560; // under 768px wide: stacked layout needs less height
const PHONE = 768;
const BLOCK = 28;            // dissolve block size, CSS px (20 on phones)
const COVER_MS = 320;        // blocks appear
const REVEAL_MS = 380;       // blocks clear
const DEPTH = "#060707";     // --depth-0
const pad = (n: number) => String(n).padStart(2, "0");

class ModuleBoundary extends Component<{ children: ReactNode; name: string; href: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ModulePlaceholder name={this.props.name} href={this.props.href} /> : this.props.children; }
}

/** Fisher–Yates order for n blocks. */
function shuffled(n: number): Uint32Array {
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  return order;
}

/** Whether the pinned, dissolving layout fits this viewport. */
function useStaged(enabled: boolean) {
  const [staged, setStaged] = useState(false);
  useEffect(() => {
    if (!enabled) { setStaged(false); return; }
    const check = () => setStaged(window.innerHeight >= (window.innerWidth < PHONE ? MIN_HEIGHT_PHONE : MIN_HEIGHT));
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [enabled]);
  return staged;
}

/**
 * Pixel dissolve on a canvas over the stage. play(swap) covers, calls swap() under full cover,
 * then reveals. A newer play() while one is running retargets the swap instead of stacking.
 */
function useDissolve(canvas: React.RefObject<HTMLCanvasElement | null>, onIdle: () => void) {
  const running = useRef<{ swap: () => void } | null>(null);
  const idle = useRef(onIdle);
  idle.current = onIdle;
  return useCallback((swap: () => void) => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || document.hidden) { swap(); return; }
    if (running.current) { running.current.swap = swap; return; }
    const job = { swap };
    running.current = job;
    let swapped = false;
    const doSwap = () => { if (!swapped) { swapped = true; job.swap(); } };
    // Safety net: if frames stall (background tab, throttled browser), finish without the effect.
    const fallback = window.setTimeout(() => {
      doSwap();
      ctx.clearRect(0, 0, el.width, el.height);
      if (running.current === job) { running.current = null; idle.current(); }
    }, COVER_MS + REVEAL_MS + 400);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth, h = el.clientHeight;
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const B = w < PHONE ? 20 : BLOCK;
    const cols = Math.ceil(w / B), rows = Math.ceil(h / B), n = cols * rows;
    const coverOrder = shuffled(n), revealOrder = shuffled(n);
    const filled = new Uint8Array(n);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = DEPTH;
    let phase: "cover" | "reveal" = "cover";
    let start = performance.now();
    let done = 0;
    const block = (i: number) => [(i % cols) * B, Math.floor(i / cols) * B] as const;
    const frame = (now: number) => {
      if (phase === "cover") {
        const target = Math.min(n, Math.floor(((now - start) / COVER_MS) * n));
        for (; done < target; done++) { const i = coverOrder[done]; filled[i] = 1; const [x, y] = block(i); ctx.fillRect(x, y, B, B); }
        if (done >= n) { ctx.fillRect(0, 0, w, h); doSwap(); phase = "reveal"; start = now; done = 0; }
      } else {
        const target = Math.min(n, Math.floor(((now - start) / REVEAL_MS) * n));
        for (; done < target; done++) { const i = revealOrder[done]; const [x, y] = block(i); ctx.clearRect(x, y, B, B); }
        if (done >= n) { ctx.clearRect(0, 0, w, h); window.clearTimeout(fallback); if (running.current === job) { running.current = null; idle.current(); } return; }
      }
      if (running.current !== job) return; // the fallback already finished this one
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [canvas]);
}

/** Stand-in for a Premium module's live card: its live preview needs Premium data. */
function LockedPreview({ module }: { module: StageModule }) {
  return <a href={module.href} className="landing-card flex h-full w-full flex-col items-start justify-end gap-3 rounded-sm hairline bg-[var(--depth-1)] p-6">
    <LockIcon className="text-3xl text-[var(--ink-2)]" />
    <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--ink-3)]">A3RO Premium</span>
    <span className="text-2xl font-semibold text-[var(--ink)]">{module.name}</span>
    <span className="max-w-sm text-sm leading-relaxed text-[var(--ink-2)]">{module.description}</span>
    <span className="mt-1 text-sm text-[var(--acid)]">Unlock with Premium →</span>
  </a>;
}

function ModulePage({ module, index, count, live, preload }: { module: StageModule; index: number; count: number; live: boolean; preload: boolean }) {
  return <article className="stage-page" aria-labelledby={`stage-title-${index}`}>
    <div className="stage-story">
      <p className="landing-kicker">{pad(index + 1)} / {pad(count)} · {module.category}{module.locked ? <> · <LockIcon /> Premium</> : null}</p>
      <h3 id={`stage-title-${index}`}>{module.name}</h3>
      <p className="stage-description">{module.description}</p>
      {module.locked
        ? <a className="module-entry sweep" href={module.href}><LockIcon className="mr-2" />Unlock with Premium<span aria-hidden>↗</span></a>
        : <a className="module-entry sweep" href={module.href}>Open {module.name}<span aria-hidden>↗</span></a>}
    </div>
    <div className="stage-preview">
      {module.locked ? <LockedPreview module={module} /> : <ModuleBoundary name={module.name} href={module.href}>
        <DeferredModule name={module.name} href={module.href} className="stage-card-slot" observe={!live} preload={preload}>
          <module.Component className="landing-card flex h-full w-full flex-col" />
        </DeferredModule>
      </ModuleBoundary>}
    </div>
  </article>;
}

export default function ModuleStage({ modules, animated, onModeChange }: {
  modules: readonly StageModule[]; animated: boolean; onModeChange?: (staged: boolean) => void;
}) {
  const count = modules.length;
  const staged = useStaged(animated);
  const runway = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(0);
  const target = useRef(0);
  const shownRef = useRef(0);
  shownRef.current = shown;
  // After each transition: if the reader has scrolled on meanwhile, go to where they are now.
  const dissolve = useDissolve(canvas, () => {
    if (target.current !== shownRef.current) dissolve(() => setShown(target.current));
  });

  useEffect(() => { onModeChange?.(staged); }, [staged, onModeChange]);

  // Which module the reader is on, from native scroll events (no dependence on animation frames).
  useEffect(() => {
    if (!staged) return;
    const onScroll = () => {
      const el = runway.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const span = el.offsetHeight - window.innerHeight;
      if (span <= 0) return;
      const p = Math.max(0, Math.min(1, -rect.top / span));
      const next = Math.max(0, Math.min(count - 1, Math.floor(p * count * 0.999)));
      if (next === target.current) return;
      target.current = next;
      dissolve(() => setShown(target.current));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [staged, count, dissolve]);

  /** Jump to a module: scroll the runway to that module's slot. */
  const go = useCallback((index: number) => {
    const el = runway.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (span * (index + 0.5)) / count, behavior: "instant" });
  }, [count]);

  if (!staged) {
    return <ol className="stage-list" aria-label="Intelligence modules">
      {modules.map((m, i) => <li key={m.href}><ModulePage module={m} index={i} count={count} live={false} preload={false} /></li>)}
    </ol>;
  }

  return <div ref={runway} className="stage-runway" style={{ height: `${count * 100}svh` }}>
    <div className="stage-sticky">
      <div className="stage-frame" aria-live="polite">
        {modules.map((m, i) => <div key={m.href} className="stage-slot" hidden={i !== shown} inert={i !== shown ? true : undefined}>
          <ModulePage module={m} index={i} count={count} live preload={Math.abs(i - shown) <= 1} />
        </div>)}
        <canvas ref={canvas} className="stage-dissolve" aria-hidden />
      </div>
      <nav className="stage-index" aria-label="Jump to a module">
        {modules.map((m, i) => <button key={m.href} type="button" onClick={() => go(i)} aria-current={i === shown ? "true" : undefined} aria-label={`${m.name}${m.locked ? ", Premium" : ""} (${i + 1} of ${count})`}>
          <span>{pad(i + 1)}{m.locked ? <LockIcon className="ml-1 text-[0.85em]" /> : null}</span>
        </button>)}
      </nav>
    </div>
  </div>;
}
