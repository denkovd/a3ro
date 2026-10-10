"use client";

import { Component, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useMotionPreference } from "../motion";
import DeferredModule, { ModulePlaceholder } from "../DeferredModule";
import FeatureLoop from "../sections/FeatureLoop";
import CommodityWatch from "../projects/CommodityWatch";
import CommodityHero from "./CommodityHero";
import { orbitPose, readingProgress, sequenceState, sequenceTiming } from "./sequence";

const BullFinder = dynamic(() => import("../projects/BullFinder"), { ssr: false, loading: () => <ModulePlaceholder name="Trend Finder" href="/Projects/Bull-Market-Finder" /> });
const Regime = dynamic(() => import("../projects/RegimeShiftFinder"), { ssr: false, loading: () => <ModulePlaceholder name="Regime" href="/Projects/Regime-Shift" /> });
const Earnings = dynamic(() => import("../projects/EarningsBeat"), { ssr: false, loading: () => <ModulePlaceholder name="Earnings Beat" href="/Projects/Earnings-Beat" /> });
const Australia = dynamic(() => import("../projects/AustraliaWatch"), { ssr: false, loading: () => <ModulePlaceholder name="Australia Watch" href="/Projects/Australia-Watch" /> });
const MODULES = [
  { name: "Trend Finder", href: "/Projects/Bull-Market-Finder", Component: BullFinder },
  { name: "Regime", href: "/Projects/Regime-Shift", Component: Regime },
  { name: "Earnings Beat", href: "/Projects/Earnings-Beat", Component: Earnings },
  { name: "Australia Watch", href: "/Projects/Australia-Watch", Component: Australia },
  { name: "Commodity Watch", href: "/Projects/Oil-Tracker", Component: CommodityWatch },
] as const;
type Frame = ReturnType<typeof sequenceState>;

class ModuleBoundary extends Component<{ children: ReactNode; name: string; href: string; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <ModulePlaceholder name={this.props.name} href={this.props.href} /> : this.props.children; }
}

function OrbitCard({ index, frame, animated, width, height, mobile, preload, onFocus, onFailure }: {
  index: number; frame: MotionValue<Frame>; animated: boolean; width: number; height: number; mobile: boolean;
  preload: boolean; onFocus: () => void; onFailure: () => void;
}) {
  const module = MODULES[index];
  const pose = useTransform(frame, (v) => orbitPose(index, v.orbit, width, height, mobile));
  const x = useTransform(pose, (v) => v.x);
  const y = useTransform(() => pose.get().y + (1 - frame.get().appear) * height * 0.3 - frame.get().release * height * 0.25);
  const z = useTransform(pose, (v) => v.z);
  const scale = useTransform(pose, (v) => v.scale);
  const opacity = useTransform(() => pose.get().opacity * frame.get().appear * (1 - frame.get().release));
  const zIndex = useTransform(pose, (v) => v.zIndex);
  const pointerEvents = useTransform(frame, (v) => v.active === index && v.appear > 0.95 && v.release < 0.05 ? "auto" : "none");
  // Billboard the face: orbital rotation and its counter-rotation cancel before
  // compositing. Nested opposing CSS rotations flatten when opacity is applied.
  return <motion.li className="orbit-card" data-module={index} onFocusCapture={onFocus}
    style={animated ? { x, y, z, scale, zIndex, pointerEvents } : { x: 0, y: 0, z: 0, scale: 1, zIndex: 1, pointerEvents: "auto" }}>
    <motion.div className="orbit-card-face" style={{ opacity: animated ? opacity : 1 }}>
      <ModuleBoundary name={module.name} href={module.href} onFailure={onFailure}>
        <DeferredModule name={module.name} href={module.href} className="landing-card-slot" preload={preload} observe={!animated}>
          <module.Component className="landing-card flex h-full w-full flex-col" />
        </DeferredModule>
      </ModuleBoundary>
    </motion.div>
  </motion.li>;
}

