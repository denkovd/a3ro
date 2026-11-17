"use client";
/* ────────────────────────────────────────────────────────────────
   Module spine — the six platforms orbit one structural axis.
   A pinned stage turns the ring with native scroll: the facing card
   docks on the spine, its neighbours wait in half-light either side,
   and markers on the axis count what has passed and what is ahead.

   One markup serves both layouts. Phones, short viewports and reduced
   motion keep the normal-flow list; nothing is remounted on a switch.
   Timeline math lives in ./sequence — see docs/MOTION.md.
──────────────────────────────────────────────────────────────── */
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { useInView, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import DeferredModule, { ModulePlaceholder } from "../DeferredModule";
import { useMotionPreference } from "../motion";
import { nodeState, orbitState, spinePosition, spineRunway, spineStop } from "./sequence";

export type SpineModule = {
  name: string; category: string; description: string; href: string;
  Component: ComponentType<{ className?: string }>;
};

/* Stage geometry in CSS pixels — mirrors the --spine-* tokens in globals.css. */
const HEADER = 61;          // fixed navigation
const CARD = 510;           // preview height
const CAPTION = 140;        // caption block plus its gap above the card
const STAGE_NEED = CARD + CAPTION + 40;
const MIN_FIT = 0.8;        // below this the stage would shrink text too far
const MIN_WIDTH = 768;      // phones keep the list: their cards reflow to natural height
const RADIUS = 0.78;        // ring radius as a share of card width
const NODE_GAP = 34;        // distance between queued spine markers

type Layout = { fit: number; width: number; left: number; junction: number };

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const pad = (value: number) => String(value).padStart(2, "0");

/** Orbit geometry for this viewport, or null when the list should stay in normal flow. */
function useSpineLayout(enabled: boolean) {
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    if (!enabled) { setLayout(null); return; }
    const measure = () => {
      const vw = document.documentElement.clientWidth;
      const fit = Math.min(1, (window.innerHeight - HEADER) / STAGE_NEED);
      if (vw < MIN_WIDTH || fit < MIN_FIT) { setLayout(null); return; }
      // Even widths and whole-pixel offsets keep the docked card's text crisp.
      const width = 2 * Math.round(Math.max(Math.min(vw - 80, 640), Math.min(860, vw * 0.6)) / 2);
      const left = Math.round((vw - width) / 2);
      const junction = Math.round((window.innerHeight - HEADER + CAPTION - CARD) / 2);
      setLayout((previous) => previous && previous.fit === fit && previous.width === width && previous.left === left && previous.junction === junction
        ? previous : { fit, width, left, junction });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [enabled]);
  return layout;
}

class ModuleBoundary extends Component<{ children: ReactNode; name: string; href: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ModulePlaceholder name={this.props.name} href={this.props.href} /> : this.props.children; }
}

function ModuleShowcase({ module, index, orbit, active, preload, register, onFocus }: {
  module: SpineModule; index: number; orbit: boolean; active: boolean; preload: boolean;
  register: (index: number, element: HTMLLIElement | null) => void; onFocus: (index: number, smooth?: boolean) => void;
}) {
  const ref = useRef<HTMLLIElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const reduced = useMotionPreference();
  const visible = orbit || reduced || inView;
  const attach = useCallback((element: HTMLLIElement | null) => { ref.current = element; register(index, element); }, [index, register]);

  return <li ref={attach} data-module={index} aria-current={orbit && active ? "true" : undefined}
    className={"module-showcase" + (visible ? " is-visible" : "") + (orbit && active ? " is-active" : "")}
    onFocusCapture={orbit ? () => onFocus(index) : undefined}
    onMouseDownCapture={orbit && !active ? (event) => event.preventDefault() : undefined}
    onClickCapture={orbit && !active ? (event) => { event.preventDefault(); event.stopPropagation(); onFocus(index, true); } : undefined}>
    <div className="module-story">
      <p className="landing-kicker">{pad(index + 1)} / {module.category}</p>
      <h3>{module.name}</h3>
      <p className="module-description">{module.description}</p>
      <a className="module-entry sweep" href={module.href}>Open {module.name}<span aria-hidden>↗</span></a>
    </div>
    <div className="module-preview">
      <ModuleBoundary name={module.name} href={module.href}>
        <DeferredModule name={module.name} href={module.href} className="landing-card-slot" observe={!orbit} preload={preload}>
          <module.Component className="landing-card flex h-full w-full flex-col" />
        </DeferredModule>
      </ModuleBoundary>
    </div>
  </li>;
}

