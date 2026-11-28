"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Uranium Tracker · globe (roadmap #54)
   Route-only: /Projects/Uranium-Tracker. Same globe substrate as
   Oil / Gold / BTC (dots, rotator, camera). Layers follow the civilian
   fuel chain: mining → conversion → enrichment → fuel fabrication →
   reactors. Reference data from lib/uranium/fuelChain.ts, not live.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  DEMAND,
  DEMAND_CSS,
  DOT,
  HOME,
  INK,
  URANIUM_CSS,
  URN,
  URN_HI,
  getDots,
  rotator,
  vec,
  type Rot,
  type UTView,
} from "./uraniumTrackerShared";
import { drawBorders } from "./globeBorders";
import {
  MINES,
  MINING_COUNTRIES,
  REACTOR_COUNTRIES,
  SITES,
  STAGE_LABEL,
  STAGE_UNIT,
  type Mine,
  type MiningCountry,
  type ReactorCountry,
  type Site,
  type Stage,
} from "../../../lib/uranium/fuelChain";
import UraniumIntelPanel from "./uranium/UraniumIntelPanel";

export type ReactorMode = "off" | "operable" | "pipeline";
export interface UraniumLayers { mines: boolean; conversion: boolean; enrichment: boolean; fabrication: boolean; reactors: ReactorMode }
export type Selection =
  | { type: "country"; c: MiningCountry }
  | { type: "mine"; m: Mine }
  | { type: "site"; s: Site }
  | { type: "reactor"; r: ReactorCountry };

const selId = (s: Selection) =>
  s.type === "country" ? "mc:" + s.c.id : s.type === "mine" ? "mine:" + s.m.id : s.type === "site" ? "site:" + s.s.id : "rx:" + s.r.id;
const selLonLat = (s: Selection): [number, number] =>
  s.type === "country" ? [s.c.lon, s.c.lat] : s.type === "mine" ? [s.m.lon ?? 0, s.m.lat ?? 0] : s.type === "site" ? [s.s.lon, s.s.lat] : [s.r.lon, s.r.lat];

