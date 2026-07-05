"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Oil Tracker · full experience
   Lives ONLY on /Projects/Oil-Tracker (loaded lazily there).
   The homepage teaser is components/projects/OilTracker.tsx and
   must never import this module — landing stays lightweight.

   Owns: draggable rotation with inertia, wheel/pinch zoom, ranked
   corridor system, clickable hotspots, signal panels, intro reveal.
   All figures are modeled estimates for the preview; swap the
   HOTSPOTS / corridor data for a real feed later.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DUR, EASE_OUT } from "../motion";
import {
  AMB, AMB_HI, AMBER_CSS, DOT, INK,
  HOME, MAJOR_PTS, SECONDARY_PTS, TERTIARY_PTS,
  bakeCorridor, getDots, rotator, vec,
  type OTView, type Rot,
} from "./oilTrackerShared";
import useOilData from "./useOilData";
import { formatPctSigned, formatUsdBbl, formatUtcTime } from "./oilFormat";
import type { Benchmark, DailyPrice, LatestQuote } from "@a3ro/oil-backend";

/* ══ route-only content: hotspot hierarchy + signal copy ══ */
type HotspotKind = "live" | "demand" | "watch" | "reserved";
type Hotspot = {
  id: string;
  label: string;
  sub?: string;
  side?: -1 | 1;
  glyph?: "ring" | "diamond";
  lon: number;
  lat: number;
  kind: HotspotKind;
  zoom: number;
  corridor: string;
  title: string;
  status: string;
  metric: string;
  metricLabel: string;
  rows: { k: string; v: string; bar: number; warm?: boolean }[];
  spark: number[];
  note: string;
};

const HOTSPOTS: Hotspot[] = [
  {
    id: "hormuz", label: "HORMUZ", sub: "EST. THROUGHPUT 80%", side: -1,
    glyph: "ring", lon: 56.5, lat: 26.6, kind: "live", zoom: 1.5,
    corridor: "Corridor 01", title: "Strait of Hormuz", status: "Signal",
    metric: "80%", metricLabel: "Estimated throughput · modeled baseline",
    rows: [
      { k: "Outbound flow recovery", v: "Strong", bar: 0.78 },
      { k: "Modeled corridor flow", v: "≈14.2 Mb/d", bar: 0.71 },
      { k: "Scenario pressure", v: "Elevated", bar: 0.58, warm: true },
    ],
    spark: [52, 54, 51, 47, 42, 38, 41, 44, 49, 55, 60, 63, 61, 66, 70, 74, 72, 77, 79, 80],
    note: "Primary live chokepoint. Outbound recovery holds above the modeled baseline — scenario pressure stays elevated.",
  },
  {
    id: "china", label: "CHINA · DEMAND", sub: "WILDCARD",
    glyph: "diamond", lon: 122.2, lat: 29.9, kind: "demand", zoom: 1.32,
    corridor: "Demand · 01", title: "China · East Coast", status: "Demand",
    metric: "Wildcard", metricLabel: "Inferred demand pressure · import posture",
    rows: [
      { k: "Inferred demand pressure", v: "Elevated variance", bar: 0.62, warm: true },
      { k: "Stockpile posture", v: "Opaque", bar: 0.48 },
      { k: "Refinery run signal", v: "Firm", bar: 0.66 },
    ],
    spark: [61, 64, 58, 66, 60, 69, 63, 71, 65, 73, 66, 75, 68, 74, 70, 77, 71, 79, 73, 80],
    note: "The system's demand wildcard. Import posture sets corridor variance — read against stockpile and run-rate signals.",
  },
  {
    id: "sg", label: "SINGAPORE STRAIT",
    glyph: "ring", lon: 104.2, lat: 1.1, kind: "watch", zoom: 1.45,
    corridor: "Corridor 02", title: "Singapore Strait", status: "Watch",
    metric: "Firm", metricLabel: "Transit density · modeled flow-through",
    rows: [
      { k: "Transit density", v: "Firm", bar: 0.64 },
      { k: "Eastbound share", v: "Rising", bar: 0.58 },
      { k: "Bunker demand signal", v: "Steady", bar: 0.51 },
    ],
    spark: [58, 57, 59, 61, 60, 63, 66, 64, 67, 70, 68, 72, 71, 74, 73, 76, 78, 75, 79, 81],
    note: "Primary transit gate between Gulf supply and North Asian demand — watched for routing shifts and congestion pressure.",
  },
  {
    id: "ara", label: "ARA · ROTTERDAM",
    glyph: "ring", lon: 4.3, lat: 51.9, kind: "watch", zoom: 1.45,
    corridor: "Corridor 03", title: "ARA · Rotterdam", status: "Watch",
    metric: "Tight", metricLabel: "Refined product balance · modeled",
    rows: [
      { k: "Product tightness", v: "Persistent", bar: 0.69, warm: true },
      { k: "Crude structure", v: "Softening", bar: 0.38 },
      { k: "Crack pressure", v: "Elevated", bar: 0.64 },
    ],
    spark: [64, 66, 63, 67, 70, 69, 73, 72, 75, 74, 77, 80, 78, 82, 81, 84, 83, 86, 85, 88],
    note: "Products stay tight while crude softens — refined-side pressure leads the corridor signal.",
  },
  {
    id: "usgc", label: "US GULF",
    glyph: "ring", lon: -94.5, lat: 28.6, kind: "reserved", zoom: 1.2,
    corridor: "Corridor 04", title: "US Gulf Exports", status: "Reserved",
    metric: "—", metricLabel: "Corridor slot reserved",
    rows: [],
    spark: [],
    note: "Activation pending. Additional corridors onboard as coverage expands.",
  },
];

