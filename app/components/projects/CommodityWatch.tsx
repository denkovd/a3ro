"use client";

import { OT_ROUTE, AMBER_CSS } from "./oilTrackerShared";

/** The hero owns the globe; this directory entry keeps the platform within reach. */
export default function CommodityWatch({ className = "" }: { className?: string }) {
  return <a href={OT_ROUTE} aria-label="Commodity Watch — open live platform"
    className={`commodity-card relative rounded-sm hairline bg-[var(--depth-1)] ${className}`}>
    <div className="flex flex-1 flex-col justify-center p-7 md:p-10">
      <p className="landing-kicker" style={{ color: AMBER_CSS }}>P·01 / Commodity Watch</p>
      <h3 className="mt-6 text-3xl font-semibold tracking-tight md:text-4xl">Commodity Watch</h3>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--ink-2)]">Live corridor intelligence for crude, products, and price-sensitive flows.</p>
      <span aria-hidden className="commodity-card-line my-8" />
      <span className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: AMBER_CSS }}>Enter live platform ↗</span>
    </div>
    <div className="flex flex-wrap justify-between gap-3 px-7 py-4 hairline-t">
      <span className="text-sm">A3RO Intelligence</span><span className="landing-kicker">Corridor intelligence</span>
    </div>
  </a>;
}
