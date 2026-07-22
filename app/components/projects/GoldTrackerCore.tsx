"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Gold Tracker · full experience
   Route-only: /Projects/Gold-Tracker. Homepage never imports this.
   Same globe substrate as Oil (dots, bake, camera); gold theme;
   holders + mines + metal/paper flows. Phase 0: honest static /
   connecting states — no invented holdings or warehouse figures.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DUR, EASE_OUT } from "../motion";
import {
  GLD,
  GLD_HI,
  GOLD_CSS,
  DOT,
  INK,
  HOME,
  bakeCorridor,
  getDots,
  rotator,
  vec,
  type GTView,
  type Rot,
} from "./goldTrackerShared";
import { FLOW_ROUTES, TERTIARY_PTS, type FlowTier } from "./gold/flowRoutes";
import {
  HOLDERS,
  type Holder,
} from "./gold/holders";
import {
  MINE_REGIONS,
  MINES_SOURCE,
  type MineLayerMode,
  type MineRegion,
} from "./gold/mines";
import {
  useGoldSnapshot,
  formatPrice,
  formatPct,
  formatAsOf,
  GOLD_ACCENT,
} from "./gold/goldData";
import useGoldFlowData, {
  findMetric,
  formatTonnes,
  formatToz,
  formatFlowT,
} from "./gold/useGoldFlowData";

type HitResult =
  | { type: "holder"; h: Holder }
  | { type: "mine"; m: MineRegion }
  | { type: "route"; routeId: string };

type CorridorRank = "major" | "secondary" | "thin" | "tertiary";
type Baked = {
  samples: Float32Array;
  n: number;
  rank: CorridorRank;
  speed: number;
  phase: number;
  routeId?: string;
  name?: string;
};

const TIER_RANK: Record<FlowTier, Exclude<CorridorRank, "tertiary">> = {
  major: "major",
  medium: "secondary",
  thin: "thin",
};
const TIER_SPEED: Record<FlowTier, number> = {
  major: 0.05,
  medium: 0.03,
  thin: 0.02,
};

let BAKED: Baked[] | null = null;
function getCorridors(): Baked[] {
  if (BAKED) return BAKED;
  BAKED = [
    ...FLOW_ROUTES.map((route, i) => ({
      ...bakeCorridor(route.pts),
      rank: TIER_RANK[route.tier],
      speed: TIER_SPEED[route.tier],
      phase: (i * 0.37) % 1,
      routeId: route.id,
      name: route.name,
    })),
    ...TERTIARY_PTS.map((pts) => ({
      ...bakeCorridor(pts),
      rank: "tertiary" as const,
      speed: 0,
      phase: 0,
    })),
  ];
  return BAKED;
}