/* ══ benchmarks: no globe location — a parallel DOM-only signal track ══
   Local mirror of the backend's BENCHMARKS: a value import of BENCHMARKS
   from "@a3ro/oil-backend" would pull the pg-backed index into this
   client bundle, so the tracked list is hardcoded here (types only). */
const TRACKED = ["WTI", "BRENT"] as const satisfies readonly Benchmark[];

const BENCH_TITLE: Record<Benchmark, string> = {
  WTI: "WTI Crude",
  BRENT: "Brent Crude",
};

const BENCH_NOTE: Record<Benchmark, string> = {
  WTI: "NYMEX WTI benchmark. Normalized to USD per barrel by the A3RO ingest pipeline; staleness and cross-source checks applied automatically.",
  BRENT: "ICE Brent benchmark. Normalized to USD per barrel by the A3RO ingest pipeline; staleness and cross-source checks applied automatically.",
};

const TICKS = [
  { label: "BAB EL-MANDEB", lon: 43.4, lat: 12.6 },
  { label: "SUEZ", lon: 32.4, lat: 30.0 },
];

type CorridorRank = "major" | "secondary" | "tertiary";
type Baked = { samples: Float32Array; n: number; rank: CorridorRank; speed: number; phase: number };
let BAKED: Baked[] | null = null;
function getCorridors(): Baked[] {
  if (BAKED) return BAKED;
  BAKED = [
    { ...bakeCorridor(MAJOR_PTS), rank: "major", speed: 0.05, phase: 0 },
    { ...bakeCorridor(SECONDARY_PTS), rank: "secondary", speed: 0.03, phase: 0.55 },
    ...TERTIARY_PTS.map((pts) => ({ ...bakeCorridor(pts), rank: "tertiary" as const, speed: 0, phase: 0 })),
  ];
  return BAKED;
}

