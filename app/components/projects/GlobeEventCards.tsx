"use client";
/* ────────────────────────────────────────────────────────────────
   Globe event cards (roadmap #95), shared by every globe.

   A "red" event (a disruption, outage or closure) gets a floating card
   joined by a leader line to a pulsing red ring at its place on the
   globe, with 2–3 short stats and a "Read more" button that opens the
   full detail in the globe's sidebar.

   The globe keeps its own engine. All it does is call
   `api.current.place(frame)` at the end of each draw with a projector
   for (lon, lat); this component moves its DOM nodes directly (no React
   render per frame). Cards on the far side of the globe fade out;
   at most 3 show on desktop and 1 on narrow screens (the most
   front-facing), and each can be dismissed for the visit.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

export interface GlobeEventStat { label: string; value: string }

export interface GlobeEvent {
  id: string;
  lon: number;
  lat: number;
  /** Short kind label above the title, e.g. "Mine halted". */
  kicker: string;
  title: string;
  /** 2–3 short stats; extras are dropped. */
  stats: readonly GlobeEventStat[];
  /** Globe item id the sidebar opens on "Read more". */
  focusId: string;
}

export interface GlobeEventFrame {
  project: (lon: number, lat: number) => { x: number; y: number; z: number };
  cx: number; cy: number; R: number;
  /** Width of the globe area (excludes a desktop sidebar). */
  areaW: number;
  h: number;
  narrow: boolean;
  /** An item is selected: on narrow screens the sidebar covers the cards. */
  selected: string | null;
}

export interface GlobeEventsApi { place: (frame: GlobeEventFrame) => void }

export const EVENT_RED = "#e87869";
const RED = (a: number) => `rgba(232,120,105,${a})`;
const CARD_W = 216;
const GAP = 10;
const TOP = 12;
const MIN_Z = 0.18;

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Where a card goes. Tries 8 directions around the event, starting with
 * "outward from the globe centre", and keeps the first spot that stays on
 * screen, clears cards already placed and doesn't cover any event's ring;
 * if none is clean, the spot with the least overlap. Exported for tests.
 */
export function placeCard(
  anchor: { x: number; y: number },
  f: Pick<GlobeEventFrame, "cx" | "cy" | "R" | "areaW" | "h">,
  cardH: number,
  taken: readonly Rect[],
  anchors: readonly { x: number; y: number }[] = [],
  /** Direction (0–7 steps of 45° from outward) used last frame: kept unless another is clearly better. */
  prefer: number | null = null,
  /** The globe's own panels (search, legend, layers…): never cover them. */
  avoid: readonly Rect[] = [],
): Rect & { k: number } {
  const maxX = Math.max(8, f.areaW - CARD_W - 8), maxY = Math.max(TOP, f.h - cardH - 8);
  const out = Math.atan2(anchor.y - f.cy, anchor.x - f.cx);
  const base = Number.isFinite(out) && Math.hypot(anchor.x - f.cx, anchor.y - f.cy) > 1 ? out : -Math.PI / 4;
  const reach = 46;
  let best: { rect: Rect; cost: number; k: number } | null = null;
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
    const a = base + (k * Math.PI) / 4;
    const ux = Math.cos(a), uy = Math.sin(a);
    // The card's near edge sits `reach` from the event, along this direction.
    const px = anchor.x + ux * reach, py = anchor.y + uy * reach;
    const x = Math.abs(ux) < 0.3 ? px - CARD_W / 2 : ux > 0 ? px : px - CARD_W;
    const y = Math.abs(uy) < 0.3 ? py - cardH / 2 : uy > 0 ? py : py - cardH;
    const rect: Rect = { x: clamp(x, 8, maxX), y: clamp(y, TOP, maxY), w: CARD_W, h: cardH };
    const shifted = Math.hypot(rect.x - x, rect.y - y);
    const hitsCard = taken.reduce((n, t) => n + (overlaps(rect, t) ? 1 : 0), 0)
      + avoid.reduce((n, t) => n + (overlaps(rect, t) ? 1 : 0), 0);
    const coversRing = anchors.reduce((n, p) => n + (p.x > rect.x - 14 && p.x < rect.x + rect.w + 14 && p.y > rect.y - 14 && p.y < rect.y + rect.h + 14 ? 1 : 0), 0);
    const cost = hitsCard * 1000 + coversRing * 1000 + shifted + Math.abs(k) * 12 - (k === prefer ? 40 : 0);
    if (!best || cost < best.cost) best = { rect, cost, k };
  }
  return { ...best!.rect, k: best!.k };
}

