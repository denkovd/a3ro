"use client";
/* ────────────────────────────────────────────────────────────────
   EventOverlay — shared vertical-marker + hover-tooltip layer for
   the repo's hand-rolled SVG time-axis charts (no charting library
   here; see PLAN-frontend-intelligence-modules.md Task 2).

   Pure HTML/CSS, absolutely positioned over a chart's own <svg> —
   not SVG itself, so it never has to coordinate with each chart's
   internal viewBox/path markup. The only contract with the caller is
   geometric: `positioned` carries each event's x in the SAME unit
   the caller already uses for its own bars (real px for a fixed-size
   chart, viewBox units for a `preserveAspectRatio="none"` chart, ...);
   `width` is the caller's chart width in that same unit. This
   component only ever turns (x / width) into a percentage, so it
   works for both without knowing which kind of unit it was given.

   Caller contract:
   - wrap the chart's own <svg> in a `position:relative` box sized to
     exactly the chart's rendered box (same width/height CSS as the
     svg itself), and render <EventOverlay/> as its sibling inside
     that box — see BtcPriceChart.tsx / OilTrackerCore.tsx for the
     two current integrations.
   - pass already-filtered, already-positioned events (see
     positionEvents() in events/eventsData.ts); this component does
     no data fetching or category filtering of its own.

   Rendering zero markers (empty `positioned`) renders nothing at
   all — the chart underneath is untouched, pixel for pixel.
──────────────────────────────────────────────────────────────── */
import { useState } from "react";
import type { EventImportance, PositionedEvent } from "./events/eventsData";
import { CATEGORY_LABEL } from "./events/eventsData";

const IMPORTANCE_OPACITY: Record<EventImportance, number> = { high: 0.85, medium: 0.5, low: 0.28 };

export default function EventOverlay({
  positioned,
  width,
  height,
  color = "var(--ink-3)",
}: {
  positioned: PositionedEvent[];
  width: number;
  height: number;
  color?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  if (positioned.length === 0) return null;

  const hovered = positioned.find((p) => p.event.id === hoveredId) ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {positioned.map(({ event, x }) => (
        <div
          key={event.id}
          className="pointer-events-auto absolute top-0 -translate-x-1/2 cursor-help"
          style={{ left: `${(x / width) * 100}%`, height, width: 9 }}
          onMouseEnter={() => setHoveredId(event.id)}
          onMouseLeave={() => setHoveredId((id) => (id === event.id ? null : id))}
        >
          <div
            className="mx-auto h-full w-px"
            style={{ background: color, opacity: IMPORTANCE_OPACITY[event.importance] }}
          />
        </div>
      ))}

      {hovered && (
        <div
          className="absolute z-30 w-max max-w-[190px] -translate-x-1/2 rounded-[3px] border border-[var(--line)] bg-[rgba(8,9,9,0.95)] px-2 py-1.5 backdrop-blur-md"
          style={{ left: `${(hovered.x / width) * 100}%`, top: 2 }}
        >
          <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
            {hovered.event.date} · {CATEGORY_LABEL[hovered.event.category] ?? hovered.event.category}
            {hovered.event.userAdded ? " · user" : ""}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--ink)]">{hovered.event.label}</p>
        </div>
      )}
    </div>
  );
}
