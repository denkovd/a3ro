"use client";

import { useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, useTransform, type MotionValue } from "framer-motion";
import OilTrackerPreview from "../projects/OilTrackerPreview";
import { OT_ROUTE, OT_SESSION, type OTView } from "../projects/oilTrackerShared";
import { EASE_INOUT, useMotionPreference } from "../motion";

type Arrival = { top: number; left: number; width: number; height: number; vw: number; vh: number; view: OTView | null };

export default function CommodityHero({ rotation, morph, animated, onUnavailable }: {
  rotation: MotionValue<number>; morph: MotionValue<number>; animated: boolean; onUnavailable: () => void;
}) {
  const router = useRouter();
  const reduced = useMotionPreference();
  const surface = useRef<HTMLDivElement>(null);
  const view = useRef<OTView | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const opacity = useTransform(morph, [0, 0.35], [1, 0]);
  const pointerEvents = useTransform(morph, (v) => v < 0.05 ? "auto" : "none");

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
    <div ref={surface} className="commodity-field">
      <OilTrackerPreview rotation={animated ? rotation : undefined} morph={animated ? morph : undefined} autoRotate={!arrival} frozen={!animated} viewRef={view} onUnavailable={onUnavailable} />
      <motion.a href={OT_ROUTE} onClick={open} onMouseEnter={() => router.prefetch(OT_ROUTE)}
        onFocus={() => router.prefetch(OT_ROUTE)} aria-label="Open Commodity Watch live platform"
        className="commodity-globe-link" style={animated ? { opacity, pointerEvents } : { opacity: 1, pointerEvents: "auto" }} />
    </div>
    <motion.div className="commodity-identity" style={animated ? { opacity, pointerEvents } : { opacity: 1, pointerEvents: "auto" }}>
      <p className="landing-kicker">01 / Live platform</p>
      <h1>Commodity Watch</h1>
      <a href={OT_ROUTE} onClick={open} className="sweep commodity-enter">Enter live platform <span aria-hidden>↗</span></a>
    </motion.div>
    <motion.p aria-hidden className="commodity-scroll landing-kicker" style={{ opacity: animated ? opacity : 1 }}>
      <span className="commodity-scroll-line" /> Scroll to explore
    </motion.p>
    {arrival && createPortal(
      <motion.div className="fixed z-[100] overflow-hidden bg-[var(--depth-0)]"
        initial={{ top: arrival.top, left: arrival.left, width: arrival.width, height: arrival.height }}
        animate={{ top: 0, left: 0, width: arrival.vw, height: arrival.vh }}
        transition={{ duration: 0.6, ease: EASE_INOUT }}
        onAnimationComplete={() => router.push(OT_ROUTE)}>
        <OilTrackerPreview initialView={arrival.view} frozen />
      </motion.div>, document.body)}
  </>;
}