export default function LandingExperience() {
  const root = useRef<HTMLElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const reduced = useMotionPreference();
  const [layout, setLayout] = useState({ width: 0, height: 0, header: 64, supported: false });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const restore = useRef<{ card?: number; progress?: number; anchor?: string } | null>(null);
  const restoredInitialHash = useRef(false);
  const [list, setList] = useState(false);
  const [failed, setFailed] = useState(false);
  const [crowded, setCrowded] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const mobile = layout.width < 768;
  const usable = layout.height - layout.header;
  const animated = layout.supported && !reduced && !list && !failed && !crowded && usable >= (mobile ? 650 : 600);
  const timing = sequenceTiming(mobile, MODULES.length);
  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end end"] });
  const frame = useTransform(scrollYProgress, (p) => sequenceState(p, timing));
  const rotation = useTransform(frame, (v) => v.turn);
  const morph = useTransform(frame, (v) => v.morph);
  const modulesOpacity = useTransform(frame, (v) => v.appear * (1 - v.release));
  const stageOpacity = useTransform(frame, (v) => 1 - v.release);
  const controlsVisibility = useTransform(frame, (v) => v.release < 0.05 ? "visible" : "hidden");
  const activeText = useTransform(frame, (v) => String(v.active + 1).padStart(2, "0"));
  const [preloadThrough, setPreloadThrough] = useState(-1);
  const loadedThrough = useRef(-1);
  useMotionValueEvent(frame, "change", (value) => {
    if (animated && value.morph > 0.25 && value.active + 1 > loadedThrough.current) {
      loadedThrough.current = value.active + 1;
      setPreloadThrough(value.active + 1);
    }
  });

  useEffect(() => {
    const measure = () => {
      const header = document.querySelector("header")?.getBoundingClientRect().height ?? 64;
      const next = { width: window.innerWidth, height: probe.current?.offsetHeight ?? innerHeight, header,
        supported: !!window.ResizeObserver && !!window.IntersectionObserver && CSS.supports("perspective", "1000px") };
      const old = layoutRef.current;
      if (old.width && (old.width !== next.width || old.height !== next.height) && root.current) {
        const index = document.getElementById("index");
        if (index && index.getBoundingClientRect().top < old.height / 2) {
          restore.current = { anchor: document.getElementById("contact")!.getBoundingClientRect().top < old.height ? "contact" : "index" };
        } else if (root.current.classList.contains("landing-animated")) {
          restore.current = frame.get().appear > 0.5 ? { card: frame.get().active } : { progress: scrollYProgress.get() };
        } else if (window.scrollY > old.height / 2) {
          const cards = Array.from(root.current.querySelectorAll<HTMLElement>("[data-module]"));
          const nearest = cards.reduce((best, card) => Math.abs(card.getBoundingClientRect().top) < Math.abs(best.getBoundingClientRect().top) ? card : best, cards[0]);
          restore.current = { card: Number(nearest?.dataset.module ?? 0) };
        }
      }
      setLayout((old) => Object.keys(next).every((key) => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (probe.current) observer?.observe(probe.current);
    const header = document.querySelector("header");
    if (header) observer?.observe(header);
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, []);

  useEffect(() => setCrowded(false), [layout.width, layout.height]);

  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  const focusCard = (index: number) => {
    if (!animated || !root.current) return;
    const top = root.current.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + readingProgress(index, timing) * (root.current.offsetHeight - layout.height), behavior: "instant" });
  };

  // Restore the reading position after a breakpoint change or layout switch.
  // Initial hashes are resolved again after enhancement changes document height.
  useEffect(() => {
    if (!layout.width) return;
    const position = restore.current;
    restore.current = null;
    const target = !restoredInitialHash.current ? location.hash.slice(1) : "";
    restoredInitialHash.current = true;
    const raf = requestAnimationFrame(() => {
      if (position?.card !== undefined) {
        if (animated) focusCard(position.card);
        else root.current?.querySelector(`[data-module="${position.card}"]`)?.scrollIntoView({ block: "start", behavior: "instant" });
      } else if (position?.progress !== undefined && animated && root.current) {
        window.scrollTo({ top: root.current.offsetTop + position.progress * (root.current.offsetHeight - layout.height), behavior: "instant" });
      } else if (position?.anchor || ["top", "platform", "modules", "method", "index", "contact"].includes(target)) {
        document.getElementById(position?.anchor || target)?.scrollIntoView({ behavior: "instant", block: "start" });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [animated, layout.width, layout.height, mobile]);

  useEffect(() => {
    if (!animated || !root.current) return;
    const check = () => {
      const cards = root.current?.querySelectorAll<HTMLElement>(".landing-card");
      if (cards && Array.from(cards).some((card) => {
        const body = card.querySelector<HTMLElement>(".landing-card-body");
        // Decorative ghost numerals intentionally bleed beyond the preview.
        // Measure the actual reading surfaces rather than their painted overflow.
        const content = body?.querySelectorAll<HTMLElement>(".landing-card-identity, .landing-card-readout, .landing-card-dial");
        return card.scrollHeight > card.clientHeight + 4 || !!body && !!content && Array.from(content).some((part) => part.offsetTop + part.scrollHeight > body.clientHeight + 4);
      })) setCrowded(true);
    };
    const observer = new ResizeObserver(check);
    root.current.querySelectorAll(".landing-card-slot").forEach((card) => observer.observe(card));
    const contentObserver = new MutationObserver(check);
    contentObserver.observe(root.current, { childList: true, subtree: true, characterData: true });
    document.fonts.ready.then(check);
    return () => { observer.disconnect(); contentObserver.disconnect(); };
  }, [animated, preloadThrough]);

  const toggleList = () => {
    if (!list) restore.current = { card: frame.get().active };
    else {
      const cards = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-module]") ?? []);
      const nearest = cards.reduce((best, card) => Math.abs(card.getBoundingClientRect().top - layout.header) < Math.abs(best.getBoundingClientRect().top - layout.header) ? card : best, cards[0]);
      restore.current = { card: Number(nearest?.dataset.module ?? 0) };
    }
    setList((value) => !value);
  };
  const rootStyle = { "--landing-header": `${layout.header}px`, "--card-height": `${Math.min(mobile ? 560 : 530, usable - 110)}px`,
    height: animated ? `${timing.total + 100}svh` : undefined } as CSSProperties;

  return <>
    <div ref={probe} className="landing-viewport-probe" aria-hidden />
    <section ref={root} id="top" className={`landing-experience ${animated ? "landing-animated" : "landing-list"}`} style={rootStyle} aria-label="A3RO intelligence platforms">
      <span id="platform" className="landing-anchor" />
      {animated && <><span id="modules" className="landing-anchor" style={{ top: `${readingProgress(0, timing) * timing.total}svh` }} />
        <span id="method" className="landing-anchor" style={{ top: `${readingProgress(0, timing) * timing.total}svh` }} /></>}
      <div className="landing-stage">
        <div className="landing-scene">
          <motion.div className="commodity-hero" style={{ opacity: animated ? stageOpacity : 1 }} onFocusCapture={() => {
            if (animated && morph.get() > 0) window.scrollTo({ top: 0, behavior: "instant" });
          }}>
            <CommodityHero rotation={rotation} morph={morph} animated={animated} onUnavailable={fail} />
          </motion.div>
          <div className="module-presentation">
            {!animated && <><span id="modules" className="landing-static-anchor" /><span id="method" className="landing-static-anchor" /></>}
            <motion.div className="module-heading" style={{ opacity: animated ? modulesOpacity : 1 }}>
              <h2 className="landing-kicker">02 / Modules</h2>
              <p className="landing-kicker" aria-hidden><motion.span>{animated ? activeText : "05"}</motion.span> / 05</p>
            </motion.div>
            <ol className="module-orbit" aria-label="Intelligence modules">
              {MODULES.map((module, index) => <OrbitCard key={module.href} index={index} frame={frame} animated={animated}
                width={layout.width} height={usable} mobile={mobile} preload={animated && index <= preloadThrough}
                onFocus={() => focusCard(index)} onFailure={fail} />)}
            </ol>
          </div>
          {visible && layout.supported && !reduced && !failed && !crowded && usable >= (mobile ? 650 : 600) && <motion.button type="button" className="landing-layout-toggle sweep"
            style={{ visibility: animated ? controlsVisibility : "visible" }}
            aria-pressed={list} onClick={toggleList}>{list ? "View orbit" : "View as list"}</motion.button>}
        </div>
      </div>
    </section>
    <div className={animated ? "landing-index-overlap" : undefined}><FeatureLoop staticMode={!animated} /></div>
  </>;
}
