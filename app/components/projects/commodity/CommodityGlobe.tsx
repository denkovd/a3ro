"use client";
/* ────────────────────────────────────────────────────────────────
   Commodity Watch — data-driven globe (shared section template, #55)

   Same substrate as Oil / Gold / BTC / Uranium (dots, rotator,
   camera), but every layer comes in as data, so a new commodity
   section supplies its layers and a rail and gets the rest:

     bubble  country or region sized by a value (supply or demand tone)
     pin     a place (mine, port, plant) with a small glyph
     flow    an arc from one place to another, weighted 0–1, with a
             moving tracer (static under reduced motion)

   Presets switch layers on and can move the camera. The rail is
   rendered by the section through `renderRail`.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DOT, INK, getDots, rotator, slerp, vec, type OTView, type Rot } from "../oilTrackerShared";

export type GlobeGlyph = "circle" | "square" | "triangle" | "diamond";
export type GlobeTone = "supply" | "demand";

export interface GlobeItem {
  id: string;
  lon: number;
  lat: number;
  /** Bubble size or flow weight. Bubbles scale by √(value / largest in layer); flows take 0–1. */
  value?: number;
  /** Label drawn on the globe for the largest items. */
  label?: string;
  /** Flow end point. */
  to?: [number, number];
  /** Pins: draw the label centred above the pin instead of to its right, to clear a neighbour's label. */
  labelAbove?: boolean;
}

export interface GlobeLayer {
  id: string;
  label: string;
  kind: "bubble" | "pin" | "flow";
  tone: GlobeTone;
  glyph?: GlobeGlyph;
  items: readonly GlobeItem[];
  /** How many of the largest bubbles carry a label at normal zoom (default 6). */
  labelTop?: number;
  /** Pins: zoom above which their names are drawn (default 1.6). */
  labelZoom?: number;
}

export interface GlobePreset { name: string; layers: readonly string[]; view?: Partial<OTView> }

export interface GlobePalette {
  supply: (a: number) => string;
  supplyHi: (a: number) => string;
  supplyCss: string;
  demand: (a: number) => string;
  demandCss: string;
  /** "r,g,b" of the supply colour, for the sphere tint. */
  supplyRgb: string;
}

export interface RailApi {
  narrow: boolean;
  selected: string | null;
  focus: (id: string) => void;
  close: () => void;
  activeLayers: ReadonlySet<string>;
}