type Tween = {
  t0: number;
  dur: number;
  from: { lon: number; lat: number; zoom: number; off: number };
  to: { lon: number; lat: number; zoom: number; off: number };
};
type Sim = {
  lon: number;
  lat: number;
  zoom: number;
  off: number;
  vlon: number;
  vlat: number;
  dragging: boolean;
  px: number;
  py: number;
  movedPx: number;
  lastInteract: number;
  tween: Tween | null;
  hovered: string | null;
  pointers: Map<number, { x: number; y: number }>;
  pinchD: number;
  pinchZ: number;
};

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export default function BtcTrackerCore({
  initialView,
  skipIntro = false,
  onExit,
  onReady,
  className = "",
}: {
  initialView?: GTView | null;
  skipIntro?: boolean;
  onExit?: () => void;
  onReady?: () => void;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const priceSnap = useGoldSnapshot();
  const flow = useGoldFlowData();

  const holderLiveStatus = (h: Holder): { status: Holder["status"] | "live"; label: string } => {
    if (h.id === "etf_us") {
      const m = findMetric(flow.metrics, "etf_us", "etf_holdings_t");
      if (m) return { status: "live", label: "live" };
      return { status: "connecting", label: "connecting" };
    }
    if (h.id === "comex") {
      const m = findMetric(flow.metrics, "comex", "comex_registered_toz");
      if (m) return { status: "live", label: "live" };
      return { status: "connecting", label: "connecting" };
    }
    return { status: h.status, label: h.status };
  };

  const holderMetricLines = (h: Holder): { headline: string; rows: { k: string; v: string }[]; asOf?: string } => {
    if (h.id === "etf_us") {
      const hold = findMetric(flow.metrics, "etf_us", "etf_holdings_t");
      const fl = findMetric(flow.metrics, "etf_us", "etf_flow_t");
      if (!hold) {
        return {
          headline: "—",
          rows: [],
        };
      }
      const rows: { k: string; v: string }[] = [
        { k: "NA ETF holdings", v: formatTonnes(hold.value) },
      ];
      if (fl) rows.push({ k: "WoW flow (Δ holdings)", v: formatFlowT(fl.value) });
      const glob = findMetric(flow.metrics, "etf_global", "etf_holdings_t");
      if (glob) rows.push({ k: "Global ETF holdings", v: formatTonnes(glob.value) });
      return { headline: formatTonnes(hold.value), rows, asOf: hold.periodDate };
    }
    if (h.id === "comex") {
      const reg = findMetric(flow.metrics, "comex", "comex_registered_toz");
      const elig = findMetric(flow.metrics, "comex", "comex_eligible_toz");
      const comb = findMetric(flow.metrics, "comex", "comex_combined_toz");
      const dlt = findMetric(flow.metrics, "comex", "comex_registered_delta_toz");
      if (!reg) return { headline: "—", rows: [] };
      const rows: { k: string; v: string }[] = [
        { k: "Registered", v: formatToz(reg.value) },
      ];
      if (elig) rows.push({ k: "Eligible", v: formatToz(elig.value) });
      if (comb) rows.push({ k: "Combined", v: formatToz(comb.value) });
      if (dlt) rows.push({ k: "Registered Δ (vs prev)", v: formatToz(dlt.value) });
      return { headline: formatToz(reg.value), rows, asOf: reg.periodDate };
    }
    return { headline: "—", rows: [] };
  };

  const [selected, setSelected] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const narrowRef = useRef(false);
  narrowRef.current = narrow;
  const [layers, setLayers] = useState<{
    flows: boolean;
    holders: boolean;
    mines: MineLayerMode;
  }>({ flows: true, holders: true, mines: "off" });
  const lastMinesRef = useRef<Exclude<MineLayerMode, "off">>("share");
  const [layersExpanded, setLayersExpanded] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const sim = useRef<Sim>({
    lon: initialView?.lon ?? HOME.lon,
    lat: initialView?.lat ?? HOME.lat,
    zoom: initialView?.zoom ?? 0.95,
    off: 0,
    vlon: 0,
    vlat: 0,
    dragging: false,
    px: 0,
    py: 0,
    movedPx: 0,
    lastInteract: 0,
    tween: null,
    hovered: null,
    pointers: new Map(),
    pinchD: 0,
    pinchZ: 1,
  });
  const size = useRef({ w: 0, h: 0 });
  const introT0 = useRef<number | null>(null);
  const hasMoved = useRef(false);
  const skipIntroRef = useRef(skipIntro);
  const selectedRef = useRef<string | null>(null);
  const reducedRef = useRef(false);
  const layersRef = useRef(layers);
  const hoverPosRef = useRef<HTMLDivElement | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const readyFired = useRef(false);

  reducedRef.current = !!reduced;
  selectedRef.current = selected;
  layersRef.current = layers;

  const tweenTo = useCallback((to: Partial<Tween["to"]>, dur = 1150) => {
    const s = sim.current;
    s.vlon = 0;
    s.vlat = 0;
    s.tween = {
      t0: performance.now(),
      dur: reducedRef.current ? 1 : dur,
      from: { lon: s.lon, lat: s.lat, zoom: s.zoom, off: s.off },
      to: {
        lon: to.lon ?? s.lon,
        lat: to.lat ?? s.lat,
        zoom: to.zoom ?? s.zoom,
        off: to.off ?? s.off,
      },
    };
  }, []);

  const railCamOff = -0.18;

  const focusHolder = useCallback(
    (v: Holder) => {
      setSelected(v.id);
      setTouched(true);
      hasMoved.current = true;
      sim.current.lastInteract = performance.now();
      tweenTo(
        {
          lon: v.lon,
          lat: clamp(v.lat, -48, 48),
          zoom: v.zoom,
          off: narrowRef.current ? 0 : railCamOff,
        },
        1150,
      );
    },
    [tweenTo],
  );

  const focusMine = useCallback(
    (m: MineRegion) => {
      setSelected("mine:" + m.id);
      setTouched(true);
      hasMoved.current = true;
      sim.current.lastInteract = performance.now();
      tweenTo(
        {
          lon: m.lon,
          lat: clamp(m.lat, -48, 48),
          zoom: Math.max(sim.current.zoom, 1.25),
          off: narrowRef.current ? 0 : railCamOff,
        },
        1000,
      );
    },
    [tweenTo],
  );

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
      const wrapW = wrap.getBoundingClientRect().width;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      setNarrow(wrapW < 768);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    ro.observe(wrap);

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

    const hitTest = (mx: number, my: number): HitResult | null => {
      const { s, cx, cy, R } = frame();
      const rot = rotator(s.lon, s.lat);
      const L = layersRef.current;
      let best: HitResult | null = null;
      let bestD = 18;

      if (L.holders) {
        for (const v of HOLDERS) {
          const p = project(rot, vec(v.lon, v.lat), cx, cy, R);
          if (p.z < 0.12) continue;
          const d = Math.hypot(p.x - mx, p.y - my);
          if (d < bestD) {
            bestD = d;
            best = { type: "holder", h: v };
          }
        }
      }
      if (L.mines !== "off") {
        for (const m of MINE_REGIONS) {
                    const p = project(rot, vec(m.lon, m.lat), cx, cy, R);
          if (p.z <= 0.15) continue;
          const d = Math.hypot(p.x - mx, p.y - my);
          if (d < bestD) {
            bestD = d;
            best = { type: "mine", m };
          }
        }
      }
      if (L.flows && best === null) {
        let bestRouteD = 8;
        let bestRouteId: string | null = null;
        for (const c of corridors) {
          if (!c.routeId) continue;
          const S = c.samples,
            N = c.n;
          for (let i = 0; i < N; i += 4) {
            rot(S[i * 3], S[i * 3 + 1], S[i * 3 + 2], o);
            if (o[2] <= 0) continue;
            const sx = cx + o[0] * R,
              sy = cy - o[1] * R;
            const d = Math.hypot(sx - mx, sy - my);
            if (d < bestRouteD) {
              bestRouteD = d;
              bestRouteId = c.routeId;
            }
          }
        }
        if (bestRouteId) best = { type: "route", routeId: bestRouteId };
      }
      return best;
    };

    (canvas as unknown as { __hit?: typeof hitTest }).__hit = hitTest;

    const draw = (now: number) => {
      const { s, w, h, cx, cy, R } = frame();
      const t = now / 1000;

      /* physics */
      if (s.tween) {
        const u = clamp((now - s.tween.t0) / s.tween.dur, 0, 1);
        const e = easeInOut(u);
        const f = s.tween.from,
          to = s.tween.to;
        let dlon = to.lon - f.lon;
        dlon = ((dlon + 540) % 360) - 180;
        s.lon = f.lon + dlon * e;
        s.lat = f.lat + (to.lat - f.lat) * e;
        s.zoom = f.zoom + (to.zoom - f.zoom) * e;
        s.off = f.off + (to.off - f.off) * e;
        if (u >= 1) s.tween = null;
      } else if (!s.dragging && !reducedRef.current) {
        s.lon += s.vlon * 16.7;
        s.lat = clamp(s.lat + s.vlat * 16.7, -72, 72);
        s.vlon *= 0.92;
        s.vlat *= 0.92;
        if (Math.abs(s.vlon) < 1e-5) s.vlon = 0;
        if (Math.abs(s.vlat) < 1e-5) s.vlat = 0;
        if (!hasMoved.current && now - s.lastInteract > 4000) {
          s.lon += 0.012;
        }
      }

      const ramp = (start: number, dur: number) =>
        reducedRef.current
          ? 1
          : introT0.current === null
            ? 0
            : clamp((now - introT0.current - start) / dur, 0, 1);
      const revMajor = easeInOut(ramp(500, 1500));
      const revSec = easeInOut(ramp(1400, 1400));
      const aTert = ramp(2400, 900);
      const labPrim = ramp(1900, 700);
      const labSec = ramp(2800, 700);

      const haloText = (txt: string, x: number, y: number) => {
        ctx.strokeStyle = "rgba(7,8,8,0.85)";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeText(txt, x, y);
        ctx.fillText(txt, x, y);
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = ramp(0, 650);

      const bg = ctx.createRadialGradient(cx, cy + R * 0.15, 0, cx, cy, Math.max(w, h) * 0.8);
      bg.addColorStop(0, "rgba(255,180,100,0.02)");
      bg.addColorStop(1, "rgba(232,235,232,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = INK(0.026);
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1 + i * 0.22), 0, Math.PI * 2);
        ctx.stroke();
      }

      const sph = ctx.createRadialGradient(
        cx - R * 0.35,
        cy - R * 0.4,
        R * 0.1,
        cx,
        cy,
        R * 1.02,
      );
      sph.addColorStop(0, "rgba(255,180,100,0.045)");
      sph.addColorStop(0.6, "rgba(232,235,232,0.012)");
      sph.addColorStop(1, "rgba(232,235,232,0)");
      ctx.fillStyle = sph;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      const rot = rotator(s.lon, s.lat);
      const SEG = 128;
      const circle = (pointAt: (i: number) => [number, number, number]) => {
        for (const pass of [0, 1]) {
          ctx.beginPath();
          let pen = false;
          for (let i = 0; i <= SEG; i++) {
            const v = pointAt(i);
            rot(v[0], v[1], v[2], o);
            if ((pass === 1) !== o[2] > 0) {
              pen = false;
              continue;
            }
            const sx = cx + o[0] * R,
              sy = cy - o[1] * R;
            if (!pen) {
              ctx.moveTo(sx, sy);
              pen = true;
            } else ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = INK(pass ? 0.05 : 0.016);
          ctx.stroke();
        }
      };
      for (let m = -180; m < 180; m += 30)
        circle((i) => vec(m, -90 + (i / SEG) * 180));
      for (let p = -60; p <= 60; p += 30)
        circle((i) => vec(-180 + (i / SEG) * 360, p));

      for (let i = 0; i < dots.length; i += 3) {
        rot(dots[i], dots[i + 1], dots[i + 2], o);
        if (o[2] <= 0.02) continue;
        const sx = cx + o[0] * R,
          sy = cy - o[1] * R;
        const a = 0.18 + 0.6 * Math.pow(o[2], 1.6);
        const ds = (1 + 1.1 * o[2]) * Math.min(1.25, Math.max(0.8, R / 260));
        ctx.fillStyle = DOT(a);
        ctx.fillRect(sx - ds / 2, sy - ds / 2, ds, ds);
      }

      ctx.strokeStyle = INK(0.1);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      const flowsOn = layersRef.current.flows;
      const routeMidpoints: { c: Baked; sx: number; sy: number; z: number }[] = [];
      for (const c of corridors) {
        if (c.rank !== "tertiary" && !flowsOn) continue;
        const S = c.samples,
          N = c.n;
        const rev =
          c.rank === "major" ? revMajor : c.rank === "secondary" || c.rank === "thin" ? revSec : 1;
        const limit = Math.max(2, Math.ceil(N * rev));
        if (rev <= 0.01) continue;
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < limit; i++) {
          rot(S[i * 3], S[i * 3 + 1], S[i * 3 + 2], o);
          if (o[2] <= 0) {
            pen = false;
            continue;
          }
          const sx = cx + o[0] * R,
            sy = cy - o[1] * R;
          if (!pen) {
            ctx.moveTo(sx, sy);
            pen = true;
          } else ctx.lineTo(sx, sy);
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
        const secondary = c.rank === "secondary";
        ctx.strokeStyle = GLD(major ? 0.4 : secondary ? 0.3 : 0.2);
        ctx.lineWidth = major ? 1.8 : secondary ? 1.2 : 0.8;
        ctx.stroke();

        if ((major || secondary) && c.routeId) {
          const mid = Math.floor((N - 1) / 2);
          rot(S[mid * 3], S[mid * 3 + 1], S[mid * 3 + 2], o);
          if (o[2] > 0) {
            routeMidpoints.push({
              c,
              sx: cx + o[0] * R,
              sy: cy - o[1] * R,
              z: o[2],
            });
          }
        }

        if (!reducedRef.current && rev >= 1) {
          const head = (t * c.speed + c.phase) % 1;
          const len = 0.1;
          const passes = major
            ? ([[3.4, GLD(0.12)], [1.6, GLD_HI(0.85)]] as const)
            : secondary
              ? ([[2.6, GLD(0.07)], [1.1, GLD(0.65)]] as const)
              : ([[2.6, GLD(0.07)], [1.1, GLD(0.5)]] as const);
          for (const pass of passes) {
            ctx.beginPath();
            pen = false;
            for (let i = 0; i < N; i++) {
              const u = i / (N - 1);
              const d = head - u;
              if (d < 0 || d > len) {
                pen = false;
                continue;
              }
              rot(S[i * 3], S[i * 3 + 1], S[i * 3 + 2], o);
              if (o[2] <= 0) {
                pen = false;
                continue;
              }
              const sx = cx + o[0] * R,
                sy = cy - o[1] * R;
              if (!pen) {
                ctx.moveTo(sx, sy);
                pen = true;
              } else ctx.lineTo(sx, sy);
            }
            ctx.lineWidth = pass[0];
            ctx.strokeStyle = pass[1];
            ctx.lineCap = "round";
            ctx.stroke();
          }
        }
      }

      ctx.font = '500 8px "JetBrains Mono", ui-monospace, monospace';
      for (const { c, sx, sy, z } of routeMidpoints) {
        if (z <= 0.4 || !c.name) continue;
        const zFade = Math.min(1, (z - 0.4) / 0.3);
        const a = 0.5 * labSec * zFade;
        if (a <= 0.01) continue;
        ctx.fillStyle = INK(a);
        haloText(c.name, sx, sy - 8);
      }

      /* mining overlay */
      const mMode = layersRef.current.mines;
      if (mMode !== "off") {
        const rScale = Math.min(1.25, Math.max(0.8, R / 260));
        const sorted = [...MINE_REGIONS]
          
          .sort((a, b) => b.share - a.share);
        ctx.font = '500 8px "JetBrains Mono", ui-monospace, monospace';
        for (const [rankIdx, m] of sorted.entries()) {
          rot(...vec(m.lon, m.lat), o);
          if (o[2] <= 0.15) continue;
          const sx = cx + o[0] * R,
            sy = cy - o[1] * R;
          const fade = Math.min(1, (o[2] - 0.15) / 0.3);
          const alpha = 0.9 * fade;
          if (alpha <= 0.01) continue;
          const pct = m.share * 100;
          const r = (3 + Math.sqrt(pct) * 1.6) * rScale;
          ctx.strokeStyle = GLD(0.5 * alpha);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = GLD(0.06 * alpha);
          ctx.fill();
          ctx.fillStyle = GLD(0.7 * alpha);
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
          const isSel = selectedRef.current === "mine:" + m.id;
          if (isSel) {
            const b = r + 6;
            ctx.strokeStyle = GLD(0.85 * alpha);
            for (const [dx, dy] of [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ] as const) {
              ctx.beginPath();
              ctx.moveTo(sx + dx * b, sy + dy * b - dy * 5);
              ctx.lineTo(sx + dx * b, sy + dy * b);
              ctx.lineTo(sx + dx * b - dx * 5, sy + dy * b);
              ctx.stroke();
            }
          }
          if (sim.current.hovered === "mine:" + m.id) continue;
          if (rankIdx > 6 && s.zoom < 1.15) continue;
          const label = `${m.name} · ${pct.toFixed(0)}%`;
          ctx.fillStyle = INK(0.75 * fade);
          haloText(label, sx + r + 5, sy + 3);
        }
      }

      /* holders */
      if (layersRef.current.holders) {
        const hotspotFontPx = Math.max(9, Math.min(12, R / 55)).toFixed(0);
        ctx.font = `500 ${hotspotFontPx}px "JetBrains Mono", ui-monospace, monospace`;
        for (const v of HOLDERS) {
          rot(...vec(v.lon, v.lat), o);
          if (o[2] < 0.12) continue;
          const sx = cx + o[0] * R,
            sy = cy - o[1] * R;
          const primary = v.rank === 1;
          const fade =
            Math.min(1, (o[2] - 0.12) / 0.3) * (primary ? labPrim : labSec);
          if (fade <= 0.01) continue;
          const isSel = selectedRef.current === v.id;
          const isHover = s.hovered === v.id;
          const coreA = primary ? 0.95 : 0.55;

          if (v.glyph === "diamond") {
            const r = 5.5;
            ctx.strokeStyle = GLD(0.55 * fade);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, sy - r);
            ctx.lineTo(sx + r, sy);
            ctx.lineTo(sx, sy + r);
            ctx.lineTo(sx - r, sy);
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = GLD(coreA * fade);
            ctx.beginPath();
            ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = GLD(coreA * fade);
            ctx.beginPath();
            ctx.arc(sx, sy, primary ? 2.4 : 1.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = GLD(0.45 * fade);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, sy, primary ? 7 : 5.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (isSel || isHover) {
            const b = 12;
            ctx.strokeStyle = GLD((isSel ? 0.9 : 0.5) * fade);
            ctx.lineWidth = 1;
            for (const [dx, dy] of [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ] as const) {
              ctx.beginPath();
              ctx.moveTo(sx + dx * b, sy + dy * b - dy * 5);
              ctx.lineTo(sx + dx * b, sy + dy * b);
              ctx.lineTo(sx + dx * b - dx * 5, sy + dy * b);
              ctx.stroke();
            }
          }
          if (s.hovered === v.id) continue;
          const side = v.lon < s.lon ? -1 : 1;
          const lx = sx + side * 14,
            ly = sy - 8;
          ctx.textAlign = side < 0 ? "right" : "left";
          ctx.fillStyle = INK(0.85 * fade);
          haloText(v.label, lx, ly);
          const sub =
            v.status === "connecting"
              ? "CONNECTING"
              : v.status === "watchlist"
                ? "WATCHLIST"
                : "REFERENCE";
          ctx.fillStyle = GLD(0.75 * fade);
          haloText(sub, lx, ly + 11);
          ctx.textAlign = "left";
        }
      }

      if (!readyFired.current && ramp(0, 650) > 0.5) {
        readyFired.current = true;
        onReady?.();
      }
    };

    if (introT0.current === null) {
      introT0.current = skipIntroRef.current ? performance.now() - 4000 : performance.now();
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      draw(now);
    };
    if (reducedRef.current) {
      draw(performance.now());
      if (!readyFired.current) {
        readyFired.current = true;
        onReady?.();
      }
    } else {
      raf = requestAnimationFrame(loop);
    }

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0.02 },
    );
    io.observe(wrap);
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      delete (canvas as unknown as { __hit?: unknown }).__hit;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const hoverIdFor = (hit: HitResult): string =>
    hit.type === "holder"
      ? hit.h.id
      : hit.type === "mine"
        ? "mine:" + hit.m.id
        : "route:" + hit.routeId;

  const positionHoverCard = (x: number, y: number) => {
    const el = hoverPosRef.current;
    if (!el) return;
    const { w, h } = size.current;
    const flipX = x > w - 260;
    const flipY = y > h - 180;
    const px = flipX ? x - 14 - 240 : x + 14;
    const py = flipY ? y - 10 - 160 : y + 10;
    el.style.transform = `translate(${px}px, ${py}px)`;
  };

  useEffect(() => {
    if (hoverId) positionHoverCard(lastPointerRef.current.x, lastPointerRef.current.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverId]);

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
    lastPointerRef.current = p;
    if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, p);

    if (s.pointers.size === 2) {
      const [a, b] = Array.from(s.pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (s.pinchD > 0) s.zoom = clamp((s.pinchZ * d) / s.pinchD, 0.85, 2.4);
      s.lastInteract = performance.now();
      return;
    }

    if (s.dragging) {
      const dx = p.x - s.px,
        dy = p.y - s.py;
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
      const hit = (
        canvasRef.current as unknown as {
          __hit?: (x: number, y: number) => HitResult | null;
        }
      )?.__hit?.(p.x, p.y);
      const nextHovered = hit ? hoverIdFor(hit) : null;
      if (s.hovered !== nextHovered) {
        s.hovered = nextHovered;
        setHoverId(nextHovered);
      }
      if (nextHovered) positionHoverCard(p.x, p.y);
      const opensPanel = hit != null && (hit.type === "holder" || hit.type === "mine");
      e.currentTarget.style.cursor = opensPanel ? "pointer" : "grab";
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
      const hit = (
        canvasRef.current as unknown as {
          __hit?: (x: number, y: number) => HitResult | null;
        }
      )?.__hit?.(p.x, p.y);
      if (hit) {
        if (hit.type === "holder") focusHolder(hit.h);
        else if (hit.type === "mine") focusMine(hit.m);
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedRef.current) closePanel();
      else onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel, onExit]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const s = sim.current;
    s.zoom = clamp(s.zoom * (e.deltaY > 0 ? 0.94 : 1.06), 0.85, 2.4);
    s.lastInteract = performance.now();
    hasMoved.current = true;
    setTouched(true);
  };

  const selHolder = HOLDERS.find((v) => v.id === selected) ?? null;
  const selMine = selected?.startsWith("mine:")
    ? MINE_REGIONS.find((m) => m.id === selected.slice(5)) ?? null
    : null;
  const hasFocus = selHolder !== null || selMine !== null;

  const hoverCard = (() => {
    if (!hoverId) return null;
    if (hoverId.startsWith("mine:")) {
      const m = MINE_REGIONS.find((x) => x.id === hoverId.slice(5));
      if (!m) return null;
      return {
        title: m.name,
        lines: [
          `MINE SHARE ~${(m.share * 100).toFixed(0)}% · ${m.asOf}`,
          "STATIC REFERENCE · NOT LIVE",
        ],
        click: true,
      };
    }
    if (hoverId.startsWith("route:")) {
      const route = FLOW_ROUTES.find((r) => r.id === hoverId.slice(6));
      if (!route) return null;
      return {
        title: route.name,
        lines: ["ILLUSTRATIVE LIQUIDITY PATH", "INTENSITY PENDING · FREE FEED"],
        click: false,
      };
    }
    const v = HOLDERS.find((x) => x.id === hoverId);
    if (!v) return null;
    return {
      title: v.title,
      lines: [
        v.status === "connecting" ? "CONNECTING" : "WATCHLIST",
        v.kind.toUpperCase() + " LOCUS",
      ],
      click: true,
    };
  })();

  const statusColor = (s: string) =>
    s === "live" ? GOLD_CSS : s === "connecting" ? "var(--ink-2)" : "var(--ink-3)";

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
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          aria-label="Gold mines, holders, and flow globe"
        />
      </div>

      {/* hover card */}
      <AnimatePresence>
        {hoverCard && (
          <motion.div
            ref={hoverPosRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute left-0 top-0 z-20 w-[240px] rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.92)] px-3 py-2.5 backdrop-blur-md"
            style={{ transform: "translate(0,0)" }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink)]">
              {hoverCard.title}
            </p>
            {hoverCard.lines.map((line) => (
              <p
                key={line}
                className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-3)]"
              >
                {line}
              </p>
            ))}
            {hoverCard.click && (
              <p
                className="mt-2 font-mono text-[8px] uppercase tracking-[0.2em]"
                style={{ color: GOLD_CSS }}
              >
                Click for panel
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* left layers control */}
      <div className="absolute bottom-4 left-4 z-20 md:bottom-6 md:left-6">
        <button
          type="button"
          onClick={() => setLayersExpanded((v) => !v)}
          className="rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.85)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-2)] backdrop-blur-md transition-colors hover:text-[var(--ink)]"
        >
          Layers {layersExpanded ? "▾" : "▸"}
        </button>
        <AnimatePresence>
          {layersExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mt-2 flex w-[200px] flex-col gap-1.5 rounded-sm border border-[var(--line)] bg-[rgba(8,9,9,0.92)] p-3 backdrop-blur-md"
            >
              {(
                [
                  ["flows", "Metal / paper flows", layers.flows],
                  ["holders", "Holders / vaults", layers.holders],
                ] as const
              ).map(([key, label, on]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setLayers((L) => ({
                      ...L,
                      [key]: !L[key],
                    }))
                  }
                  className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-2)]"
                >
                  <span>{label}</span>
                  <span style={{ color: on ? GOLD_CSS : "var(--ink-3)" }}>
                    {on ? "ON" : "OFF"}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setLayers((L) => {
                    if (L.mines !== "off") {
                      lastMinesRef.current = L.mines;
                      return { ...L, mines: "off" };
                    }
                    return { ...L, mines: lastMinesRef.current };
                  })
                }
                className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-2)]"
              >
                <span>Mine regions</span>
                <span
                  style={{
                    color: layers.mines !== "off" ? GOLD_CSS : "var(--ink-3)",
                  }}
                >
                  {layers.mines === "off" ? "OFF" : layers.mines.toUpperCase()}
                </span>
              </button>
              {layers.mines !== "off" && (
                <div className="ml-1 flex gap-2 border-l border-[var(--line)] pl-2">
                  {(["share", "production"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        lastMinesRef.current = mode;
                        setLayers((L) => ({ ...L, mines: mode }));
                      }}
                      className="font-mono text-[8px] uppercase tracking-[0.16em]"
                      style={{
                        color: layers.mines === mode ? GOLD_CSS : "var(--ink-3)",
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* intro hint */}
      {!touched && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)] md:bottom-6">
          Drag to rotate · scroll to zoom · click a holder
        </p>
      )}

      {/* intel rail / focus panel */}
      <aside
        className={`absolute z-20 flex flex-col border border-[var(--line)] bg-[rgba(8,9,9,0.9)] backdrop-blur-md ${
          narrow
            ? "inset-x-3 bottom-14 max-h-[42vh] overflow-y-auto rounded-sm"
            : "bottom-6 right-6 top-4 w-[340px] rounded-sm"
        }`}
      >
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            P·02 — Gold Tracker
          </p>
          <h3 className="mt-1 text-sm font-medium text-[var(--ink)]">
            Mines · holders · flows
          </h3>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
            Where gold is mined, who holds known stock (ETFs, COMEX, vaults, official
            sector), and illustrative metal/paper paths. Holdings and warehouse
            series connect when free feeds are verified — never invented.
          </p>
        </div>

        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
            Spot · XAU
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums text-[var(--ink)]">
            {formatPrice(priceSnap.price.value)}
          </p>
          <p className="mt-1 flex items-baseline justify-between gap-2">
            <span
              className="font-mono text-[10px] tabular-nums"
              style={{
                color:
                  priceSnap.changes.d1 > 0
                    ? GOLD_ACCENT
                    : priceSnap.changes.d1 < 0
                      ? "var(--ink-2)"
                      : "var(--ink-3)",
              }}
            >
              {formatPct(priceSnap.changes.d1)} · 1D
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
              {priceSnap.source === "live" ? "live" : "baseline"} · {formatAsOf(priceSnap.asOf)}
            </span>
          </p>
          <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
            Stock / flow
          </p>
          {(() => {
            const na = findMetric(flow.metrics, "etf_us", "etf_holdings_t");
            const reg = findMetric(flow.metrics, "comex", "comex_registered_toz");
            const fl = findMetric(flow.metrics, "etf_us", "etf_flow_t");
            if (!na && !reg) {
              return (
                <>
                  <p
                    className="mt-1 font-mono text-[12px] uppercase tracking-[0.18em]"
                    style={{ color: GOLD_CSS }}
                  >
                    {flow.status === "loading" ? "CONNECTING" : "PENDING · RUN FLOW CYCLE"}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--ink-3)]">
                    Free COMEX warehouse + WGC ETF feeds land after migrate 018 + gold-flow cycle.
                  </p>
                </>
              );
            }
            return (
              <div className="mt-2 flex flex-col gap-1.5">
                {na && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                      NA ETF
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
                      {formatTonnes(na.value)}
                      {fl ? (
                        <span className="ml-2 text-[var(--ink-3)]">{formatFlowT(fl.value)}</span>
                      ) : null}
                    </span>
                  </div>
                )}
                {reg && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                      COMEX reg
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
                      {formatToz(reg.value)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
            Holder watchlist
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {HOLDERS.map((v) => {
              const live = holderLiveStatus(v);
              return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() =>
                    selected === v.id ? closePanel() : focusHolder(v)
                  }
                  className="flex w-full items-baseline justify-between gap-2 rounded-sm px-1 py-1 text-left transition-colors hover:bg-[var(--depth-2)]"
                  style={{
                    outline:
                      selected === v.id
                        ? `1px solid ${GOLD_CSS}55`
                        : undefined,
                  }}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink)]">
                    {v.name}
                  </span>
                  <span
                    className="shrink-0 font-mono text-[8px] uppercase tracking-[0.16em]"
                    style={{ color: statusColor(live.label) }}
                  >
                    {live.label}
                  </span>
                </button>
              </li>
              );
            })}
          </ul>
        </div>

        {/* focus dock */}
        <AnimatePresence mode="wait">
          {hasFocus && (
            <motion.div
              key={selected ?? "focus"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: DUR.micro, ease: EASE_OUT as unknown as number[] }}
              className="border-t border-[var(--line)] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  {selHolder && (() => {
                    const live = holderLiveStatus(selHolder);
                    const lines = holderMetricLines(selHolder);
                    return (
                    <>
                      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
                        {selHolder.kind} · {selHolder.label}
                      </p>
                      <h4 className="mt-1 text-base font-medium text-[var(--ink)]">
                        {selHolder.title}
                      </h4>
                      <p
                        className="mt-2 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em]"
                        style={{ color: statusColor(live.label) }}
                      >
                        <span
                          aria-hidden
                          className="inline-block h-1 w-1 rounded-full"
                          style={{ background: "currentColor" }}
                        />
                        {live.label}
                        {lines.asOf ? ` · as of ${lines.asOf}` : ""}
                      </p>
                      <p
                        className={`mt-3 font-mono ${
                          lines.headline !== "—" ? "text-2xl text-[var(--ink)]" : "text-lg text-[var(--ink-3)]"
                        }`}
                      >
                        {lines.headline}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                        {lines.rows.length
                          ? selHolder.id === "etf_us"
                            ? "WGC North America gold-ETF holdings"
                            : selHolder.id === "comex"
                              ? "COMEX registered warehouse stock"
                              : "Live metric"
                          : "No live holdings / warehouse figure on file yet"}
                      </p>
                      {lines.rows.length > 0 && (
                        <div className="mt-3 flex flex-col gap-1.5">
                          {lines.rows.map((r) => (
                            <div key={r.k} className="flex items-baseline justify-between gap-2">
                              <span className="text-[11px] text-[var(--ink-2)]">{r.k}</span>
                              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink)]">
                                {r.v}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
                        {selHolder.note}
                      </p>
                    </>
                    );
                  })()}
                  {selMine && (
                    <>
                      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
                        Mine region
                      </p>
                      <h4 className="mt-1 text-base font-medium text-[var(--ink)]">
                        {selMine.name}
                      </h4>
                      <p
                        className="mt-2 font-mono text-[9px] uppercase tracking-[0.22em]"
                        style={{ color: GOLD_CSS }}
                      >
                        Reference · {selMine.asOf}
                      </p>
                      <p className="mt-3 font-mono text-2xl text-[var(--ink)]">
                        ~{(selMine.share * 100).toFixed(0)}%
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                        Estimated mine production share
                      </p>
                      <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
                        Supply-side geography — where gold is mined, not where bars are vaulted.{" "}
                        {MINES_SOURCE}.
                      </p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)] hover:text-[var(--ink)]"
                  aria-label="Close panel"
                >
                  Esc
                </button>
              </div>
              <p className="mt-4 border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                Not investment advice · illustrative until live feeds connect
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}