const MAX_MINING = Math.max(...MINING_COUNTRIES.map((c) => c.t2024));
const MAX_OPERABLE = Math.max(...REACTOR_COUNTRIES.map((r) => r.operable));
const pipelineOf = (r: ReactorCountry) => r.construction + r.planned;
const MAX_PIPELINE = Math.max(...REACTOR_COUNTRIES.map(pipelineOf));
const mineR = (c: MiningCountry) => 3 + 15 * Math.sqrt(c.t2024 / MAX_MINING);
const reactorValue = (r: ReactorCountry, mode: ReactorMode) => (mode === "pipeline" ? pipelineOf(r) : r.operable);
const reactorR = (r: ReactorCountry, mode: ReactorMode) => {
  const v = reactorValue(r, mode);
  return v <= 0 ? 0 : 3 + 13 * Math.sqrt(v / (mode === "pipeline" ? MAX_PIPELINE : MAX_OPERABLE));
};
const MINE_PINS = MINES.filter((m) => m.lon !== undefined && m.lat !== undefined);
const fmtK = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}K` : String(t));

type Tween = { t0: number; dur: number; from: UTView & { }; to: UTView };
type Sim = {
  lon: number; lat: number; zoom: number; vlon: number; vlat: number;
  dragging: boolean; px: number; py: number; movedPx: number; lastInteract: number;
  tween: Tween | null; hovered: string | null;
  pointers: Map<number, { x: number; y: number }>; pinchD: number; pinchZ: number;
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const PRESETS: { name: string; layers: UraniumLayers }[] = [
  { name: "Overview", layers: { mines: true, conversion: true, enrichment: true, fabrication: true, reactors: "operable" } },
  { name: "Mining", layers: { mines: true, conversion: false, enrichment: false, fabrication: false, reactors: "off" } },
  { name: "Processing", layers: { mines: false, conversion: true, enrichment: true, fabrication: true, reactors: "off" } },
  { name: "Reactors", layers: { mines: false, conversion: false, enrichment: false, fabrication: false, reactors: "operable" } },
  { name: "Pipeline", layers: { mines: false, conversion: false, enrichment: false, fabrication: false, reactors: "pipeline" } },
];
const sameLayers = (a: UraniumLayers, b: UraniumLayers) =>
  a.mines === b.mines && a.conversion === b.conversion && a.enrichment === b.enrichment && a.fabrication === b.fabrication && a.reactors === b.reactors;

/** Small glyph per processing stage, so stages read apart without extra colours. */
function drawGlyph(ctx: CanvasRenderingContext2D, stage: Stage, x: number, y: number, r: number) {
  ctx.beginPath();
  if (stage === "conversion") {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.95, y + r * 0.7); ctx.lineTo(x - r * 0.95, y + r * 0.7); ctx.closePath();
  } else if (stage === "enrichment") {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  } else {
    ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
  }
}

export default function UraniumTrackerCore({
  initialView,
  onExit,
  onReady,
  className = "",
}: {
  initialView?: UTView | null;
  onExit?: () => void;
  onReady?: () => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverPosRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const redrawRef = useRef<() => void>(() => {});
  const [selected, setSelected] = useState<Selection | null>(null);
  const [touched, setTouched] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [layers, setLayers] = useState<UraniumLayers>(PRESETS[0].layers);
  const [layersExpanded, setLayersExpanded] = useState(false);
  const [hover, setHover] = useState<Selection | null>(null);

  const sim = useRef<Sim>({
    lon: initialView?.lon ?? HOME.lon, lat: initialView?.lat ?? HOME.lat, zoom: initialView?.zoom ?? 0.95,
    vlon: 0, vlat: 0, dragging: false, px: 0, py: 0, movedPx: 0, lastInteract: 0, tween: null, hovered: null,
    pointers: new Map(), pinchD: 0, pinchZ: 1,
  });
  const size = useRef({ w: 0, h: 0 });
  const introT0 = useRef<number | null>(null);
  const hasMoved = useRef(false);
  const narrowRef = useRef(false);
  const layersRef = useRef(layers);
  const selectedRef = useRef<string | null>(null);
  const reducedRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const readyFired = useRef(false);
  narrowRef.current = narrow;
  layersRef.current = layers;
  selectedRef.current = selected ? selId(selected) : null;
  reducedRef.current = !!reduced;

  useEffect(() => { redrawRef.current(); }, [layers, selected, narrow, hover, reduced]);

  const tweenTo = useCallback((to: Partial<UTView>, dur = 1100) => {
    const s = sim.current;
    s.vlon = 0; s.vlat = 0;
    s.tween = { t0: performance.now(), dur: reducedRef.current ? 1 : dur, from: { lon: s.lon, lat: s.lat, zoom: s.zoom }, to: { lon: to.lon ?? s.lon, lat: to.lat ?? s.lat, zoom: to.zoom ?? s.zoom } };
  }, []);

  const focus = useCallback((sel: Selection) => {
    setLayers((L) => {
      if (sel.type === "country" || sel.type === "mine") return { ...L, mines: true };
      if (sel.type === "site") return { ...L, [sel.s.stage]: true };
      return { ...L, reactors: L.reactors === "off" ? "operable" : L.reactors };
    });
    setSelected(sel);
    setTouched(true);
    hasMoved.current = true;
    sim.current.lastInteract = performance.now();
    const [lon, lat] = selLonLat(sel);
    tweenTo({ lon, lat: clamp(lat, -48, 52), zoom: Math.max(sim.current.zoom, sel.type === "site" || sel.type === "mine" ? 1.45 : 1.2) });
  }, [tweenTo]);

  const closePanel = useCallback(() => {
    setSelected(null);
    sim.current.lastInteract = performance.now();
    tweenTo({ zoom: 1, lat: clamp(sim.current.lat, -34, 40) }, 900);
  }, [tweenTo]);

  /* ── engine ── */
  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current, wrap = wrapRef.current;
    if (!canvas || !stage || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dots = getDots(19000);
    const o = [0, 0, 0];
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
    const project = (rot: Rot, lon: number, lat: number, cx: number, cy: number, R: number) => {
      const v = vec(lon, lat);
      rot(v[0], v[1], v[2], o);
      return { x: cx + o[0] * R, y: cy - o[1] * R, z: o[2] };
    };

    const hitTest = (mx: number, my: number): Selection | null => {
      const { s, cx, cy, R } = frame();
      const rot = rotator(s.lon, s.lat);
      const L = layersRef.current;
      let best: Selection | null = null;
      let bestD = 16;
      const consider = (sel: Selection, lon: number, lat: number, reach: number) => {
        const p = project(rot, lon, lat, cx, cy, R);
        if (p.z < 0.12) return;
        const d = Math.hypot(p.x - mx, p.y - my) - reach;
        if (d < bestD) { bestD = d; best = sel; }
      };
      // Small, precise pins first, so they win over the bubbles they sit inside.
      for (const site of SITES) if (L[site.stage]) consider({ type: "site", s: site }, site.lon, site.lat, 2);
      if (L.mines) for (const m of MINE_PINS) consider({ type: "mine", m }, m.lon!, m.lat!, 2);
      if (best) return best;
      if (L.mines) for (const c of MINING_COUNTRIES) consider({ type: "country", c }, c.lon, c.lat, Math.min(mineR(c), 10));
      if (L.reactors !== "off") for (const r of REACTOR_COUNTRIES) { const rr = reactorR(r, L.reactors); if (rr > 0) consider({ type: "reactor", r }, r.lon, r.lat, Math.min(rr, 10)); }
      return best;
    };
    (canvas as unknown as { __hit?: typeof hitTest }).__hit = hitTest;

    const draw = (now: number) => {
      const { s, w, h, cx, cy, R } = frame();
      if (s.tween) {
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

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = ramp(0, 650);

      const sph = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.02);
      sph.addColorStop(0, "rgba(184,226,120,0.04)");
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
      // Globe 2.0 (#101): country borders and coastlines over the land dots.
      drawBorders(ctx, rot, cx, cy, R, s.zoom, { coast: INK(0.2), border: INK(0.14) }, () => redrawRef.current());
      ctx.strokeStyle = INK(0.1);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      const L = layersRef.current;
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

      /* reactors (demand) — drawn first, underneath supply */
      if (L.reactors !== "off") {
        const ranked = [...REACTOR_COUNTRIES].sort((a, b) => reactorValue(b, L.reactors) - reactorValue(a, L.reactors));
        ranked.forEach((r, rank) => {
          const rr = reactorR(r, L.reactors) * zoomScale;
          if (rr <= 0) return;
          const p = project(rot, r.lon, r.lat, cx, cy, R);
          if (p.z < 0.1) return;
          const fade = Math.min(1, (p.z - 0.1) / 0.3) * ramp(700, 900);
          const id = "rx:" + r.id;
          ctx.fillStyle = DEMAND(0.1 * fade);
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = DEMAND((id === sel || id === hov ? 0.9 : 0.5) * fade);
          ctx.lineWidth = id === sel ? 1.6 : 1;
          ctx.stroke();
          if (id === sel || id === hov) brackets(p.x, p.y, rr + 5, id === sel, DEMAND);
          if (rank < 7 && id !== hov) {
            ctx.fillStyle = DEMAND(0.8 * fade * labA);
            haloText(`${r.name.toUpperCase()} · ${reactorValue(r, L.reactors)}`, p.x + rr + 5, p.y + 3);
          }
        });
      }

      /* mining countries + named mines */
      if (L.mines) {
        const ranked = [...MINING_COUNTRIES].sort((a, b) => b.t2024 - a.t2024);
        ranked.forEach((c, rank) => {
          const p = project(rot, c.lon, c.lat, cx, cy, R);
          if (p.z < 0.1) return;
          const fade = Math.min(1, (p.z - 0.1) / 0.3) * ramp(400, 900);
          const rr = mineR(c) * zoomScale;
          const id = "mc:" + c.id;
          ctx.fillStyle = URN(0.16 * fade);
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = URN((id === sel || id === hov ? 0.95 : 0.55) * fade);
          ctx.lineWidth = id === sel ? 1.6 : 1;
          ctx.stroke();
          if (id === sel || id === hov) brackets(p.x, p.y, rr + 5, id === sel, URN);
          if ((rank < 6 || s.zoom > 1.3) && id !== hov) {
            ctx.fillStyle = INK(0.8 * fade * labA);
            haloText(`${c.name.toUpperCase()} · ${fmtK(c.t2024)} tU`, p.x + rr + 5, p.y - 4);
          }
        });
        for (const m of MINE_PINS) {
          const p = project(rot, m.lon!, m.lat!, cx, cy, R);
          if (p.z < 0.15) continue;
          const fade = Math.min(1, (p.z - 0.15) / 0.3) * ramp(900, 700);
          const id = "mine:" + m.id;
          ctx.fillStyle = URN_HI(0.95 * fade);
          ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
          if (id === sel || id === hov) brackets(p.x, p.y, 9, id === sel, URN);
          if (s.zoom > 1.6 && id !== hov) { ctx.fillStyle = URN(0.85 * fade * labA); haloText(m.name.toUpperCase(), p.x + 6, p.y + 11); }
        }
      }

      /* processing sites */
      for (const site of SITES) {
        if (!L[site.stage]) continue;
        const p = project(rot, site.lon, site.lat, cx, cy, R);
        if (p.z < 0.15) continue;
        const fade = Math.min(1, (p.z - 0.15) / 0.3) * ramp(1100, 800);
        const id = "site:" + site.id;
        const big = (site.capacity ?? 0) >= 7000 || site.stage === "enrichment";
        drawGlyph(ctx, site.stage, p.x, p.y, (big ? 5 : 4) * Math.min(1.2, zoomScale));
        ctx.fillStyle = URN((id === sel || id === hov ? 0.5 : 0.18) * fade);
        ctx.fill();
        ctx.strokeStyle = URN_HI((id === sel || id === hov ? 1 : 0.75) * fade);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (id === sel || id === hov) brackets(p.x, p.y, 10, id === sel, URN);
        if ((s.zoom > 1.5 || id === sel) && id !== hov) {
          ctx.fillStyle = INK(0.7 * fade * labA);
          haloText(site.name.toUpperCase(), p.x + 8, p.y + 3);
        }
      }

      if (!readyFired.current && ramp(0, 650) > 0.5) { readyFired.current = true; onReady?.(); }
    };
    if (introT0.current === null) introT0.current = initialView ? performance.now() - 4000 : performance.now();
    const loop = (now: number) => {
      raf = 0;
      if (visible) draw(now);
      if (!reducedRef.current) raf = requestAnimationFrame(loop);
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
    (canvasRef.current as unknown as { __hit?: (x: number, y: number) => Selection | null } | null)?.__hit?.(x, y) ?? null;
  const positionHoverCard = (x: number, y: number) => {
    const el = hoverPosRef.current;
    if (!el) return;
    const { w, h } = size.current;
    const px = x > w - 260 ? x - 14 - 240 : x + 14;
    const py = y > h - 180 ? y - 10 - 160 : y + 10;
    el.style.transform = `translate(${px}px, ${py}px)`;
  };
  useEffect(() => { if (hover) positionHoverCard(lastPointerRef.current.x, lastPointerRef.current.y); }, [hover]);

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
      if (s.pinchD > 0) s.zoom = clamp((s.pinchZ * d) / s.pinchD, 0.85, 2.6);
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
      const id = hit ? selId(hit) : null;
      if (s.hovered !== id) { s.hovered = id; setHover(hit); }
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
    s.zoom = clamp(s.zoom * (e.deltaY > 0 ? 0.94 : 1.06), 0.85, 2.6);
    s.lastInteract = performance.now();
    hasMoved.current = true;
    setTouched(true);
    redrawRef.current();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedRef.current) closePanel(); else onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel, onExit]);

  const hoverCard = (() => {
    if (!hover) return null;
    if (hover.type === "country") return { title: hover.c.name, lines: [`${hover.c.t2024.toLocaleString("en-AU")} tU mined in 2024${hover.c.estimate ? " (estimate)" : ""}`, "Mining · reference data"] };
    if (hover.type === "mine") return { title: hover.m.name, lines: [hover.m.owner, hover.m.t2024 ? `${hover.m.t2024.toLocaleString("en-AU")} tU in 2024 · ${hover.m.method}` : hover.m.method] };
    if (hover.type === "site") return { title: `${hover.s.name} · ${hover.s.company}`, lines: [STAGE_LABEL[hover.s.stage], hover.s.capacity !== null ? `${hover.s.capacity.toLocaleString("en-AU")} ${STAGE_UNIT[hover.s.stage]}${hover.s.estimate ? " (estimate)" : ""}` : hover.s.groupNote ?? ""] };
    const r = hover.r;
    return { title: r.name, lines: [`${r.operable} reactors operable · ${(r.mwe / 1000).toFixed(1)} GWe`, `${r.construction} building · ${r.planned} planned · ${r.uReq.toLocaleString("en-AU")} tU needed (2025)`] };
  })();

  const layerRows: { key: keyof UraniumLayers; label: string; stage?: Stage }[] = [
    { key: "mines", label: "Mining" },
    { key: "conversion", label: "Conversion", stage: "conversion" },
    { key: "enrichment", label: "Enrichment", stage: "enrichment" },
    { key: "fabrication", label: "Fuel fabrication", stage: "fabrication" },
  ];

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
          onPointerLeave={() => { if (sim.current.hovered) { sim.current.hovered = null; setHover(null); } }}
          onWheel={onWheel}
          aria-label="Uranium fuel chain globe: mines, conversion, enrichment, fuel fabrication and reactors"
        />
      </div>

      <AnimatePresence>
        {hoverCard && (
          <motion.div
            ref={hoverPosRef}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            className="pointer-events-none absolute left-0 top-0 z-20 w-[240px] rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.92)] px-3 py-2.5 backdrop-blur-md"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink)]">{hoverCard.title}</p>
            {hoverCard.lines.filter(Boolean).map((line) => (
              <p key={line} className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{line}</p>
            ))}
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.2em]" style={{ color: hover?.type === "reactor" ? DEMAND_CSS : URANIUM_CSS }}>Click for panel</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div role="group" aria-label="Uranium globe view" className="absolute left-3 top-4 z-20 flex flex-wrap gap-1 rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.9)] p-1 backdrop-blur-md md:left-6">
        {PRESETS.map((preset) => {
          const on = sameLayers(layers, preset.layers);
          return (
            <button key={preset.name} type="button" aria-pressed={on} onClick={() => { setLayers(preset.layers); setTouched(true); }}
              className="rounded-sm px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors"
              style={{ color: on ? "var(--depth-0)" : "var(--ink-2)", background: on ? URANIUM_CSS : "transparent" }}>
              {preset.name}
            </button>
          );
        })}
      </div>

      <div className="absolute bottom-4 left-4 z-20 md:bottom-6 md:left-6">
        <button type="button" onClick={() => setLayersExpanded((v) => !v)} aria-expanded={layersExpanded} aria-controls="uranium-layer-controls"
          className="rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.85)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-2)] backdrop-blur-md">
          Layers {layersExpanded ? "▾" : "▸"}
        </button>
        <AnimatePresence>
          {layersExpanded && (
            <motion.div id="uranium-layer-controls" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="mt-2 flex w-[220px] flex-col gap-1.5 rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.92)] p-3 backdrop-blur-md">
              {layerRows.map(({ key, label, stage }) => {
                const on = layers[key] === true;
                return (
                  <button key={key} type="button" aria-pressed={on} onClick={() => setLayers((L) => ({ ...L, [key]: !L[key] }))}
                    className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-2)]">
                    <span className="flex items-center gap-2">
                      <svg width="10" height="10" viewBox="-6 -6 12 12" aria-hidden>
                        {stage === "conversion" ? <path d="M0,-5 L4.75,3.5 L-4.75,3.5 Z" fill="none" stroke={URANIUM_CSS} />
                          : stage === "enrichment" ? <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill="none" stroke={URANIUM_CSS} />
                          : stage === "fabrication" ? <rect x="-3.75" y="-3.75" width="7.5" height="7.5" fill="none" stroke={URANIUM_CSS} />
                          : <circle r="4" fill="none" stroke={URANIUM_CSS} />}
                      </svg>
                      {label}
                    </span>
                    <span style={{ color: on ? URANIUM_CSS : "var(--ink-3)" }}>{on ? "ON" : "OFF"}</span>
                  </button>
                );
              })}
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-2)]">
                <span className="flex items-center gap-2"><svg width="10" height="10" viewBox="-6 -6 12 12" aria-hidden><circle r="4" fill="none" stroke={DEMAND_CSS} /></svg>Reactors</span>
                <span className="flex gap-2">
                  {(["off", "operable", "pipeline"] as const).map((mode) => (
                    <button key={mode} type="button" aria-pressed={layers.reactors === mode} onClick={() => setLayers((L) => ({ ...L, reactors: mode }))}
                      className="font-mono text-[8px] uppercase tracking-[0.14em]" style={{ color: layers.reactors === mode ? DEMAND_CSS : "var(--ink-3)" }}>
                      {mode === "pipeline" ? "building" : mode}
                    </button>
                  ))}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!touched && (
        <p className="pointer-events-none absolute bottom-6 left-32 z-10 hidden font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)] lg:block">
          Drag · scroll to zoom · select a mine, plant or country
        </p>
      )}

      <UraniumIntelPanel narrow={narrow} selected={selected} reactorMode={layers.reactors} focus={focus} closePanel={closePanel} />
    </div>
  );
}
