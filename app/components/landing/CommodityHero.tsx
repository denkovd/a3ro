"use client";

import { useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, useTransform, type MotionValue } from "framer-motion";
import OilTrackerPreview from "../projects/OilTrackerPreview";
import { OT_ROUTE, OT_SESSION, type OTView } from "../projects/oilTrackerShared";
import { EASE_INOUT, useMotionPreference } from "../motion";
import { pullbackState } from "./sequence";

type Arrival = { top: number; left: number; width: number; height: number; vw: number; vh: number; view: OTView | null };

export default function CommodityHero({ progress, animated, onUnavailable }: {
  progress: MotionValue<number>; animated: boolean; onUnavailable: () => void;
}) {
  const router = useRouter();
  const reduced = useMotionPreference();
  const surface = useRef<HTMLDivElement>(null);
  const view = useRef<OTView | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const frame = useTransform(progress, pullbackState);
  const rotation = useTransform(frame, (v) => v.turn);
  const scale = useTransform(frame, (v) => v.scale);
  const lift = useTransform(frame, (v) => v.lift);
  const opacity = useTransform(frame, (v) => v.opacity);
  const visibility = useTransform(progress, (v) => v < 0.98 ? "visible" : "hidden");
  const pointerEvents = useTransform(progress, (v) => v < 0.65 ? "auto" : "none");
  const copyOpacity = useTransform(rotation, [0, 85], [1, 0]);
  const copyY = useTransform(rotation, [0, 85], [0, -32]);
  const copyVisibility = useTransform(rotation, (v) => v < 85 ? "visible" : "hidden");

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (arrival) return;
    try { sessionStorage.setItem(OT_SESSION, JSON.stringify({ v: view.current, ts: Date.now() })); } catch { /* Direct route works without storage. */ }
    if (reduced || !surface.current) { router.push(OT_ROUTE); return; }
    const box = surface.current.getBoundingClientRect();
    setArrival({ top: box.top, left: box.left, width: box.width, height: box.height, vw: innerWidth, vh: innerHeight, view: view.current });
  }

  return <>
    <motion.div ref={surface} className="commodity-field" style={animated ? { scale, y: lift, opacity, visibility } : undefined}>
      <div className="commodity-illumination">
        <OilTrackerPreview cinematic rotation={animated ? rotation : undefined} autoRotate={!arrival} frozen={!animated} viewRef={view} onUnavailable={onUnavailable} />
      </div>
      <motion.a href={OT_ROUTE} onClick={open} onMouseEnter={() => router.prefetch(OT_ROUTE)}
        onFocus={() => router.prefetch(OT_ROUTE)} aria-label="Open Commodity Watch live platform"
        className="commodity-globe-link" style={animated ? { opacity, pointerEvents } : { opacity: 1, pointerEvents: "auto" }} />
    </motion.div>
    <motion.div className="commodity-identity" style={animated ? { opacity: copyOpacity, y: copyY, visibility: copyVisibility } : { opacity: 1 }}>
      <p className="landing-kicker hero-reveal hero-eyebrow">A3RO / Market intelligence</p>
      <h1 className="hero-reveal hero-headline"><span>Understand the forces</span>{" "}<span>moving markets.</span></h1>
      <p className="commodity-description hero-reveal">Commodity flows, market regimes and macro signals.<br className="hero-desktop-break" /> Connected through A3RO.</p>
      <div className="commodity-actions hero-reveal">
        <a href="#modules" className="commodity-primary">Explore the platform <span aria-hidden>↓</span></a>
        <a href={OT_ROUTE} onClick={open} onMouseEnter={() => router.prefetch(OT_ROUTE)} onFocus={() => router.prefetch(OT_ROUTE)} className="sweep commodity-enter">Open Commodity Watch <span aria-hidden>↗</span></a>
      </div>
    </motion.div>
    <motion.p aria-hidden className="commodity-scroll landing-kicker" style={{ opacity: animated ? copyOpacity : 1 }}>
      <span className="commodity-scroll-line" /> Scroll to explore
    </motion.p>
    {arrival && createPortal(
      <motion.div className="fixed z-[100] overflow-hidden bg-[var(--depth-0)]"
        initial={{ top: arrival.top, left: arrival.left, width: arrival.width, height: arrival.height }}
        animate={{ top: 0, left: 0, width: arrival.vw, height: arrival.vh }}
        transition={{ duration: 0.6, ease: EASE_INOUT }}
        onAnimationComplete={() => router.push(OT_ROUTE)}>
        <OilTrackerPreview cinematic initialView={arrival.view} frozen />
      </motion.div>, document.body)}
  </>;
}