type Sim = {
  lon: number; lat: number; zoom: number; vlon: number; vlat: number;
  dragging: boolean; px: number; py: number; movedPx: number; lastInteract: number;
  tween: { t0: number; dur: number; from: OTView; to: OTView } | null; hovered: string | null;
  pointers: Map<number, { x: number; y: number }>; pinchD: number; pinchZ: number;
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const sameSet = (a: ReadonlySet<string>, b: readonly string[]) => a.size === b.length && b.every((x) => a.has(x));

function glyphPath(ctx: CanvasRenderingContext2D, glyph: GlobeGlyph, x: number, y: number, r: number) {
  ctx.beginPath();
  if (glyph === "triangle") { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.95, y + r * 0.7); ctx.lineTo(x - r * 0.95, y + r * 0.7); ctx.closePath(); }
  else if (glyph === "diamond") { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
  else if (glyph === "square") ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
  else ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
}

export function GlyphIcon({ glyph, color }: { glyph: GlobeGlyph | "bubble" | "flow"; color: string }) {
  return <svg width="10" height="10" viewBox="-6 -6 12 12" aria-hidden>
    {glyph === "triangle" ? <path d="M0,-5 L4.75,3.5 L-4.75,3.5 Z" fill="none" stroke={color} />
      : glyph === "diamond" ? <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill="none" stroke={color} />
      : glyph === "square" ? <rect x="-3.75" y="-3.75" width="7.5" height="7.5" fill="none" stroke={color} />
      : glyph === "flow" ? <path d="M-5,3 Q0,-6 5,3" fill="none" stroke={color} />
      : glyph === "circle" ? <circle r="2.5" fill={color} />
      : <circle r="4" fill="none" stroke={color} />}
  </svg>;
}

const FLOW_SEG = 48;

export default function CommodityGlobe({
  layers,
  presets,
  palette,
  home,
  ariaLabel,
  hint,
  hover,
  renderRail,
  onExit,
  onReady,
  maxZoom = 2.6,
  pinZoom = 2.2,
  className = "",
}: {
  layers: readonly GlobeLayer[];
  presets: readonly GlobePreset[];
  palette: GlobePalette;
  home: { lon: number; lat: number; zoom?: number };
  ariaLabel: string;
  hint: string;
  /** Hover card text for an item id, or null for none. */
  hover: (id: string) => { title: string; lines: string[]; tone: GlobeTone } | null;
  renderRail: (api: RailApi) => ReactNode;
  onExit?: () => void;
  onReady?: () => void;
  maxZoom?: number;
  /** Zoom to use when a pin is selected (clustered pins need more). */
  pinZoom?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverPosRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const redrawRef = useRef<() => void>(() => {});
  const [selected, setSelected] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [active, setActive] = useState<ReadonlySet<string>>(() => new Set(presets[0]?.layers ?? layers.map((l) => l.id)));
  const [layersExpanded, setLayersExpanded] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const sim = useRef<Sim>({
    lon: home.lon, lat: home.lat, zoom: home.zoom ?? 0.95,
    vlon: 0, vlat: 0, dragging: false, px: 0, py: 0, movedPx: 0, lastInteract: 0, tween: null, hovered: null,
    pointers: new Map(), pinchD: 0, pinchZ: 1,
  });
  const size = useRef({ w: 0, h: 0 });
  const introT0 = useRef<number | null>(null);
  const hasMoved = useRef(false);
  const narrowRef = useRef(false);
  const activeRef = useRef(active);
  const layersRef = useRef(layers);
  const selectedRef = useRef<string | null>(null);
  const reducedRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const readyFired = useRef(false);
  narrowRef.current = narrow;
  activeRef.current = active;
  layersRef.current = layers;
  selectedRef.current = selected;
  reducedRef.current = !!reduced;

  useEffect(() => { redrawRef.current(); }, [active, selected, narrow, hoverId, reduced, layers]);

  const findItem = useCallback((id: string) => {
    for (const layer of layersRef.current) { const it = layer.items.find((x) => x.id === id); if (it) return { layer, it }; }
    return null;
  }, []);

  const tweenTo = useCallback((to: Partial<OTView>, dur = 1100) => {
    const s = sim.current;
    s.vlon = 0; s.vlat = 0;
    s.tween = { t0: performance.now(), dur: reducedRef.current ? 1 : dur, from: { lon: s.lon, lat: s.lat, zoom: s.zoom }, to: { lon: to.lon ?? s.lon, lat: to.lat ?? s.lat, zoom: to.zoom ?? s.zoom } };
    redrawRef.current();
  }, []);

  const focus = useCallback((id: string) => {
    const found = findItem(id);
    if (!found) return;
    const { layer, it } = found;
    setActive((A) => (A.has(layer.id) ? A : new Set([...A, layer.id])));
    setSelected(id);
    setTouched(true);
    hasMoved.current = true;
    sim.current.lastInteract = performance.now();
    const [lon, lat] = layer.kind === "flow" && it.to ? it.to : [it.lon, it.lat];
    tweenTo({ lon, lat: clamp(lat, -48, 52), zoom: Math.max(sim.current.zoom, layer.kind === "pin" ? Math.min(maxZoom, pinZoom) : 1.2) });
  }, [findItem, tweenTo, maxZoom, pinZoom]);

  const close = useCallback(() => {
    setSelected(null);
    sim.current.lastInteract = performance.now();
    tweenTo({ zoom: Math.min(sim.current.zoom, 1.2), lat: clamp(sim.current.lat, -34, 40) }, 900);
  }, [tweenTo]);

  const applyPreset = useCallback((p: GlobePreset) => {
    setActive(new Set(p.layers));
    setTouched(true);
    if (p.view) { hasMoved.current = true; tweenTo(p.view, 1200); }
  }, [tweenTo]);

  /* ── engine ── */
  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current, wrap = wrapRef.current;
    if (!canvas || !stage || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dots = getDots(19000);
    const o = [0, 0, 0];
    const tmp = [0, 0, 0];
    let raf = 0;
    let visible = true;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      setNarrow(wrap.getBoundingClientRect().width < 768);
      redrawRef.current();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage); ro.observe(wrap);

    const frame = () => {
      const s = sim.current;
      const { w, h } = size.current;
      const availableW = narrowRef.current ? w : Math.max(240, w - 388);
      const availableH = narrowRef.current ? h * 0.5 : h;
      const cx = availableW * 0.5;
      const cy = availableH * 0.53 + (narrowRef.current ? 26 : 0);
      const R = Math.min(availableW * 0.42, availableH * 0.4) * s.zoom;
      return { s, w, h, cx, cy, R };
    };
    const project = (rot: Rot, lon: number, lat: number, cx: number, cy: number, R: number, lift = 1) => {
      const v = vec(lon, lat);
      rot(v[0], v[1], v[2], o);
      return { x: cx + o[0] * R * lift, y: cy - o[1] * R * lift, z: o[2] };
    };
    const maxOf = (layer: GlobeLayer) => Math.max(1e-9, ...layer.items.map((i) => i.value ?? 0));
    const bubbleR = (layer: GlobeLayer, it: GlobeItem, mx: number) => (it.value && it.value > 0 ? 3 + 15 * Math.sqrt(it.value / mx) : 0);
    const visibleLayers = () => layersRef.current.filter((l) => activeRef.current.has(l.id));

    /** Arc points for a flow, lifted off the surface in the middle. */
    const arcPoints = (rot: Rot, it: GlobeItem, cx: number, cy: number, R: number) => {
      const a = vec(it.lon, it.lat), b = vec(it.to![0], it.to![1]);
      const pts: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i <= FLOW_SEG; i++) {
        const t = i / FLOW_SEG;
        slerp(a, b, t, tmp);
        rot(tmp[0], tmp[1], tmp[2], o);
        const lift = 1 + 0.07 * Math.sin(Math.PI * t);
        pts.push({ x: cx + o[0] * R * lift, y: cy - o[1] * R * lift, z: o[2] });
      }
      return pts;
    };

    const hitTest = (mx: number, my: number): string | null => {
      const { s, cx, cy, R } = frame();
      const rot = rotator(s.lon, s.lat);
      const vis = visibleLayers();
      let best: string | null = null;
      let bestD = 16;
      const consider = (id: string, lon: number, lat: number, reach: number) => {
        const p = project(rot, lon, lat, cx, cy, R);
        if (p.z < 0.12) return;
        const d = Math.hypot(p.x - mx, p.y - my) - reach;
        if (d < bestD) { bestD = d; best = id; }
      };
      // Small, precise pins first, so they win over the bubbles they sit inside.
      for (const l of vis) if (l.kind === "pin") for (const it of l.items) consider(it.id, it.lon, it.lat, 2);
      if (best) return best;
      for (const l of vis) if (l.kind === "bubble") { const mxv = maxOf(l); for (const it of l.items) { const r = bubbleR(l, it, mxv); if (r > 0) consider(it.id, it.lon, it.lat, Math.min(r, 10)); } }
      if (best) return best;
      // Flows: nearest arc point.
      for (const l of vis) if (l.kind === "flow") for (const it of l.items) {
        if (!it.to) continue;
        for (const p of arcPoints(rot, it, cx, cy, R)) {
          if (p.z < 0.12) continue;
          const d = Math.hypot(p.x - mx, p.y - my) - 3;
          if (d < bestD) { bestD = d; best = it.id; }
        }
      }
      return best;
    };
    (canvas as unknown as { __hit?: typeof hitTest }).__hit = hitTest;

    const draw = (now: number) => {
      const { s, w, h, cx, cy, R } = frame();
      let animating = false;
      if (s.tween) {
        animating = true;
        const u = clamp((now - s.tween.t0) / s.tween.dur, 0, 1);
        const e = easeInOut(u);
        const f = s.tween.from, to = s.tween.to;
        const dlon = (((to.lon - f.lon) + 540) % 360) - 180;
        s.lon = f.lon + dlon * e;
        s.lat = f.lat + (to.lat - f.lat) * e;
        s.zoom = f.zoom + (to.zoom - f.zoom) * e;
        if (u >= 1) s.tween = null;
      } else if (!s.dragging && !reducedRef.current) {
        s.lon += s.vlon * 16.7;
        s.lat = clamp(s.lat + s.vlat * 16.7, -72, 72);
        s.vlon *= 0.92; s.vlat *= 0.92;
        if (Math.abs(s.vlon) < 1e-5) s.vlon = 0;
        if (Math.abs(s.vlat) < 1e-5) s.vlat = 0;
        if (!hasMoved.current && now - s.lastInteract > 4000) s.lon += 0.012;
      }
      const ramp = (start: number, dur: number) =>
        reducedRef.current ? 1 : introT0.current === null ? 0 : clamp((now - introT0.current - start) / dur, 0, 1);
      const labA = ramp(1400, 700);
      const haloText = (txt: string, x: number, y: number) => {
        ctx.strokeStyle = "rgba(7,8,8,0.85)"; ctx.lineWidth = 3; ctx.lineJoin = "round";
        ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
      };
      const P = palette;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = ramp(0, 650);

      const sph = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.02);
      sph.addColorStop(0, `rgba(${P.supplyRgb},0.04)`);
      sph.addColorStop(0.6, "rgba(232,235,232,0.012)");
      sph.addColorStop(1, "rgba(232,235,232,0)");
      ctx.fillStyle = sph;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) { ctx.strokeStyle = INK(0.026); ctx.beginPath(); ctx.arc(cx, cy, R * (1 + i * 0.22), 0, Math.PI * 2); ctx.stroke(); }

      const rot = rotator(s.lon, s.lat);
      const SEG = 128;
      const circle = (pointAt: (i: number) => [number, number, number]) => {
        for (const pass of [0, 1]) {
          ctx.beginPath();
          let pen = false;
          for (let i = 0; i <= SEG; i++) {
            const v = pointAt(i);
            rot(v[0], v[1], v[2], o);
            if ((pass === 1) !== o[2] > 0) { pen = false; continue; }
            const sx = cx + o[0] * R, sy = cy - o[1] * R;
            if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = INK(pass ? 0.05 : 0.016);
          ctx.stroke();
        }
      };
      for (let m = -180; m < 180; m += 30) circle((i) => vec(m, -90 + (i / SEG) * 180));
      for (let p = -60; p <= 60; p += 30) circle((i) => vec(-180 + (i / SEG) * 360, p));
      for (let i = 0; i < dots.length; i += 3) {
        rot(dots[i], dots[i + 1], dots[i + 2], o);
        if (o[2] <= 0.02) continue;
        const sx = cx + o[0] * R, sy = cy - o[1] * R;
        const ds = (1 + 1.1 * o[2]) * Math.min(1.25, Math.max(0.8, R / 260));
        ctx.fillStyle = DOT(0.18 + 0.6 * Math.pow(o[2], 1.6));
        ctx.fillRect(sx - ds / 2, sy - ds / 2, ds, ds);
      }
      ctx.strokeStyle = INK(0.1);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      const sel = selectedRef.current;
      const hov = s.hovered;
      const fontPx = Math.max(9, Math.min(12, R / 55)).toFixed(0);
      ctx.font = `500 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`;
      const zoomScale = Math.min(1.35, Math.max(0.8, R / 300));
      const brackets = (x: number, y: number, b: number, strong: boolean, col: (a: number) => string) => {
        ctx.strokeStyle = col(strong ? 0.9 : 0.5); ctx.lineWidth = 1;
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          ctx.beginPath();
          ctx.moveTo(x + dx * b, y + dy * b - dy * 5); ctx.lineTo(x + dx * b, y + dy * b); ctx.lineTo(x + dx * b - dx * 5, y + dy * b);
          ctx.stroke();
        }
      };
      const vis = visibleLayers();
      const order = { bubble: 0, flow: 1, pin: 2 } as const;
      const sorted = [...vis].sort((a, b) => order[a.kind] - order[b.kind] || (a.tone === "demand" ? -1 : 1));

      for (const layer of sorted) {
        const col = layer.tone === "demand" ? P.demand : P.supply;
        if (layer.kind === "bubble") {
          const mxv = maxOf(layer);
          const ranked = [...layer.items].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
          ranked.forEach((it, rank) => {
            const rr = bubbleR(layer, it, mxv) * zoomScale;
            if (rr <= 0) return;
            const p = project(rot, it.lon, it.lat, cx, cy, R);
            if (p.z < 0.1) return;
            const fade = Math.min(1, (p.z - 0.1) / 0.3) * ramp(layer.tone === "demand" ? 700 : 400, 900);
            const on = it.id === sel || it.id === hov;
            ctx.fillStyle = col((layer.tone === "demand" ? 0.1 : 0.16) * fade);
            ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = col((on ? 0.95 : 0.55) * fade);
            ctx.lineWidth = it.id === sel ? 1.6 : 1;
            ctx.stroke();
            if (on) brackets(p.x, p.y, rr + 5, it.id === sel, col);
            if (it.label && (rank < (layer.labelTop ?? 6) || s.zoom > 1.3) && it.id !== hov) {
              ctx.fillStyle = layer.tone === "demand" ? col(0.8 * fade * labA) : INK(0.8 * fade * labA);
              haloText(it.label, p.x + rr + 5, p.y + (layer.tone === "demand" ? 3 : -4));
            }
          });
        } else if (layer.kind === "flow") {
          const fade0 = ramp(1000, 900);
          for (const it of layer.items) {
            if (!it.to) continue;
            const pts = arcPoints(rot, it, cx, cy, R);
            const wgt = clamp(it.value ?? 0.3, 0.02, 1);
            const on = it.id === sel || it.id === hov;
            ctx.lineWidth = (0.6 + 2.6 * Math.sqrt(wgt)) * Math.min(1.2, zoomScale);
            ctx.strokeStyle = col((on ? 0.85 : 0.22 + 0.35 * wgt) * fade0);
            ctx.beginPath();
            let pen = false;
            for (const p of pts) {
              if (p.z < 0.02) { pen = false; continue; }
              if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            // Tracer: a bright head moving from source to destination, speed by weight.
            if (!reducedRef.current) {
              animating = true;
              const period = 5200 - 2400 * wgt;
              const head = ((now % period) / period) * FLOW_SEG;
              const hi = Math.floor(head);
              const p = pts[Math.min(FLOW_SEG, hi)];
              if (p && p.z > 0.02) {
                ctx.fillStyle = P.supplyHi(0.9 * fade0);
                ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 + 1.4 * wgt, 0, Math.PI * 2); ctx.fill();
              }
            }
            const end = pts[FLOW_SEG];
            if (on && end.z > 0.05) brackets(end.x, end.y, 8, it.id === sel, col);
          }
        } else {
          const glyph = layer.glyph ?? "circle";
          for (const it of layer.items) {
            const p = project(rot, it.lon, it.lat, cx, cy, R);
            if (p.z < 0.15) continue;
            const fade = Math.min(1, (p.z - 0.15) / 0.3) * ramp(1100, 800);
            const on = it.id === sel || it.id === hov;
            const big = (it.value ?? 0) > 0;
            glyphPath(ctx, glyph, p.x, p.y, (big ? 5 : 4) * Math.min(1.2, zoomScale));
            if (glyph === "circle") { ctx.fillStyle = P.supplyHi(0.95 * fade); ctx.fill(); }
            else {
              ctx.fillStyle = col((on ? 0.5 : 0.18) * fade); ctx.fill();
              ctx.strokeStyle = layer.tone === "demand" ? col((on ? 1 : 0.75) * fade) : P.supplyHi((on ? 1 : 0.75) * fade);
              ctx.lineWidth = 1; ctx.stroke();
            }
            if (on) brackets(p.x, p.y, 10, it.id === sel, col);
            if (it.label && (s.zoom > (layer.labelZoom ?? 1.6) || it.id === sel) && it.id !== hov) {
              ctx.fillStyle = layer.tone === "demand" ? col(0.9 * fade * labA) : INK(0.7 * fade * labA);
              if (it.labelAbove) haloText(it.label, p.x - ctx.measureText(it.label).width / 2, p.y - 12);
              else haloText(it.label, p.x + 8, p.y + 3);
            }
          }
        }
      }

      if (!readyFired.current && ramp(0, 650) > 0.5) { readyFired.current = true; onReady?.(); }
      return animating;
    };
    if (introT0.current === null) introT0.current = performance.now();
    const loop = (now: number) => {
      raf = 0;
      if (visible) draw(now);
      if (!reducedRef.current || sim.current.tween) raf = requestAnimationFrame(loop);
    };
    redrawRef.current = () => { if (!raf) raf = requestAnimationFrame(loop); };
    redrawRef.current();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; redrawRef.current(); }, { threshold: 0.02 });
    io.observe(wrap);
    const onVis = () => { visible = document.visibilityState === "visible"; redrawRef.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      redrawRef.current = () => {};
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      delete (canvas as unknown as { __hit?: unknown }).__hit;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── input ── */
  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitAt = (x: number, y: number) =>
    (canvasRef.current as unknown as { __hit?: (x: number, y: number) => string | null } | null)?.__hit?.(x, y) ?? null;
  const positionHoverCard = (x: number, y: number) => {
    const el = hoverPosRef.current;
    if (!el) return;
    const { w, h } = size.current;
    const px = x > w - 260 ? x - 14 - 240 : x + 14;
    const py = y > h - 180 ? y - 10 - 160 : y + 10;
    el.style.transform = `translate(${px}px, ${py}px)`;
  };
  useEffect(() => { if (hoverId) positionHoverCard(lastPointerRef.current.x, lastPointerRef.current.y); }, [hoverId]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const p = local(e);
    s.pointers.set(e.pointerId, p);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (s.pointers.size === 2) {
      const [a, b] = Array.from(s.pointers.values());
      s.pinchD = Math.hypot(a.x - b.x, a.y - b.y); s.pinchZ = s.zoom; s.dragging = false;
      return;
    }
    Object.assign(s, { dragging: true, movedPx: 0, px: p.x, py: p.y, vlon: 0, vlat: 0, tween: null, lastInteract: performance.now() });
    hasMoved.current = true;
    setTouched(true);
    e.currentTarget.style.cursor = "grabbing";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    redrawRef.current();
    const s = sim.current;
    const p = local(e);
    lastPointerRef.current = p;
    if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, p);
    if (s.pointers.size === 2) {
      const [a, b] = Array.from(s.pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (s.pinchD > 0) s.zoom = clamp((s.pinchZ * d) / s.pinchD, 0.85, maxZoom);
      s.lastInteract = performance.now();
      return;
    }
    if (s.dragging) {
      const dx = p.x - s.px, dy = p.y - s.py;
      s.movedPx += Math.abs(dx) + Math.abs(dy);
      const k = 0.22 / s.zoom;
      s.lon -= dx * k;
      s.lat = clamp(s.lat + dy * k, -72, 72);
      s.vlon = 0.75 * s.vlon + 0.25 * ((-dx * k) / 16.7);
      s.vlat = 0.75 * s.vlat + 0.25 * ((dy * k) / 16.7);
      s.px = p.x; s.py = p.y;
      s.lastInteract = performance.now();
    } else {
      const hit = hitAt(p.x, p.y);
      if (s.hovered !== hit) { s.hovered = hit; setHoverId(hit); }
      if (hit) positionHoverCard(p.x, p.y);
      e.currentTarget.style.cursor = hit ? "pointer" : "grab";
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    s.pointers.delete(e.pointerId);
    if (s.pointers.size < 2) s.pinchD = 0;
    if (!s.dragging) return;
    s.dragging = false;
    e.currentTarget.style.cursor = "grab";
    s.lastInteract = performance.now();
    if (s.movedPx < 6) {
      const p = local(e);
      const hit = hitAt(p.x, p.y);
      if (hit) focus(hit);
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const s = sim.current;
    s.zoom = clamp(s.zoom * (e.deltaY > 0 ? 0.94 : 1.06), 0.85, maxZoom);
    s.lastInteract = performance.now();
    hasMoved.current = true;
    setTouched(true);
    redrawRef.current();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedRef.current) close(); else onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, onExit]);

  const card = hoverId ? hover(hoverId) : null;

  return (
    <div ref={wrapRef} className={`relative h-full w-full ${className}`}>
      <div ref={stageRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => { const s = sim.current; s.pointers.delete(e.pointerId); s.dragging = false; s.pinchD = 0; e.currentTarget.style.cursor = "grab"; }}
          onPointerLeave={() => { if (sim.current.hovered) { sim.current.hovered = null; setHoverId(null); } }}
          onWheel={onWheel}
          aria-label={ariaLabel}
        />
      </div>

      <AnimatePresence>
        {card && (
          <motion.div
            ref={hoverPosRef}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            className="pointer-events-none absolute left-0 top-0 z-20 w-[240px] rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.92)] px-3 py-2.5 backdrop-blur-md"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink)]">{card.title}</p>
            {card.lines.filter(Boolean).map((line) => (
              <p key={line} className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{line}</p>
            ))}
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.2em]" style={{ color: card.tone === "demand" ? palette.demandCss : palette.supplyCss }}>Click for panel</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div role="group" aria-label="Globe view" className="absolute left-3 top-4 z-20 flex flex-wrap gap-1 rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.9)] p-1 backdrop-blur-md md:left-6">
        {presets.map((preset) => {
          const on = sameSet(active, preset.layers);
          return (
            <button key={preset.name} type="button" aria-pressed={on} onClick={() => applyPreset(preset)}
              className="rounded-sm px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors"
              style={{ color: on ? "var(--depth-0)" : "var(--ink-2)", background: on ? palette.supplyCss : "transparent" }}>
              {preset.name}
            </button>
          );
        })}
      </div>

      <div className="absolute bottom-4 left-4 z-20 md:bottom-6 md:left-6">
        <button type="button" onClick={() => setLayersExpanded((v) => !v)} aria-expanded={layersExpanded} aria-controls="commodity-layer-controls"
          className="rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.85)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-2)] backdrop-blur-md">
          Layers {layersExpanded ? "▾" : "▸"}
        </button>
        <AnimatePresence>
          {layersExpanded && (
            <motion.div id="commodity-layer-controls" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="mt-2 flex w-[220px] flex-col gap-1.5 rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.92)] p-3 backdrop-blur-md">
              {layers.map((layer) => {
                const on = active.has(layer.id);
                const color = layer.tone === "demand" ? palette.demandCss : palette.supplyCss;
                return (
                  <button key={layer.id} type="button" aria-pressed={on}
                    onClick={() => setActive((A) => { const next = new Set(A); if (next.has(layer.id)) next.delete(layer.id); else next.add(layer.id); return next; })}
                    className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-2)]">
                    <span className="flex items-center gap-2"><GlyphIcon glyph={layer.kind === "pin" ? layer.glyph ?? "circle" : layer.kind} color={color} />{layer.label}</span>
                    <span style={{ color: on ? color : "var(--ink-3)" }}>{on ? "ON" : "OFF"}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!touched && (
        <p className="pointer-events-none absolute bottom-6 left-32 z-10 hidden font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)] lg:block">{hint}</p>
      )}

      {renderRail({ narrow, selected, focus, close, activeLayers: active })}
    </div>
  );
}