/**
 * The globe's HUD panels, relative to `host`: interactive, visible
 * descendants that aren't full-size layers (canvas, backdrops, this
 * overlay). Large wrappers are searched inside, a few levels deep.
 */
function hudRects(host: HTMLElement): Rect[] {
  const box = host.getBoundingClientRect();
  const area = box.width * box.height;
  const out: Rect[] = [];
  const visit = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement) || child.dataset.globeEvents !== undefined || child.tagName === "CANVAS") continue;
      const r = child.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(child);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      if (r.width * r.height > area * 0.4 || cs.pointerEvents === "none") { if (depth < 3) visit(child, depth + 1); continue; }
      out.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
    }
  };
  visit(host, 0);
  return out;
}

/** Point on the card's edge nearest the anchor, where the leader line meets it. */
export function attachPoint(anchor: { x: number; y: number }, r: Rect) {
  return { x: clamp(anchor.x, r.x, r.x + r.w), y: clamp(anchor.y, r.y, r.y + r.h) };
}

export default function GlobeEventCards({
  events, apiRef, onReadMore, accentLabel = "Read more",
}: {
  events: readonly GlobeEvent[];
  apiRef: MutableRefObject<GlobeEventsApi | null>;
  onReadMore: (focusId: string) => void;
  accentLabel?: string;
}) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const lineRefs = useRef(new Map<string, SVGLineElement>());
  const ringRefs = useRef(new Map<string, SVGGElement>());
  const live = events.filter((e) => !dismissed.has(e.id));
  const liveRef = useRef(live);
  liveRef.current = live;
  const lastFrame = useRef<GlobeEventFrame | null>(null);
  const lastDir = useRef(new Map<string, number>());
  const svgRef = useRef<SVGSVGElement>(null);
  const avoid = useRef<{ at: number; rects: Rect[] }>({ at: 0, rects: [] });

  const place = useCallback((f: GlobeEventFrame) => {
    lastFrame.current = f;
    const shown = liveRef.current
      .map((e) => ({ e, p: f.project(e.lon, e.lat) }))
      // The selected event already fills the sidebar: its card would only repeat it.
      .filter(({ e }) => e.focusId !== f.selected)
      .filter(({ p }) => p.z >= MIN_Z && p.x >= 0 && p.x <= f.areaW && p.y >= 0 && p.y <= f.h)
      .sort((a, b) => b.p.z - a.p.z)
      .slice(0, f.narrow ? (f.selected ? 0 : 1) : 3);
    const ids = new Set(shown.map((s) => s.e.id));
    const host = svgRef.current?.parentElement;
    const now = performance.now();
    if (host && now - avoid.current.at > 400) avoid.current = { at: now, rects: hudRects(host) };
    const taken: Rect[] = [];
    const anchors = shown.map((x) => x.p);
    for (const e of [...shown.map((x) => x.e), ...liveRef.current.filter((x) => !ids.has(x.id))]) {
      const card = cardRefs.current.get(e.id), line = lineRefs.current.get(e.id), ring = ringRefs.current.get(e.id);
      if (!card || !line || !ring) continue;
      const hit = shown.find((s) => s.e.id === e.id);
      if (!hit || !ids.has(e.id)) {
        card.style.opacity = "0"; card.style.pointerEvents = "none"; card.inert = true;
        line.style.opacity = "0"; ring.style.opacity = "0";
        (line.nextElementSibling as SVGElement | null)?.style.setProperty("opacity", "0");
        continue;
      }
      const fade = clamp((hit.p.z - MIN_Z) / 0.25, 0, 1);
      const rect = placeCard(hit.p, f, card.offsetHeight || 120, taken, anchors, lastDir.current.get(e.id) ?? null, avoid.current.rects);
      lastDir.current.set(e.id, rect.k);
      taken.push(rect);
      const a = attachPoint(hit.p, rect);
      card.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
      card.style.opacity = String(fade);
      card.style.pointerEvents = fade > 0.5 ? "auto" : "none";
      card.inert = fade <= 0.5;
      line.setAttribute("x1", hit.p.x.toFixed(1)); line.setAttribute("y1", hit.p.y.toFixed(1));
      line.setAttribute("x2", a.x.toFixed(1)); line.setAttribute("y2", a.y.toFixed(1));
      line.style.opacity = String(fade);
      const end = line.nextElementSibling as SVGCircleElement | null;
      if (end) { end.setAttribute("cx", a.x.toFixed(1)); end.setAttribute("cy", a.y.toFixed(1)); end.style.opacity = String(fade); }
      ring.setAttribute("transform", `translate(${hit.p.x.toFixed(1)},${hit.p.y.toFixed(1)})`);
      ring.style.opacity = String(fade);
    }
  }, []);

  useEffect(() => {
    apiRef.current = { place };
    return () => { apiRef.current = null; };
  }, [apiRef, place]);
  // Re-place after a dismiss or new events, without waiting for the globe's next frame.
  useEffect(() => { if (lastFrame.current) place(lastFrame.current); }, [dismissed, events, place]);

  if (!live.length) return null;
  return <>
    <svg ref={svgRef} data-globe-events="" className="pointer-events-none absolute inset-0 z-[15] h-full w-full" aria-hidden>
      {live.map((e) => <g key={e.id}>
        <line ref={(el) => { if (el) lineRefs.current.set(e.id, el); else lineRefs.current.delete(e.id); }}
          stroke={RED(0.85)} strokeWidth={1.2} style={{ opacity: 0 }} />
        <circle r={2.2} fill={RED(1)} style={{ opacity: 0 }} />
        <g ref={(el) => { if (el) ringRefs.current.set(e.id, el); else ringRefs.current.delete(e.id); }} style={{ opacity: 0 }}>
          <circle r={9} fill="none" stroke={RED(0.9)} strokeWidth={1.2} className="globe-event-pulse" />
          <circle r={5} fill="none" stroke={RED(1)} strokeWidth={1.4} />
          <circle r={1.8} fill={RED(1)} />
        </g>
      </g>)}
    </svg>
    {live.map((e) => (
      <div key={e.id} ref={(el) => { if (el) cardRefs.current.set(e.id, el); else cardRefs.current.delete(e.id); }}
        role="group" aria-label={`${e.kicker}: ${e.title}`} inert data-globe-events=""
        className="absolute left-0 top-0 z-[16] rounded-sm border bg-[rgba(8,9,9,0.92)] px-3 py-2.5 backdrop-blur-md transition-opacity duration-150"
        style={{ width: CARD_W, opacity: 0, pointerEvents: "none", borderColor: RED(0.45) }}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: EVENT_RED }}>● {e.kicker}</p>
          <button type="button" aria-label={`Hide ${e.title}`} onClick={() => setDismissed((d) => new Set([...d, e.id]))}
            className="-mr-1 -mt-1 px-1 font-mono text-[11px] leading-none text-[var(--ink-3)] hover:text-[var(--ink)]">×</button>
        </div>
        <p className="mt-1 text-[12px] font-medium leading-snug text-[var(--ink)]">{e.title}</p>
        <dl className="mt-2 grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(3, e.stats.length)}, minmax(0, 1fr))` }}>
          {e.stats.slice(0, 3).map((s) => <div key={s.label} className="min-w-0">
            <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{s.label}</dt>
            <dd className="mt-0.5 font-mono text-[10px] leading-tight text-[var(--ink)]">{s.value}</dd>
          </div>)}
        </dl>
        <button type="button" onClick={() => onReadMore(e.focusId)}
          className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.2em] underline-offset-2 hover:underline" style={{ color: EVENT_RED }}>
          {accentLabel} →
        </button>
      </div>
    ))}
  </>;
}
