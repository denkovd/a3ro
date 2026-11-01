"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { motion, useInView, useScroll } from "framer-motion";
import { EASE_OUT, useMotionPreference } from "../motion";
import DeferredModule, { ModulePlaceholder } from "../DeferredModule";
import FeatureLoop from "../sections/FeatureLoop";
import CommodityWatch from "../projects/CommodityWatch";
import CommodityHero from "./CommodityHero";

const BullFinder = dynamic(() => import("../projects/BullFinder"), { ssr: false, loading: () => <ModulePlaceholder name="Trend Finder" href="/Projects/Bull-Market-Finder" /> });
const Regime = dynamic(() => import("../projects/RegimeShiftFinder"), { ssr: false, loading: () => <ModulePlaceholder name="Regime" href="/Projects/Regime-Shift" /> });
const Earnings = dynamic(() => import("../projects/EarningsBeat"), { ssr: false, loading: () => <ModulePlaceholder name="Earnings Beat" href="/Projects/Earnings-Beat" /> });
const Australia = dynamic(() => import("../projects/AustraliaWatch"), { ssr: false, loading: () => <ModulePlaceholder name="Australia Watch" href="/Projects/Australia-Watch" /> });
const Horizon = dynamic(() => import("../projects/MacroHorizon"), { ssr: false, loading: () => <ModulePlaceholder name="Macro Horizon" href="/Projects/Macro-Horizon" /> });

const MODULES = [
  { name: "Trend Finder", category: "Find the shift", description: "See which assets have turned bullish on both daily and weekly closes. Explore the market by recency and strength.", href: "/Projects/Bull-Market-Finder", Component: BullFinder },
  { name: "Regime", category: "Read the backdrop", description: "Put the market in context. Track the growth and inflation conditions shaping the current US regime.", href: "/Projects/Regime-Shift", Component: Regime },
  { name: "Earnings Beat", category: "Follow the catalysts", description: "Follow earnings surprises and the signals surrounding them, with a focused view of company results.", href: "/Projects/Earnings-Beat", Component: Earnings },
  { name: "Australia Watch", category: "Keep a local perspective", description: "Bring Australia's economic conditions into focus, alongside the global forces that influence them.", href: "/Projects/Australia-Watch", Component: Australia },
  { name: "Macro Horizon", category: "Explore what comes next", description: "Connect macro themes, stress and scenarios. Examine the conditions behind a changing market outlook.", href: "/Projects/Macro-Horizon", Component: Horizon },
  { name: "Commodity Watch", category: "Trace the physical market", description: "Explore the producers, shipping corridors and refining networks connecting physical oil flows to market prices.", href: "/Projects/Oil-Tracker", Component: CommodityWatch },
] as const;

class ModuleBoundary extends Component<{ children: ReactNode; name: string; href: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ModulePlaceholder name={this.props.name} href={this.props.href} /> : this.props.children; }
}

function ModuleShowcase({ module, index }: { module: (typeof MODULES)[number]; index: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const reduced = useMotionPreference();
  const visible = reduced || inView;

  return <motion.li ref={ref} className="module-showcase" data-module={index} initial={false}
    animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 24 }}
    transition={{ duration: reduced ? 0 : 0.7, ease: EASE_OUT }}>
    <div className="module-story">
      <p className="landing-kicker">{String(index + 1).padStart(2, "0")} / {module.category}</p>
      <h3>{module.name}</h3>
      <p className="module-description">{module.description}</p>
      <a className="module-entry sweep" href={module.href}>Open {module.name}<span aria-hidden>↗</span></a>
    </div>
    <div className="module-preview">
      <ModuleBoundary name={module.name} href={module.href}>
        <DeferredModule name={module.name} href={module.href} className="landing-card-slot">
          <module.Component className="landing-card flex h-full w-full flex-col" />
        </DeferredModule>
      </ModuleBoundary>
    </div>
  </motion.li>;
}

export default function LandingExperience() {
  const hero = useRef<HTMLElement>(null);
  const reduced = useMotionPreference();
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const animated = !reduced && !failed;
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end end"] });

  // Enhancement changes the hero's height. Resolve direct section links again
  // so bookmarks and platform close buttons retain their intended destination.
  useEffect(() => {
    const target = location.hash.slice(1);
    if (!["top", "platform", "modules", "method", "index", "contact"].includes(target)) return;
    const raf = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "start", behavior: "instant" }));
    return () => cancelAnimationFrame(raf);
  }, [animated]);

  return <>
    <section ref={hero} id="top" className={"landing-hero-section" + (animated ? " landing-pullback" : "")} aria-label="A3RO market intelligence">
      <span id="platform" className="landing-anchor" />
      <div className="landing-hero-stage">
        <div className="commodity-hero" onFocusCapture={() => {
          if (animated && scrollYProgress.get() > 0.5) window.scrollTo({ top: 0, behavior: "instant" });
        }}>
          <CommodityHero progress={scrollYProgress} animated={animated} onUnavailable={fail} />
        </div>
      </div>
    </section>

    <section id="modules" className={"module-presentation" + (animated ? " module-handoff" : "")} aria-labelledby="modules-title">
      <span id="method" className="landing-static-anchor" />
      <div className="module-chapter">
        <p className="landing-kicker">02 / Intelligence platforms</p>
        <h2 id="modules-title">From global flows<br />to focused intelligence.</h2>
        <p className="module-chapter-description">Start with the bigger picture. Go deeper with tools built for the questions that matter.</p>
        <span className="module-chapter-line" aria-hidden />
      </div>
      <ol className="module-showcases" aria-label="Intelligence modules">
        {MODULES.map((module, index) => <ModuleShowcase key={module.href} module={module} index={index} />)}
      </ol>
    </section>
    <FeatureLoop />
  </>;
}