export default function ModuleSpine({ modules, animated, onModeChange }: {
  modules: readonly SpineModule[]; animated: boolean; onModeChange?: (orbit: boolean) => void;
}) {
  const count = modules.length;
  const runway = useRef<HTMLDivElement>(null);
  const axis = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLLIElement | null)[]>([]);
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const facing = useRef(0);
  const cardHeight = useRef(CARD);
  const [active, setActive] = useState(0);
  const layout = useSpineLayout(animated);
  const orbit = layout !== null;
  const near = useInView(runway, { once: true, margin: "600px 0px" });

  const { scrollYProgress } = useScroll({ target: runway, offset: ["start end", "end end"] });
  const position = useTransform(scrollYProgress, (progress) => spinePosition(progress, count));

  const register = useCallback((index: number, element: HTMLLIElement | null) => { cards.current[index] = element; }, []);

  /* One writer per frame: transforms and custom properties only, no React renders. */
  const paint = useCallback((turn: number) => {
    if (!layout) return;
    const radius = layout.width * RADIUS;
    for (let index = 0; index < count; index++) {
      const card = cards.current[index];
      if (card) {
        const state = orbitState(index - turn);
        card.style.transform = `translate3d(${(state.x * radius).toFixed(2)}px,0,${(state.depth * radius).toFixed(2)}px) rotateY(${state.angle.toFixed(3)}deg)`;
        card.style.zIndex = String(100 - Math.round(Math.abs(index - turn) * 10));
        card.style.pointerEvents = state.presence > 0.5 ? "auto" : "none";
        card.style.setProperty("--presence", state.presence.toFixed(3));
        card.style.setProperty("--shade", state.shade.toFixed(3));
        card.style.setProperty("--focus", state.focus.toFixed(3));
      }
      const node = nodes.current[index];
      if (node) {
        const state = nodeState(index - turn);
        node.style.transform = `translate3d(0,${(state.rail * NODE_GAP + state.foot * cardHeight.current).toFixed(2)}px,0)`;
        node.style.opacity = state.visible.toFixed(3);
        node.style.setProperty("--focus", state.focus.toFixed(3));
        node.classList.toggle("is-passed", index - turn < -0.5);
      }
    }
    const nearest = Math.max(0, Math.min(count - 1, Math.round(turn)));
    axis.current?.style.setProperty("--dock", orbitState(turn - nearest).focus.toFixed(3));
    if (nearest !== facing.current) { facing.current = nearest; setActive(nearest); }
  }, [count, layout]);

  useMotionValueEvent(position, "change", paint);

  useIsomorphicLayoutEffect(() => {
    if (!layout) return;
    cardHeight.current = cards.current[0]?.offsetHeight || CARD;
    paint(position.get());
    const painted = cards.current.slice();
    return () => {
      for (const card of painted) {
        if (!card) continue;
        for (const property of ["transform", "z-index", "pointer-events", "--presence", "--shade", "--focus"]) card.style.removeProperty(property);
      }
    };
  }, [layout, paint, position]);

  useEffect(() => { onModeChange?.(orbit); }, [orbit, onModeChange]);

  /* Focusing or clicking a waiting card turns the ring to it, so every link stays reachable in order. */
  const reveal = useCallback((index: number, smooth = false) => {
    if (!runway.current || index === facing.current) return;
    const top = runway.current.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + spineStop(index, count) * window.innerHeight, behavior: smooth ? "smooth" : "instant" });
  }, [count]);

  const rig = layout ? {
    "--spine-fit": layout.fit, "--spine-w": `${layout.width}px`, "--spine-x": `${layout.left}px`, "--spine-junction": `${layout.junction}px`,
  } as CSSProperties : undefined;

  return <div ref={runway} className="spine-runway" style={orbit ? { height: `${spineRunway(count) * 100}svh` } : undefined}>
    {orbit && <span className="spine-line" aria-hidden />}
    <div className="spine-stage">
      <div className="spine-rig" style={rig}>
        {orbit && <div ref={axis} className="spine-axis" aria-hidden>
          <span className="spine-beam" />
          <span className="spine-halo" />
          <span className="spine-flare" />
          {modules.map((module, index) => <span key={module.href} className="spine-node" ref={(element) => { nodes.current[index] = element; }}><i>{pad(index + 1)}</i></span>)}
        </div>}
        <ol className="module-showcases" aria-label="Intelligence modules">
          {modules.map((module, index) => <ModuleShowcase key={module.href} module={module} index={index} orbit={orbit}
            active={index === active} preload={orbit && near && Math.abs(index - active) <= 1} register={register} onFocus={reveal} />)}
        </ol>
      </div>
    </div>
  </div>;
}