/* ══ simulation state (mutable, outside React) ══ */
type Tween = {
  t0: number; dur: number;
  from: { lon: number; lat: number; zoom: number; off: number };
  to: { lon: number; lat: number; zoom: number; off: number };
};
type Sim = {
  lon: number; lat: number; zoom: number; off: number;
  vlon: number; vlat: number;
  dragging: boolean; px: number; py: number; movedPx: number;
  lastInteract: number; drift: number;
  tween: Tween | null;
  hovered: string | null;
  pointers: Map<number, { x: number; y: number }>;
  pinchD: number; pinchZ: number;
};

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const shortest = (from: number, to: number) => ((to - from + 540) % 360) - 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ══ component ══ */
export default function OilTrackerCore({
  initialView,
  skipIntro = false,
  onExit,
  onReady,
  className = "",
}: {
  initialView?: OTView | null;
  skipIntro?: boolean;
  onExit?: () => void;
  onReady?: () => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  const [selected, setSelected] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const sim = useRef<Sim>({
    lon: initialView?.lon ?? 97,
    lat: initialView?.lat ?? 14,
    zoom: initialView?.zoom ?? 0.93,
    off: 0,
    vlon: 0, vlat: 0,
    dragging: false, px: 0, py: 0, movedPx: 0,
    lastInteract: 0, drift: 0,
    tween: null, hovered: null,
    pointers: new Map(), pinchD: 0, pinchZ: 1,
  });
  const size = useRef({ w: 0, h: 0 });
  const introT0 = useRef<number | null>(null);
  const hasMoved = useRef(false);
  const skipIntroRef = useRef(skipIntro);
  const selectedRef = useRef<string | null>(null);
  const reducedRef = useRef(false);
  reducedRef.current = !!reduced;
  selectedRef.current = selected;

  const tweenTo = useCallback((to: Partial<Tween["to"]>, dur = 1150) => {
    const s = sim.current;
    s.vlon = 0;
    s.vlat = 0;
    s.tween = {
      t0: performance.now(),
      dur: reducedRef.current ? 1 : dur,
      from: { lon: s.lon, lat: s.lat, zoom: s.zoom, off: s.off },
      to: { lon: to.lon ?? s.lon, lat: to.lat ?? s.lat, zoom: to.zoom ?? s.zoom, off: to.off ?? s.off },
    };
  }, []);

  const focusHotspot = useCallback((h: Hotspot) => {
    setSelected(h.id);
    setTouched(true);
    hasMoved.current = true;
    sim.current.lastInteract = performance.now();
    const isNarrow = size.current.w < 640;
    tweenTo(
      { lon: h.lon, lat: clamp(h.lat, -48, 48), zoom: h.zoom, off: isNarrow ? 0 : -0.14 },
      1150
    );
  }, [tweenTo]);

  const feed = useOilData();

  /* benchmarks reuse the existing `selected` state via "bench:WTI" / "bench:BRENT" ids */
  const benchSel: Benchmark | null =
    selected === "bench:WTI" ? "WTI" : selected === "bench:BRENT" ? "BRENT" : null;

  const focusBenchmark = useCallback((b: Benchmark) => {
    setSelected(`bench:${b}`);
    setTouched(true);
    sim.current.lastInteract = performance.now();
    const isNarrow = size.current.w < 640;
    tweenTo({ off: isNarrow ? 0 : -0.14 }, 900);
  }, [tweenTo]);

  const closePanel = useCallback(() => {
    setSelected(null);
    sim.current.lastInteract = performance.now();
    tweenTo({ zoom: 1, off: 0, lat: clamp(sim.current.lat, -34, 34) }, 900);
  }, [tweenTo]);

  /* ── engine ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !stage || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dots = getDots(19000);
    const corridors = getCorridors();
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
      setNarrow(r.width < 640);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const frame = () => {
      const s = sim.current;
      const { w, h } = size.current;
      const cx = w * (0.5 + s.off);
      const cy = h * 0.53;
      const R = Math.min(w * 0.42, h * 0.44) * s.zoom;
      return { s, w, h, cx, cy, R };
    };

    const project = (rot: Rot, v: [number, number, number], cx: number, cy: number, R: number) => {
      rot(v[0], v[1], v[2], o);
      return { x: cx + o[0] * R, y: cy - o[1] * R, z: o[2] };
    };

    const hitTest = (mx: number, my: number): Hotspot | null => {
      const { s, cx, cy, R } = frame();
      const rot = rotator(s.lon, s.lat);
      let best: Hotspot | null = null;
      let bestD = 18;
      for (const hs of HOTSPOTS) {
        const p = project(rot, vec(hs.lon, hs.lat), cx, cy, R);
        if (p.z < 0.12) continue;
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestD) { bestD = d; best = hs; }
      }
      return best;
    };

    /* ── draw one frame ── */
    const draw = (now: number) => {
      const { s, w, h, cx, cy, R } = frame();
      const t = now / 1000;
      const ramp = (start: number, dur: number) =>
        reducedRef.current ? 1
        : introT0.current === null ? 0
        : clamp((now - introT0.current - start) / dur, 0, 1);
      const revMajor = easeInOut(ramp(500, 1500));
      const revSec = easeInOut(ramp(1400, 1400));
      const aTert = ramp(2400, 900);
      const labPrim = ramp(1900, 700);
      const labSec = ramp(2800, 700);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = ramp(0, 650);

      /* backdrop depth */
      const bg = ctx.createRadialGradient(cx, cy + R * 0.15, 0, cx, cy, Math.max(w, h) * 0.8);
      bg.addColorStop(0, "rgba(232,235,232,0.016)");
      bg.addColorStop(1, "rgba(232,235,232,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      /* range rings */
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = INK(0.026);
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1 + i * 0.22), 0, Math.PI * 2);
        ctx.stroke();
      }

      /* sphere sheen */
      const sph = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.02);
      sph.addColorStop(0, "rgba(232,235,232,0.045)");
      sph.addColorStop(0.6, "rgba(232,235,232,0.012)");
      sph.addColorStop(1, "rgba(232,235,232,0)");
      ctx.fillStyle = sph;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      const rot = rotator(s.lon, s.lat);

      /* graticule */
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

      /* land dots */
      for (let i = 0; i < dots.length; i += 3) {
        rot(dots[i], dots[i + 1], dots[i + 2], o);
        if (o[2] <= 0.02) continue;
        const sx = cx + o[0] * R, sy = cy - o[1] * R;
        const a = 0.15 + 0.6 * Math.pow(o[2], 1.6);
        const ds = (1 + 1.1 * o[2]) * Math.min(1.25, Math.max(0.8, R / 260));
        ctx.fillStyle = DOT(a);
        ctx.fillRect(sx - ds / 2, sy - ds / 2, ds, ds);
      }

      /* rim */
      ctx.strokeStyle = INK(0.1);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      /* corridors — ranked hierarchy with intro draw-in */
      for (const c of corridors) {
        const S = c.samples, N = c.n;
        const rev = c.rank === "major" ? revMajor : c.rank === "secondary" ? revSec : 1;
        const limit = Math.max(2, Math.ceil(N * rev));
        if (rev <= 0.01) continue;
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < limit; i++) {
          rot(S[i * 3], S[i * 3 + 1], S[i * 3 + 2], o);
          if (o[2] <= 0) { pen = false; continue; }
          const sx = cx + o[0] * R, sy = cy - o[1] * R;
          if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy);
        }
        if (c.rank === "tertiary") {
          if (aTert <= 0.01) continue;
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = INK(0.07 * aTert);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }
        const major = c.rank === "major";
        ctx.strokeStyle = AMB(major ? 0.38 : 0.16);
        ctx.lineWidth = major ? 1.6 : 1;
        ctx.stroke();

        if (!reducedRef.current && rev >= 1) {
          const head = (t * c.speed + c.phase) % 1;
          const len = 0.1;
          const passes = major
            ? ([[3.4, AMB(0.12)], [1.6, AMB_HI(0.85)]] as const)
            : ([[2.6, AMB(0.07)], [1.1, AMB(0.55)]] as const);
          for (const pass of passes) {
            ctx.beginPath();
            pen = false;
            for (let i = 0; i < N; i++) {
              const u = i / (N - 1);
              const d = head - u;
              if (d < 0 || d > len) { pen = false; continue; }
              rot(S[i * 3], S[i * 3 + 1], S[i * 3 + 2], o);
              if (o[2] <= 0) { pen = false; continue; }
              const sx = cx + o[0] * R, sy = cy - o[1] * R;
              if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy);
            }
            ctx.lineWidth = pass[0];
            ctx.strokeStyle = pass[1];
            ctx.lineCap = "round";
            ctx.stroke();
          }
        }
      }

      /* chokepoint ticks */
      ctx.font = '500 8px "JetBrains Mono", ui-monospace, monospace';
      for (const tk of TICKS) {
        rot(...vec(tk.lon, tk.lat), o);
        if (o[2] < 0.35) continue;
        const sx = cx + o[0] * R, sy = cy - o[1] * R;
        const a = 0.3 * o[2] * labSec;
        ctx.strokeStyle = INK(a);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy);
        ctx.lineTo(sx + 3, sy);
        ctx.moveTo(sx, sy - 3);
        ctx.lineTo(sx, sy + 3);
        ctx.stroke();
        ctx.fillStyle = INK(a * 0.8);
        ctx.fillText(tk.label, sx + 6, sy + 2.5);
      }

      /* hotspots */
      ctx.font = '500 9px "JetBrains Mono", ui-monospace, monospace';
      for (const hs of HOTSPOTS) {
        rot(...vec(hs.lon, hs.lat), o);
        if (o[2] < 0.12) continue;
        const sx = cx + o[0] * R, sy = cy - o[1] * R;
        const primary = hs.kind === "live" || hs.kind === "demand";
        const fade = Math.min(1, (o[2] - 0.12) / 0.3) * (primary ? labPrim : labSec);
        if (fade <= 0.01) continue;
        const isSel = selectedRef.current === hs.id;
        const isHover = s.hovered === hs.id;
        const col = primary ? AMB : INK;
        const coreA = primary ? 0.95 : hs.kind === "reserved" ? 0.35 : 0.6;

        if (hs.glyph === "diamond") {
          const r = 5.5;
          ctx.strokeStyle = col(0.55 * fade);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx, sy - r);
          ctx.lineTo(sx + r, sy);
          ctx.lineTo(sx, sy + r);
          ctx.lineTo(sx - r, sy);
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = col(coreA * fade);
          ctx.beginPath();
          ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = col(coreA * fade);
          ctx.beginPath();
          ctx.arc(sx, sy, primary ? 2.4 : 1.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = col((primary ? 0.42 : 0.22) * fade);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sx, sy, primary ? 6.5 : 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (!reducedRef.current && primary) {
          const pt = (t * 0.4 + (hs.lon + 180) / 360) % 1;
          ctx.strokeStyle = col(0.3 * (1 - pt) * fade);
          ctx.beginPath();
          ctx.arc(sx, sy, 7 + pt * 16, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (isSel) {
          const b = 13;
          ctx.strokeStyle = col(0.85 * fade);
          ctx.lineWidth = 1;
          for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
            ctx.beginPath();
            ctx.moveTo(sx + dx * b, sy + dy * b - dy * 5);
            ctx.lineTo(sx + dx * b, sy + dy * b);
            ctx.lineTo(sx + dx * b - dx * 5, sy + dy * b);
            ctx.stroke();
          }
        }

        const side = hs.side ?? 1;
        const lx = sx + side * 12, ly = sy - 10;
        ctx.textAlign = side < 0 ? "right" : "left";
        ctx.strokeStyle = INK(0.22 * fade);
        ctx.beginPath();
        ctx.moveTo(sx + side * 4, sy - 4);
        ctx.lineTo(lx - side * 3, ly + 3);
        ctx.stroke();
        ctx.fillStyle = INK((isSel || isHover ? 0.9 : primary ? 0.85 : 0.55) * fade);
        ctx.fillText(hs.label, lx, ly);
        if (primary && hs.sub) {
          ctx.fillStyle = AMB(0.8 * fade);
          ctx.fillText(hs.sub, lx, ly + 11);
        } else if (isHover && !isSel) {
          ctx.fillStyle = INK(0.45 * fade);
          ctx.fillText(hs.kind === "reserved" ? "SLOT RESERVED" : "SIGNAL — OPEN", lx, ly + 11);
        }
        ctx.textAlign = "left";
      }
    };

    /* ── per-frame simulation ── */
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const dt = Math.min(50, now - last);
      last = now;
      const s = sim.current;

      if (s.tween) {
        const p = clamp((now - s.tween.t0) / s.tween.dur, 0, 1);
        const e = easeInOut(p);
        const { from, to } = s.tween;
        s.lon = from.lon + shortest(from.lon, to.lon) * e;
        s.lat = from.lat + (to.lat - from.lat) * e;
        s.zoom = from.zoom + (to.zoom - from.zoom) * e;
        s.off = from.off + (to.off - from.off) * e;
        if (p >= 1) s.tween = null;
      } else if (!s.dragging) {
        s.lon += s.vlon * dt;
        s.lat = clamp(s.lat + s.vlat * dt, -72, 72);
        const decay = Math.pow(0.9935, dt);
        s.vlon *= decay;
        s.vlat *= decay;
        /* ambient — sway around HOME until first grab, then free drift */
        if (!reducedRef.current && !selectedRef.current && now - s.lastInteract > 2600 && introT0.current !== null) {
          s.drift = Math.min(1, s.drift + dt / 2000);
          const e = easeInOut(s.drift);
          if (!hasMoved.current) {
            const el = now - introT0.current;
            const tl = HOME.lon + 6.5 * Math.sin(el * 0.00021);
            const tla = HOME.lat + 2 * Math.sin(el * 0.00013 + 1.3);
            const k = Math.min(1, dt * 0.0012) * e;
            s.lon += (tl - s.lon) * k;
            s.lat += (tla - s.lat) * k;
          } else {
            s.lon += 0.0011 * dt * e;
          }
        } else {
          s.drift = 0;
        }
      }
      draw(now);
    };
    raf = requestAnimationFrame(loop);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (e.isIntersecting && introT0.current === null) {
        if (skipIntroRef.current || reducedRef.current) {
          /* arrived via the expanding card — globe is already revealed */
          introT0.current = performance.now() - 10000;
          if (!skipIntroRef.current) {
            Object.assign(sim.current, { lon: HOME.lon, lat: HOME.lat, zoom: 1 });
          }
        } else {
          introT0.current = performance.now();
          sim.current.tween = {
            t0: performance.now() + 200,
            dur: 1700,
            from: { lon: sim.current.lon, lat: sim.current.lat, zoom: sim.current.zoom, off: 0 },
            to: { lon: HOME.lon, lat: HOME.lat, zoom: 1, off: 0 },
          };
        }
      }
    }, { threshold: 0.02 });
    io.observe(wrap);
    const onVis = () => { visible = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", onVis);

    /* wheel zoom — the route is fullscreen, no page scroll to protect */
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = sim.current;
      s.tween = null;
      s.zoom = clamp(s.zoom * Math.exp(-e.deltaY * 0.0012), 0.85, 2.4);
      s.lastInteract = performance.now();
      hasMoved.current = true;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    (canvas as unknown as { __hit?: typeof hitTest }).__hit = hitTest;
    onReady?.();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── pointer interaction ── */
  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const p = local(e);
    s.pointers.set(e.pointerId, p);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (s.pointers.size === 2) {
      const [a, b] = Array.from(s.pointers.values());
      s.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      s.pinchZ = s.zoom;
      s.dragging = false;
      return;
    }
    s.dragging = true;
    s.movedPx = 0;
    s.px = p.x;
    s.py = p.y;
    s.vlon = 0;
    s.vlat = 0;
    s.tween = null;
    s.lastInteract = performance.now();
    hasMoved.current = true;
    setTouched(true);
    e.currentTarget.style.cursor = "grabbing";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const p = local(e);
    if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, p);

    if (s.pointers.size === 2) {
      const [a, b] = Array.from(s.pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (s.pinchD > 0) s.zoom = clamp((s.pinchZ * d) / s.pinchD, 0.85, 2.4);
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
      s.px = p.x;
      s.py = p.y;
      s.lastInteract = performance.now();
    } else {
      const hit = (canvasRef.current as unknown as {
        __hit?: (x: number, y: number) => Hotspot | null;
      })?.__hit?.(p.x, p.y);
      s.hovered = hit ? hit.id : null;
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
      const hit = (canvasRef.current as unknown as {
        __hit?: (x: number, y: number) => Hotspot | null;
      })?.__hit?.(p.x, p.y);
      if (hit) focusHotspot(hit);
    }
  };

  /* esc: close panel first, then hand control back to the route */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedRef.current) closePanel();
      else onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closePanel]);

  const sel = HOTSPOTS.find((h) => h.id === selected) ?? null;
  const statusColor = (k: HotspotKind) =>
    k === "live" || k === "demand" ? AMBER_CSS : k === "reserved" ? "var(--ink-3)" : "var(--ink-2)";

  const quoteFor = (b: Benchmark): LatestQuote | undefined =>
    feed.quotes?.find((q) => q.benchmark === b);

  const benchStatus = (q: LatestQuote | undefined): { text: string; color: string } => {
    if (!q) return { text: "—", color: "var(--ink-3)" };
    switch (q.staleness) {
      case "fresh": return { text: "Live", color: AMBER_CSS };
      case "aging": return { text: "Aging", color: "var(--ink-2)" };
      case "stale": return { text: "Stale", color: "var(--ink-3)" };
      case "dead": return { text: "Offline", color: "var(--ink-3)" };
    }
  };

  /* ── benchmark signal panel content (only computed rows/spark included) ── */
  const bq: LatestQuote | undefined = benchSel ? quoteFor(benchSel) : undefined;
  const bs: DailyPrice[] | undefined = benchSel ? feed.series[benchSel] : undefined;
  const benchRows: { k: string; v: string; bar: number; warm?: boolean }[] = [];
  if (bq && bs) {
    const observedDate = bq.observedAt.slice(0, 10);
    const prior = [...bs].reverse().find((p) => p.periodDate < observedDate);
    if (prior && prior.price > 0) {
      const ratio = (bq.price - prior.price) / prior.price;
      benchRows.push({
        k: "vs prior close",
        v: formatPctSigned(ratio),
        bar: clamp(Math.abs(ratio) / 0.05, 0.06, 1),
        warm: ratio < 0,
      });
    }
    if (bs.length >= 2) {
      const prices = bs.map((p) => p.price);
      const min = Math.min(...prices), max = Math.max(...prices);
      benchRows.push({
        k: "30d range",
        v: `${formatUsdBbl(min)} – ${formatUsdBbl(max)}`,
        bar: max === min ? 0 : clamp((bq.price - min) / (max - min), 0, 1),
        warm: false,
      });
    }
  }
  if (bs && bs.length >= 1) {
    const anyDisagreement = bs.some((p) => p.disagreement);
    benchRows.push({
      k: "Source agreement",
      v: anyDisagreement ? "Mixed" : "Clean",
      bar: anyDisagreement ? 0.45 : 0.85,
      warm: anyDisagreement,
    });
  }
  const benchStatusInfo: { text: string; color: string } | null = bq
    ? {
        text: `${bq.kind} · ${bq.staleness}`,
        color: bq.staleness === "fresh" ? AMBER_CSS : bq.staleness === "aging" ? "var(--ink-2)" : "var(--ink-3)",
      }
    : null;

  /* ── US Gulf corridor (usgc hotspot) live override ──
     Weekly EIA data (crude exports + PADD 3 refinery utilization).
     Computed as small locals rather than restructuring the signal
     panel — when !usgulfLive every one of these is unused and the
     "usgc" reserved-slot rendering below is untouched. */
  const usgulfMetrics = feed.corridors?.filter((m) => m.corridor === "usgulf") ?? [];
  const usgulfExports = usgulfMetrics.find((m) => m.metric === "crude_exports");
  const usgulfUtil = usgulfMetrics.find((m) => m.metric === "refinery_utilization");
  const usgulfLive = usgulfExports !== undefined || usgulfUtil !== undefined;

  const usgcOverrideMetric = usgulfExports
    ? `${usgulfExports.value.toFixed(2)} Mb/d`
    : usgulfUtil
      ? `${usgulfUtil.value.toFixed(1)}%`
      : "";
  const usgcOverrideMetricLabel = usgulfExports
    ? `US crude exports · weekly EIA · as of ${usgulfExports.periodDate}`
    : usgulfUtil
      ? `PADD 3 refinery utilization · weekly EIA · as of ${usgulfUtil.periodDate}`
      : "";
  const usgcOverrideRows: { k: string; v: string; bar: number; warm?: boolean }[] = [];
  if (usgulfExports) {
    usgcOverrideRows.push({
      k: "US crude exports",
      v: `${usgulfExports.value.toFixed(2)} Mb/d`,
      bar: clamp(usgulfExports.value / 6, 0, 1),
    });
  }
  if (usgulfUtil) {
    usgcOverrideRows.push({
      k: "Refinery utilization · PADD 3",
      v: `${usgulfUtil.value.toFixed(1)}%`,
      bar: clamp(usgulfUtil.value / 100, 0, 1),
      warm: usgulfUtil.value >= 95,
    });
  }

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`} data-lenis-prevent="">
      {/* stage */}
      <div ref={stageRef} className="absolute inset-0 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 110% at 50% 65%, #101313 0%, var(--depth-1) 55%, #070808 100%)",
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none", cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="Interactive globe — global oil corridor monitor. Drag to rotate, scroll to zoom, select a corridor for signal detail."
          role="img"
        />

        {/* identity */}
        <div className="pointer-events-none absolute left-6 top-[4.5rem] max-w-[46%] md:left-10 md:top-[5.5rem]">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·01 — <span style={{ color: AMBER_CSS }}>Featured</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
            Oil Tracker
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
            Live corridor intelligence for crude, products, and price-sensitive flows.
          </p>
          {!narrow && (
            <p className="mt-2 hidden text-xs leading-relaxed text-[var(--ink-3)] md:block">
              Benchmark prices stream live. Corridor signals are modeled
              estimates while real feeds onboard.
            </p>
          )}
        </div>

        {/* corridor index */}
        {!narrow && (
          <div className="absolute right-6 top-[4.5rem] hidden flex-col items-stretch md:right-10 md:top-[5.5rem] md:flex">
            <p className="border-l border-[var(--line)] px-3 py-[7px] font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              Benchmarks
            </p>
            {TRACKED.map((b) => {
              const q = quoteFor(b);
              const st = benchStatus(q);
              const isSel = benchSel === b;
              return (
                <button
                  key={b}
                  onClick={() => (isSel ? closePanel() : focusBenchmark(b))}
                  aria-label={`Open ${b} benchmark detail`}
                  title={BENCH_TITLE[b]}
                  className={`flex items-center justify-between gap-6 border-l px-3 py-[7px] text-left transition-colors duration-[var(--dur-micro)] ${
                    isSel
                      ? "border-[#d4a157] bg-[rgba(212,161,87,0.08)]"
                      : "border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[rgba(232,235,232,0.03)]"
                  }`}
                >
                  <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${isSel ? "text-[var(--ink)]" : "text-[var(--ink-2)]"}`}>
                    {BENCH_TITLE[b]}
                  </span>
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.2em]"
                    style={{ color: st.color }}
                  >
                    {st.text}
                  </span>
                </button>
              );
            })}

            <p className="mt-3 border-l border-[var(--line)] px-3 py-[7px] font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              Corridors
            </p>
            {HOTSPOTS.map((h) => (
              <button
                key={h.id}
                onClick={() => (selected === h.id ? closePanel() : focusHotspot(h))}
                className={`flex items-center justify-between gap-6 border-l px-3 py-[7px] text-left transition-colors duration-[var(--dur-micro)] ${
                  selected === h.id
                    ? "border-[#d4a157] bg-[rgba(212,161,87,0.08)]"
                    : "border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[rgba(232,235,232,0.03)]"
                }`}
              >
                <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${selected === h.id ? "text-[var(--ink)]" : "text-[var(--ink-2)]"}`}>
                  {h.title}
                </span>
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.2em]"
                  style={{ color: h.id === "usgc" && usgulfLive ? AMBER_CSS : statusColor(h.kind) }}
                >
                  {h.id === "usgc" && usgulfLive ? "Weekly" : h.status}
                </span>
              </button>
            ))}
            <p className="border-l border-[var(--line)] px-3 py-[7px] font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              + corridor slots reserved
            </p>
          </div>
        )}

        {/* live benchmark ticker */}
        <div className="pointer-events-none absolute bottom-16 left-6 flex gap-7 md:left-10 md:gap-10">
          {TRACKED.map((b) => {
            const q = quoteFor(b);
            const dotColor: string | null =
              q?.staleness === "fresh"
                ? AMBER_CSS
                : q?.staleness === "aging"
                  ? "var(--ink-2)"
                  : q
                    ? "var(--ink-3)"
                    : null;
            const valueColor =
              !q || q.staleness === "stale" || q.staleness === "dead" ? "var(--ink-3)" : "var(--ink)";
            const isSel = benchSel === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => (isSel ? closePanel() : focusBenchmark(b))}
                className="group pointer-events-auto text-left"
                aria-label={`Open ${b} benchmark detail`}
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
                  {b} · USD/bbl
                </p>
                <p className="mt-1 flex items-center gap-[6px] font-mono text-sm">
                  {dotColor && (
                    <span
                      aria-hidden
                      className="inline-block h-[5px] w-[5px] rounded-full"
                      style={{ background: dotColor }}
                    />
                  )}
                  <span
                    className="transition-colors duration-[var(--dur-micro)] group-hover:!text-[var(--ink)]"
                    style={{ color: valueColor }}
                  >
                    {q ? formatUsdBbl(q.price) : "—"}
                  </span>
                  {q?.suspect && (
                    <sup className="font-mono text-[8px] uppercase tracking-[0.15em]" style={{ color: AMBER_CSS }}>
                      SUSPECT
                    </sup>
                  )}
                </p>
              </button>
            );
          })}
          <div className="hidden sm:block">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">Feed</p>
            <p className="mt-1 font-mono text-sm" style={{ color: "var(--ink)" }}>
              {feed.status === "error"
                ? "OFFLINE"
                : feed.quotes && feed.quotes.length > 0
                ? formatUtcTime(
                    feed.quotes.reduce((latest, q) => (q.observedAt > latest ? q.observedAt : latest), feed.quotes[0].observedAt)
                  )
                : "—"}
            </p>
          </div>
        </div>

        {/* interaction hint */}
        <AnimatePresence>
          {!touched && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.base, delay: 0.6 }}
              className="pointer-events-none absolute bottom-16 right-6 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] md:right-10"
            >
              drag to rotate · scroll to zoom · select a corridor
            </motion.p>
          )}
        </AnimatePresence>

        {/* signal panel */}
        <AnimatePresence>
          {sel && (
            <motion.aside
              key={sel.id}
              initial={narrow ? { y: 24, opacity: 0 } : { x: 28, opacity: 0 }}
              animate={narrow ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
              exit={narrow ? { y: 24, opacity: 0 } : { x: 28, opacity: 0 }}
              transition={{ duration: DUR.base * 1.4, ease: EASE_OUT as unknown as number[] }}
              className={
                narrow
                  ? "absolute inset-x-0 bottom-12 border-t border-[var(--line)] bg-[rgba(11,13,13,0.92)] px-5 pb-5 pt-4 backdrop-blur-md"
                  : "absolute bottom-12 right-0 top-14 flex w-[340px] flex-col border-l border-[var(--line)] bg-[rgba(11,13,13,0.88)] px-6 py-6 backdrop-blur-md"
              }
            >
              <div className={narrow ? "" : "min-h-0 flex-1 overflow-y-auto"}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                    {sel.corridor}
                  </p>
                  <h4 className="mt-1 text-base font-medium text-[var(--ink)]">{sel.title}</h4>
                </div>
                <button
                  onClick={closePanel}
                  aria-label="Close corridor detail"
                  className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
                >
                  ×
                </button>
              </div>

              <p
                className="mt-2 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em]"
                style={{ color: sel.id === "usgc" && usgulfLive ? AMBER_CSS : statusColor(sel.kind) }}
              >
                <span aria-hidden className="inline-block h-1 w-1 rounded-full" style={{ background: "currentColor" }} />
                {sel.id === "usgc" && usgulfLive ? "Weekly · live" : sel.status}
              </p>

              <div className="mt-5">
                <p className={`font-mono ${sel.id === "usgc" && usgulfLive ? "text-3xl text-[var(--ink)]" : sel.kind === "reserved" ? "text-xl text-[var(--ink-3)]" : "text-3xl text-[var(--ink)]"}`}>
                  {sel.id === "usgc" && usgulfLive ? usgcOverrideMetric : sel.metric}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  {sel.id === "usgc" && usgulfLive ? usgcOverrideMetricLabel : sel.metricLabel}
                </p>
              </div>

              {(sel.id === "usgc" && usgulfLive ? usgcOverrideRows : sel.rows).length > 0 && (
                <div className="mt-5 flex flex-col gap-3">
                  {(sel.id === "usgc" && usgulfLive ? usgcOverrideRows : sel.rows).map((r) => (
                    <div key={r.k}>
                      <div className="flex items-baseline justify-between">
                        <p className="text-[11px] text-[var(--ink-2)]">{r.k}</p>
                        <p
                          className="font-mono text-[10px] uppercase tracking-[0.15em]"
                          style={{ color: r.warm ? AMBER_CSS : "var(--ink)" }}
                        >
                          {r.v}
                        </p>
                      </div>
                      <div className="mt-[6px] h-px w-full bg-[var(--depth-3)]">
                        <motion.div
                          className="h-px"
                          style={{ background: r.warm ? "#e6bd7d" : AMBER_CSS, opacity: r.warm ? 0.9 : 0.6 }}
                          initial={{ width: 0 }}
                          animate={{ width: `${r.bar * 100}%` }}
                          transition={{ duration: DUR.reveal, delay: 0.15, ease: EASE_OUT as unknown as number[] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {sel.id === "usgc" && usgulfLive ? (
                <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  WEEKLY SERIES · CHART PENDING
                </p>
              ) : sel.spark.length > 0 && (
                <div className="mt-6">
                  <Spark values={sel.spark} id={sel.id} />
                  <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
                    {sel.kind === "demand" ? "Inferred demand pressure · 30d" : "Modeled corridor flow · 30d"}
                  </p>
                </div>
              )}

              <p className="mt-5 text-[11px] leading-relaxed text-[var(--ink-2)]">
                {sel.id === "usgc" && usgulfLive
                  ? "US Gulf export engine. Weekly EIA data — crude exports and Gulf Coast refinery utilization; more corridor metrics onboard as coverage expands."
                  : sel.note}
              </p>
              </div>

              <div className={narrow ? "mt-4" : "mt-4 shrink-0"}>
                {sel.id === "usgc" && usgulfLive ? (
                  <p className="flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                    <span>Corridor feed</span>
                    <span>weekly</span>
                  </p>
                ) : (
                  <p className="flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                    <span>Full corridor view</span>
                    <span>Private beta</span>
                  </p>
                )}
                <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)] opacity-70">
                  {sel.id === "usgc" && usgulfLive
                    ? "Live weekly data · EIA · not investment advice"
                    : "Modeled estimates · illustrative · not investment advice"}
                </p>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* benchmark signal panel */}
        <AnimatePresence>
          {benchSel && (
            <motion.aside
              key={benchSel}
              initial={narrow ? { y: 24, opacity: 0 } : { x: 28, opacity: 0 }}
              animate={narrow ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
              exit={narrow ? { y: 24, opacity: 0 } : { x: 28, opacity: 0 }}
              transition={{ duration: DUR.base * 1.4, ease: EASE_OUT as unknown as number[] }}
              className={
                narrow
                  ? "absolute inset-x-0 bottom-12 border-t border-[var(--line)] bg-[rgba(11,13,13,0.92)] px-5 pb-5 pt-4 backdrop-blur-md"
                  : "absolute bottom-12 right-0 top-14 flex w-[340px] flex-col border-l border-[var(--line)] bg-[rgba(11,13,13,0.88)] px-6 py-6 backdrop-blur-md"
              }
            >
              <div className={narrow ? "" : "min-h-0 flex-1 overflow-y-auto"}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                    Benchmark · {benchSel}
                  </p>
                  <h4 className="mt-1 text-base font-medium text-[var(--ink)]">{BENCH_TITLE[benchSel]}</h4>
                </div>
                <button
                  onClick={closePanel}
                  aria-label="Close benchmark detail"
                  className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
                >
                  ×
                </button>
              </div>

              {benchStatusInfo ? (
                <p
                  className="mt-2 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em]"
                  style={{ color: benchStatusInfo.color }}
                >
                  <span aria-hidden className="inline-block h-1 w-1 rounded-full" style={{ background: "currentColor" }} />
                  {benchStatusInfo.text}
                </p>
              ) : (
                <p className="mt-2 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                  <span aria-hidden className="inline-block h-1 w-1 rounded-full" style={{ background: "currentColor" }} />
                  awaiting feed
                </p>
              )}

              <div className="mt-5">
                <p className={`font-mono ${bq ? "text-3xl text-[var(--ink)]" : "text-xl text-[var(--ink-3)]"}`}>
                  {bq ? formatUsdBbl(bq.price) : "—"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  {bq
                    ? `USD per barrel · ${bq.source} · as of ${formatUtcTime(bq.observedAt)}`
                    : "Feed unavailable — retrying automatically"}
                </p>
              </div>

              {bq?.suspect && (
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: AMBER_CSS }}>
                  SUSPECT — DEVIATES FROM LAST SETTLEMENT
                </p>
              )}

              {benchRows.length > 0 && (
                <div className="mt-5 flex flex-col gap-3">
                  {benchRows.map((r) => (
                    <div key={r.k}>
                      <div className="flex items-baseline justify-between">
                        <p className="text-[11px] text-[var(--ink-2)]">{r.k}</p>
                        <p
                          className="font-mono text-[10px] uppercase tracking-[0.15em]"
                          style={{ color: r.warm ? AMBER_CSS : "var(--ink)" }}
                        >
                          {r.v}
                        </p>
                      </div>
                      <div className="mt-[6px] h-px w-full bg-[var(--depth-3)]">
                        <motion.div
                          className="h-px"
                          style={{ background: r.warm ? "#e6bd7d" : AMBER_CSS, opacity: r.warm ? 0.9 : 0.6 }}
                          initial={{ width: 0 }}
                          animate={{ width: `${r.bar * 100}%` }}
                          transition={{ duration: DUR.reveal, delay: 0.15, ease: EASE_OUT as unknown as number[] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {bs && bs.length >= 2 ? (
                <div className="mt-6">
                  <Spark values={bs.map((p) => p.price)} id={`bench-${benchSel}`} />
                  <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
                    Daily close · 30d · live feed
                  </p>
                </div>
              ) : (
                <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  SERIES UNAVAILABLE
                </p>
              )}

              <p className="mt-5 text-[11px] leading-relaxed text-[var(--ink-2)]">{BENCH_NOTE[benchSel]}</p>
              </div>

              <div className={narrow ? "mt-4" : "mt-4 shrink-0"}>
                <p className="flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  <span>Benchmark feed</span>
                  <span>{bq ? bq.staleness : "offline"}</span>
                </p>
                <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)] opacity-70">
                  Live benchmark data · not investment advice
                </p>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── tiny sparkline ── */
function Spark({ values, id }: { values: number[]; id: string }) {
  const w = 240, h = 36, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = AMBER_CSS;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`ot-spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${pts.join(" ")} ${w - pad},${h - pad}`}
        fill={`url(#ot-spark-${id})`}
      />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.85" />
    </svg>
  );
}
