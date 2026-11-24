"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useScroll } from "framer-motion";
import { useMotionPreference } from "../motion";
import { ModulePlaceholder } from "../DeferredModule";
import FeatureLoop from "../sections/FeatureLoop";
import CommodityWatch from "../projects/CommodityWatch";
import CommodityHero from "./CommodityHero";
import ModuleStage, { type StageModule } from "./ModuleStage";
import { canSeeRoute } from "../../../lib/access";
import { useViewer } from "../useViewer";

const BullFinder = dynamic(() => import("../projects/BullFinder"), { ssr: false, loading: () => <ModulePlaceholder name="Trend Finder" href="/Projects/Bull-Market-Finder" /> });
const Regime = dynamic(() => import("../projects/RegimeShiftFinder"), { ssr: false, loading: () => <ModulePlaceholder name="Regime" href="/Projects/Regime-Shift" /> });
const Earnings = dynamic(() => import("../projects/EarningsBeat"), { ssr: false, loading: () => <ModulePlaceholder name="Earnings Beat" href="/Projects/Earnings-Beat" /> });
const Australia = dynamic(() => import("../projects/AustraliaWatch"), { ssr: false, loading: () => <ModulePlaceholder name="Australia Watch" href="/Projects/Australia-Watch" /> });
const Dividend = dynamic(() => import("../projects/AIDividend"), { ssr: false, loading: () => <ModulePlaceholder name="AI Dividend" href="/Projects/AI-Dividend" /> });

const MODULES: readonly StageModule[] = [
  { name: "Trend Finder", category: "Find the shift", description: "See which assets have turned bullish on both daily and weekly closes. Explore the market by recency and strength.", href: "/Projects/Bull-Market-Finder", Component: BullFinder },
  { name: "Regime", category: "Read the backdrop", description: "Put the market in context. Track the growth and inflation conditions shaping the current US regime.", href: "/Projects/Regime-Shift", Component: Regime },
  { name: "Earnings Beat", category: "Follow the catalysts", description: "Follow earnings surprises and the signals surrounding them, with a focused view of company results.", href: "/Projects/Earnings-Beat", Component: Earnings },
  { name: "Australia Watch", category: "Keep a local perspective", description: "Bring Australia's economic conditions into focus, alongside the global forces that influence them.", href: "/Projects/Australia-Watch", Component: Australia },
  { name: "AI Dividend", category: "Follow the AI money", description: "Track how much of AI’s capability turns into real output, who captures the value, and what could stop it.", href: "/Projects/AI-Dividend", Component: Dividend },
  { name: "Commodity Watch", category: "Trace the physical market", description: "Explore the producers, shipping corridors and refining networks connecting physical oil flows to market prices.", href: "/Projects/Oil-Tracker", Component: CommodityWatch },
];

export default function LandingExperience() {
  const hero = useRef<HTMLElement>(null);
  const reduced = useMotionPreference();
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const animated = !reduced && !failed;
  const [orbit, setOrbit] = useState(false);
  // Premium modules load gated APIs, so they are only shown to Premium accounts (lib/access.ts).
  const viewer = useViewer();
  const modules = useMemo(() => MODULES.filter((m) => canSeeRoute(m.href, viewer)), [viewer]);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end end"] });

  // Enhancement changes the hero's and the module runway's height. Resolve direct
  // section links again so bookmarks and platform close buttons retain their destination.
  // A later resize that only switches the module layout leaves the reader where they are.
  const settled = useRef({ animated, done: false });
  useEffect(() => {
    const resized = settled.current.done && settled.current.animated === animated;
    settled.current = { animated, done: settled.current.done || orbit };
    if (resized) return;
    const target = location.hash.slice(1);
    if (!["top", "platform", "modules", "method", "index", "contact"].includes(target)) return;
    const raf = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "start", behavior: "instant" }));
    return () => cancelAnimationFrame(raf);
  }, [animated, orbit]);

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

    <section id="modules" className={"module-presentation" + (animated ? " module-handoff" : "") + (orbit ? " module-staged" : "")} aria-labelledby="modules-title">
      <span id="method" className="landing-static-anchor" />
      <div className="module-chapter">
        <p className="landing-kicker">02 / Intelligence platforms</p>
        <h2 id="modules-title">From global flows<br />to focused intelligence.</h2>
        <p className="module-chapter-description">Start with the bigger picture. Go deeper with tools built for the questions that matter.</p>
        <span className="module-chapter-line" aria-hidden />
      </div>
      <ModuleStage modules={modules} animated={animated} onModeChange={setOrbit} />
    </section>
    <FeatureLoop />
  </>;
}
