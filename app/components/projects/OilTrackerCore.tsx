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
  HOME, TERTIARY_PTS,
  bakeCorridor, getDots, rotator, vec,
  type OTView, type Rot,
} from "./oilTrackerShared";
import { FLOW_ROUTES, GATE_EIA_EST_MBD, type FlowTier } from "./flowRoutes";
import useOilData from "./useOilData";
import { formatPctSigned, formatUsdBbl, formatUtcDateTime, formatUtcTime, isUtcToday } from "./oilFormat";
import type { Benchmark, CorridorId, CorridorMetricLatest, DailyPrice, LatestQuote } from "@a3ro/oil-backend";

/* ══ route-only content: hotspot hierarchy + signal copy ══ */
type HotspotKind = "live" | "demand" | "watch" | "reserved";
type Hotspot = {
  id: string; label: string; side?: -1 | 1; glyph?: "ring" | "diamond";
  lon: number; lat: number; kind: HotspotKind; zoom: number;
  corridor: string; title: string; status: string;
};

const HOTSPOTS: Hotspot[] = [
  {
    id: "hormuz", label: "HORMUZ", side: -1,
    glyph: "ring", lon: 56.5, lat: 26.6, kind: "live", zoom: 1.5,
    corridor: "Corridor 01", title: "Strait of Hormuz", status: "Connecting",
  },
  {
    id: "china", label: "CHINA · DEMAND",
    glyph: "diamond", lon: 122.2, lat: 29.9, kind: "demand", zoom: 1.32,
    corridor: "Demand · 01", title: "China · East Coast", status: "Watchlist",
  },
  {
    id: "sg", label: "SINGAPORE STRAIT",
    glyph: "ring", lon: 104.2, lat: 1.1, kind: "watch", zoom: 1.45,
    corridor: "Corridor 02", title: "Singapore Strait", status: "Connecting",
  },
  {
    id: "ara", label: "ARA · ROTTERDAM",
    glyph: "ring", lon: 4.3, lat: 51.9, kind: "watch", zoom: 1.45,
    corridor: "Corridor 03", title: "ARA · Rotterdam", status: "Watchlist",
  },
  {
    id: "usgc", label: "US GULF",
    glyph: "ring", lon: -94.5, lat: 28.6, kind: "reserved", zoom: 1.2,
    corridor: "Corridor 04", title: "US Gulf Exports", status: "Connecting",
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

const TICKS: { label: string; lon: number; lat: number; gate?: CorridorId }[] = [
  { label: "BAB EL-MANDEB", lon: 43.4, lat: 12.6, gate: "bab_el_mandeb" },
  { label: "SUEZ", lon: 32.4, lat: 30.0, gate: "suez" },
  { label: "CAPE", lon: 19, lat: -35, gate: "cape" },
  { label: "PANAMA", lon: -79.5, lat: 9, gate: "panama" },
];

type CorridorRank = "major" | "secondary" | "thin" | "tertiary";
type Baked = {
  samples: Float32Array; n: number; rank: CorridorRank; speed: number; phase: number;
  routeId?: string; name?: string; gates?: CorridorId[];
};

/* tier → rank + base pulse speed (Section C1/C3) */
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
      gates: route.gates,
    })),
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

/* ══ live-corridor signal panel — declarative content mechanism ══
   ONE builder replaces the former one-off usgc/usgulf override: any
   hotspot whose corridor has live metrics gets its signal-panel
   content from here; hotspots with no live coverage yet (null
   return) fall back to their modeled HOTSPOTS content unchanged. */
type LiveRow = { k: string; v: string; bar: number; warm?: boolean };
type CorridorPanelContent = {
  statusText: string; // e.g. "Weekly · live"
  railText: string; // e.g. "Weekly"
  metric: string;
  metricLabel: string;
  rows: LiveRow[];
  seriesNote: string; // replaces the spark block
  note: string;
  footerRight: string; // right side of "Corridor feed" row
  footerLine: string; // fine-print line
};

function buildCorridorPanel(
  hotspotId: string,
  metrics: CorridorMetricLatest[],
): CorridorPanelContent | null {
  if (hotspotId === "usgc") {
    const usgulfMetrics = metrics.filter((m) => m.corridor === "usgulf");
    const exports = usgulfMetrics.find((m) => m.metric === "crude_exports");
    const util = usgulfMetrics.find((m) => m.metric === "refinery_utilization");
    if (!exports && !util) return null;

    const metric = exports
      ? `${exports.value.toFixed(2)} Mb/d`
      : util
        ? `${util.value.toFixed(1)}%`
        : "";
    const metricLabel = exports
      ? `US crude exports · weekly EIA · as of ${exports.periodDate}`
      : util
        ? `PADD 3 refinery utilization · weekly EIA · as of ${util.periodDate}`
        : "";
    const rows: LiveRow[] = [];
    if (exports) {
      rows.push({
        k: "US crude exports",
        v: `${exports.value.toFixed(2)} Mb/d`,
        bar: clamp(exports.value / 6, 0, 1),
      });
    }
    if (util) {
      rows.push({
        k: "Refinery utilization · PADD 3",
        v: `${util.value.toFixed(1)}%`,
        bar: clamp(util.value / 100, 0, 1),
        warm: util.value >= 95,
      });
    }

    return {
      statusText: "Weekly · live",
      railText: "Weekly",
      metric,
      metricLabel,
      rows,
      seriesNote: "WEEKLY SERIES · CHART PENDING",
      note:
        "US Gulf export engine. Weekly EIA data — crude exports and Gulf Coast refinery utilization; more corridor metrics onboard as coverage expands.",
      footerRight: "weekly",
      footerLine: "Live weekly data · EIA · not investment advice",
    };
  }

  if (hotspotId === "hormuz" || hotspotId === "sg") {
    const corridor = hotspotId === "hormuz" ? "hormuz" : "singapore";
    const corridorMetrics = metrics.filter((m) => m.corridor === corridor);
    const transits7d = corridorMetrics.find((m) => m.metric === "tanker_transits_7d");
    if (!transits7d) return null;
    const volume7d = corridorMetrics.find((m) => m.metric === "tanker_volume_7d");

    // Bar divisors are display scalers only (not physical limits) —
    // chosen so typical values land mid-gauge for each corridor.
    const transitsDivisor = hotspotId === "hormuz" ? 40 : 90;
    const volumeDivisor = hotspotId === "hormuz" ? 3 : 5;

    const rows: LiveRow[] = [
      {
        k: "Tanker transits · 7d avg",
        v: `${transits7d.value.toFixed(1)} /day`,
        bar: clamp(transits7d.value / transitsDivisor, 0, 1),
      },
    ];
    if (volume7d) {
      rows.push({
        k: "Tanker volume · 7d avg",
        v: `${volume7d.value.toFixed(2)} Mt/d`,
        bar: clamp(volume7d.value / volumeDivisor, 0, 1),
      });
    }

    const metricLabel =
      hotspotId === "hormuz"
        ? `Tanker transits · 7-day avg · IMF PortWatch · as of ${transits7d.periodDate}`
        : `Tanker transits · 7-day avg · via Malacca Strait · as of ${transits7d.periodDate}`;
    const note =
      hotspotId === "hormuz"
        ? "Live satellite AIS via IMF PortWatch (UN Global Platform; ~4-day lag, weekly publication). Regional GPS jamming and AIS spoofing can depress counts — read trends, not levels."
        : "Malacca Strait tanker transits via IMF PortWatch satellite AIS — the primary gate for the Singapore corridor (~4-day lag, weekly publication).";

    return {
      statusText: "Satellite · weekly",
      railText: "Satellite",
      metric: `${transits7d.value.toFixed(1)} /day`,
      metricLabel,
      rows,
      seriesNote: "SATELLITE SERIES · CHART PENDING",
      note,
      footerRight: "satellite",
      footerLine: "Live AIS data · IMF PortWatch · not investment advice",
    };
  }

  return null;
}

/* ══ pro-tier locked rows + watchlist copy — no fabricated data behind
   any of this; PRO_LOCKS names commercial detail we don't hold, and
   WATCHLIST_COPY explains exactly why a corridor has no live feed. ══ */
type LockedRow = { k: string; context: string };
const PRO_LOCKS: Record<string, LockedRow[]> = {
  hormuz: [{ k: "Vessel-level transit detail", context: "hormuz-vessel-detail" }],
  sg: [{ k: "Vessel-level transit detail", context: "singapore-vessel-detail" }],
  china: [
    { k: "Live import tracking · seaborne AIS", context: "china-imports" },
    { k: "Stockpile build estimates", context: "china-stockpiles" },
  ],
  ara: [
    { k: "ARA product inventories · weekly", context: "ara-inventories" },
    { k: "Refined product tightness", context: "ara-tightness" },
  ],
  usgc: [],
};
const WATCHLIST_COPY: Record<string, string> = {
  china: "No live feed connected. Free sources cover monthly customs data only; near-real-time import tracking runs on commercial satellite AIS.",
  ara: "No live feed connected. Weekly ARA product inventories are commercial data; crack-spread signals arrive free in a later phase.",
};

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
  const [proContact, setProContact] = useState<string | null>(null);

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
  const proContactRef = useRef<string | null>(null);
  const reducedRef = useRef(false);
  reducedRef.current = !!reduced;
  selectedRef.current = selected;
  proContactRef.current = proContact;

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
    setProContact(null);
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
    setProContact(null);
    setTouched(true);
    sim.current.lastInteract = performance.now();
    const isNarrow = size.current.w < 640;
    tweenTo({ off: isNarrow ? 0 : -0.14 }, 900);
  }, [tweenTo]);

  const closePanel = useCallback(() => {
    setSelected(null);
    setProContact(null);
    sim.current.lastInteract = performance.now();
    tweenTo({ zoom: 1, off: 0, lat: clamp(sim.current.lat, -34, 34) }, 900);
  }, [tweenTo]);

  /* ── data-driven globe sub-labels ──
     Stable-identity ref so the engine effect's [] deps stay valid;
     this effect just repopulates its contents whenever corridor data
     changes. No modeled/fabricated text — "CONNECTING" / "WATCHLIST"
     when a corridor has no live datapoint yet. live=true only when a
     real feed value backs the sub (amber in the canvas draw); false
     for the neutral CONNECTING/WATCHLIST placeholders. */
  const hotspotSubsRef = useRef<Record<string, { text: string; live: boolean }>>({});
  /* per-route pulse-speed multiplier (Section C3): live tanker_volume_7d
     at a route's gates vs. the EIA H1'25 estimate for that gate. Stable
     ref identity so the engine effect's [] deps stay valid — this effect
     just repopulates contents whenever corridor data changes. */
  const gateActivityRef = useRef<Record<string, number>>({});
  /* per-gate tick-label live suffix, e.g. " · 12/D" (Section C5). */
  const gateSubsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const metrics = feed.corridors ?? [];
    const find = (corridor: string, metric: string) =>
      metrics.find((m) => m.corridor === corridor && m.metric === metric);

    const hormuzTransits = find("hormuz", "tanker_transits_7d");
    const sgTransits = find("singapore", "tanker_transits_7d");
    const usgcExports = find("usgulf", "crude_exports");

    hotspotSubsRef.current = {
      hormuz: hormuzTransits
        ? { text: `TANKERS ${hormuzTransits.value.toFixed(1)}/D · 7D`, live: true }
        : { text: "CONNECTING", live: false },
      sg: sgTransits
        ? { text: `TANKERS ${sgTransits.value.toFixed(1)}/D · 7D`, live: true }
        : { text: "CONNECTING", live: false },
      usgc: usgcExports
        ? { text: `EXPORTS ${usgcExports.value.toFixed(2)} MB/D`, live: true }
        : { text: "CONNECTING", live: false },
      china: { text: "WATCHLIST", live: false },
      ara: { text: "WATCHLIST", live: false },
    };

    // gate tick suffixes: live tanker_transits_7d per gate, "/D" formatted.
    const gateIds: CorridorId[] = ["hormuz", "singapore", "suez", "bab_el_mandeb", "cape", "panama"];
    const nextGateSubs: Record<string, string> = {};
    for (const gid of gateIds) {
      const v = find(gid, "tanker_transits_7d");
      nextGateSubs[gid] = v ? ` · ${v.value.toFixed(0)}/D` : "";
    }
    gateSubsRef.current = nextGateSubs;

    // per-route activity factor: avg over the route's gates of
    // (live tanker_volume_7d Mt/d ÷ (EIA est. Mb/d × 0.136)) — 0.136 Mt/d
    // ≈ 1 Mb/d of crude (density conversion), clamped to [0.35, 2].
    // Routes with no gates, or no live data at any gate, default to 1.
    const nextActivity: Record<string, number> = {};
    for (const route of FLOW_ROUTES) {
      if (route.gates.length === 0) {
        nextActivity[route.id] = 1;
        continue;
      }
      const ratios: number[] = [];
      for (const gate of route.gates) {
        const est = GATE_EIA_EST_MBD[gate];
        const vol7d = find(gate, "tanker_volume_7d");
        if (!est || !vol7d) continue;
        ratios.push(vol7d.value / (est * 0.136));
      }
      nextActivity[route.id] = ratios.length > 0
        ? clamp(ratios.reduce((a, b) => a + b, 0) / ratios.length, 0.35, 2)
        : 1;
    }
    gateActivityRef.current = nextActivity;
  }, [feed.corridors]);

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
      /* legibility halo for small canvas text (hotspot/route/tick labels) —
         a dark stroke behind the fill so text stays readable over land
         dots, corridor strokes, and the sphere sheen. fillStyle is set by
         the caller before invoking this, as today. */
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
        const a = 0.18 + 0.6 * Math.pow(o[2], 1.6);
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

      /* corridors — ranked hierarchy with intro draw-in
         widths/alphas (Section C2): major 1.8/0.4, secondary 1.2/0.22,
         thin 0.8/0.14, tertiary unchanged (dashed). major uses revMajor,
         secondary+thin use revSec (as-is). */
      const routeMidpoints: { c: Baked; sx: number; sy: number; z: number }[] = [];
      for (const c of corridors) {
        const S = c.samples, N = c.n;
        const rev = c.rank === "major" ? revMajor : c.rank === "secondary" || c.rank === "thin" ? revSec : 1;
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
        const secondary = c.rank === "secondary";
        ctx.strokeStyle = AMB(major ? 0.4 : secondary ? 0.22 : 0.14);
        ctx.lineWidth = major ? 1.8 : secondary ? 1.2 : 0.8;
        ctx.stroke();

        // route label anchor: middle sample point, captured regardless of
        // reveal progress so C4 can gate on its own label ramps.
        if ((major || secondary) && c.routeId) {
          const mid = Math.floor((N - 1) / 2);
          rot(S[mid * 3], S[mid * 3 + 1], S[mid * 3 + 2], o);
          if (o[2] > 0) {
            routeMidpoints.push({ c, sx: cx + o[0] * R, sy: cy - o[1] * R, z: o[2] });
          }
        }

        if (!reducedRef.current && rev >= 1) {
          // per-route speed = base × activity factor (Section C3); the
          // ref is read fresh each frame, stable identity so the engine
          // effect's [] deps stay valid.
          const activity = c.routeId ? gateActivityRef.current[c.routeId] ?? 1 : 1;
          const head = (t * c.speed * activity + c.phase) % 1;
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

      /* route labels (Section C4) — major+secondary only, thin skipped
         to declutter. Drawn after corridor strokes, before ticks. */
      ctx.font = '500 8px "JetBrains Mono", ui-monospace, monospace';
      for (const { c, sx, sy, z } of routeMidpoints) {
        if (z <= 0.4 || !c.name) continue;
        const zFade = Math.min(1, (z - 0.4) / 0.3);
        const a = 0.5 * labSec * zFade;
        if (a <= 0.01) continue;
        ctx.fillStyle = INK(a);
        haloText(c.name, sx, sy - 8);
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
        const liveSuffix = tk.gate ? gateSubsRef.current[tk.gate] ?? "" : "";
        haloText(`${tk.label}${liveSuffix}`, sx + 6, sy + 2.5);
      }

      /* hotspots — title font scales with globe radius R (Section C6),
         computed once per frame before the loop. */
      const hotspotFontPx = Math.max(9, Math.min(12, R / 55)).toFixed(0);
      ctx.font = `500 ${hotspotFontPx}px "JetBrains Mono", ui-monospace, monospace`;
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
        const lx = sx + side * 14, ly = sy - 10;
        ctx.textAlign = side < 0 ? "right" : "left";
        ctx.strokeStyle = INK(0.22 * fade);
        ctx.beginPath();
        ctx.moveTo(sx + side * 4, sy - 4);
        ctx.lineTo(lx - side * 3, ly + 3);
        ctx.stroke();
        ctx.fillStyle = INK((isSel || isHover ? 0.9 : primary ? 0.85 : 0.55) * fade);
        haloText(hs.label, lx, ly);
        const sub = hotspotSubsRef.current[hs.id];
        if (primary && sub) {
          // amber only when a real feed value backs this sub (Section C7);
          // the neutral CONNECTING/WATCHLIST placeholders stay ink.
          ctx.fillStyle = sub.live ? AMB(0.8 * fade) : INK(0.55 * fade);
          haloText(sub.text, lx, ly + 11);
        } else if (isHover && !isSel) {
          ctx.fillStyle = INK(0.45 * fade);
          haloText(sub?.text ?? "OPEN", lx, ly + 11);
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

  /* esc: contact panel first, then corridor/benchmark panel, then hand
     control back to the route */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (proContactRef.current) setProContact(null);
      else if (selectedRef.current) closePanel();
      else onExit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closePanel]);

  const sel = HOTSPOTS.find((h) => h.id === selected) ?? null;
  /* Only an actual live override (amber, applied at the call site when
     selLive/hLive is present) earns amber. Kind alone no longer implies
     "live" — hormuz/china are just as un-connected as any other corridor
     until real data lands, so the kind-based fallback is neutral ink. */
  const statusColor = (k: HotspotKind) => (k === "reserved" ? "var(--ink-3)" : "var(--ink-2)");

  const quoteFor = (b: Benchmark): LatestQuote | undefined =>
    feed.quotes?.find((q) => q.benchmark === b);

  /* Kind-aware status: a settlement must NEVER show "Live" or the amber
     color — only actual live/delayed market prints earn that label, and
     only while fresh. Once a live/delayed print ages past "aging" it
     reads as "Last trade" rather than falsely implying it's still live. */
  const benchStatus = (q: LatestQuote | undefined): { text: string; color: string } => {
    if (!q) return { text: "—", color: "var(--ink-3)" };
    if (q.kind === "live" || q.kind === "delayed") {
      switch (q.staleness) {
        case "fresh": return { text: "Live", color: AMBER_CSS };
        case "aging": return { text: "Live", color: "var(--ink-2)" };
        case "stale":
        case "dead": return { text: "Last trade", color: "var(--ink-3)" };
      }
    }
    // settlement | historical
    switch (q.staleness) {
      case "fresh":
      case "aging": return { text: "Settled", color: "var(--ink-2)" };
      case "stale":
      case "dead": return { text: "Settled", color: "var(--ink-3)" };
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

  /* ── live corridor panel content — declarative, per hotspot ──
     buildCorridorPanel returns null when a hotspot has no live
     coverage yet, in which case the signal panel below falls back to
     an honest "connecting" (live-capable, no data yet) or
     "watchlist" (no live source at all) state — never modeled data. */
  const liveFor = (hid: string) => buildCorridorPanel(hid, feed.corridors ?? []);
  const selLive = sel ? liveFor(sel.id) : null;
  const LIVE_CAPABLE = new Set(["hormuz", "sg", "usgc"]);
  const selIsWatchlist = !!sel && !selLive && WATCHLIST_COPY[sel.id] !== undefined;
  const selIsConnecting = !!sel && !selLive && LIVE_CAPABLE.has(sel.id);
  const selLocks = sel ? PRO_LOCKS[sel.id] ?? [] : [];

  /* Section C9: the wide-screen corridor index rail hides while ANY
     right panel (corridor, benchmark, or pro-contact) is open — it
     would otherwise sit underneath/behind the panel on wide screens. */
  const panelOpen = sel !== null || benchSel !== null || proContact !== null;

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
              Benchmark prices and covered corridors stream live.
              Locked signals unlock with the pro tier.
            </p>
          )}
        </div>

        {/* corridor index */}
        {!narrow && (
          <AnimatePresence>
            {!panelOpen && (
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: DUR.base, ease: EASE_OUT as unknown as number[] }}
                className="absolute right-6 top-[4.5rem] hidden flex-col items-stretch md:right-10 md:top-[5.5rem] md:flex"
              >
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
                {HOTSPOTS.map((h) => {
                  const hLive = liveFor(h.id);
                  return (
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
                        style={{ color: hLive ? AMBER_CSS : statusColor(h.kind) }}
                      >
                        {hLive ? hLive.railText : h.status}
                      </span>
                    </button>
                  );
                })}
                <p className="border-l border-[var(--line)] px-3 py-[7px] font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  + corridors onboarding · pro feeds on request
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* live benchmark ticker */}
        <div className="pointer-events-none absolute bottom-16 left-6 flex gap-7 md:left-10 md:gap-10">
          {TRACKED.map((b) => {
            const q = quoteFor(b);
            const isLiveKind = q?.kind === "live" || q?.kind === "delayed";
            const dotColor: string | null = !q
              ? null
              : isLiveKind && q.staleness === "fresh"
                ? AMBER_CSS
                : (isLiveKind && q.staleness === "aging") ||
                    (!isLiveKind && (q.staleness === "fresh" || q.staleness === "aging"))
                  ? "var(--ink-2)"
                  : "var(--ink-3)";
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
                ? (() => {
                    const newest = feed.quotes.reduce(
                      (latest, q) => (q.observedAt > latest ? q.observedAt : latest),
                      feed.quotes[0].observedAt,
                    );
                    return isUtcToday(newest) ? formatUtcTime(newest) : formatUtcDateTime(newest);
                  })()
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
              <div className={narrow ? "" : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden"}>
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
                style={{
                  color: selLive
                    ? AMBER_CSS
                    : selIsWatchlist
                      ? "var(--ink-3)"
                      : selIsConnecting
                        ? "var(--ink-2)"
                        : statusColor(sel.kind),
                }}
              >
                <span aria-hidden className="inline-block h-1 w-1 rounded-full" style={{ background: "currentColor" }} />
                {selLive ? selLive.statusText : sel.status}
              </p>

              <div className="mt-5">
                <p className={`font-mono ${selLive ? "text-3xl text-[var(--ink)]" : "text-xl text-[var(--ink-3)]"}`}>
                  {selLive ? selLive.metric : "—"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  {selLive
                    ? selLive.metricLabel
                    : selIsWatchlist
                      ? "No live feed connected"
                      : "Feed connecting — retrying automatically"}
                </p>
              </div>

              {(selLive ? selLive.rows.length > 0 : selLocks.length > 0) && (
                <div className="mt-5 flex flex-col gap-3">
                  {selLive?.rows.map((r) => (
                    <div key={r.k}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-[11px] text-[var(--ink-2)]">{r.k}</p>
                        <p
                          className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.15em]"
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
                  {selLocks.map((r) => (
                    <button
                      key={r.k}
                      type="button"
                      onClick={() => setProContact(r.context)}
                      aria-label={`Unlock ${r.k} — contact for pro access`}
                      className="text-left"
                    >
                      <div className="flex items-baseline justify-between">
                        <p className="text-[11px] text-[var(--ink-2)]">{r.k}</p>
                        <p
                          className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em]"
                          style={{ color: AMBER_CSS, opacity: 0.85 }}
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                            <rect x="2" y="4.5" width="6" height="4.5" rx="0.6" stroke="currentColor" strokeWidth="0.9" />
                            <path d="M3.3 4.5V3.2a1.7 1.7 0 0 1 3.4 0V4.5" stroke="currentColor" strokeWidth="0.9" />
                          </svg>
                          PRO
                        </p>
                      </div>
                      <div className="mt-[6px] h-px w-full bg-[var(--line)]" />
                    </button>
                  ))}
                </div>
              )}

              {selLive && (
                <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  {selLive.seriesNote}
                </p>
              )}

              <p className="mt-5 text-[11px] leading-relaxed text-[var(--ink-2)]">
                {selLive
                  ? selLive.note
                  : selIsWatchlist
                    ? WATCHLIST_COPY[sel.id]
                    : "This corridor is wired to a live source; data appears after the next ingestion cycle."}
              </p>
              </div>

              <div className={narrow ? "mt-4" : "mt-4 shrink-0"}>
                {selLive ? (
                  <p className="flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                    <span>Corridor feed</span>
                    <span>{selLive.footerRight}</span>
                  </p>
                ) : (
                  <p className="flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                    <span>Corridor feed</span>
                    <span>{selIsWatchlist ? "watchlist" : "connecting"}</span>
                  </p>
                )}
                <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)] opacity-70">
                  {selLive
                    ? selLive.footerLine
                    : selIsWatchlist
                      ? "Watchlist · no live data · not investment advice"
                      : "Awaiting live data · not investment advice"}
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
              <div className={narrow ? "" : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden"}>
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
                    ? `USD per barrel · ${bq.source} · as of ${
                        isUtcToday(bq.observedAt) ? formatUtcTime(bq.observedAt) : formatUtcDateTime(bq.observedAt)
                      }`
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
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-[11px] text-[var(--ink-2)]">{r.k}</p>
                        <p
                          className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.15em]"
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

        {/* pro contact / lead-capture panel */}
        <AnimatePresence>
          {proContact !== null && (
            <motion.aside
              key="pro-contact"
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
              <ProContactPanel context={proContact} narrow={narrow} onClose={() => setProContact(null)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── pro tier lead-capture panel ──
   Contact form only — no commercial data is faked to fill the panel
   while we wait on a real feed. POSTs to /api/leads (backend/leadRepo);
   states are local (idle/sending/ok/error), never fabricated. */
function ProContactPanel({
  context,
  narrow,
  onClose,
}: {
  context: string;
  narrow: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // honeypot — real users never see/fill this
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, context, company }),
      });
      if (!res.ok) throw new Error("bad status");
      setState("ok");
    } catch {
      setState("error");
    }
  };

  return (
    <>
      <div className={narrow ? "" : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden"}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              A3RO · Pro tier
            </p>
            <h4 className="mt-1 text-base font-medium text-[var(--ink)]">Commercial data, on request</h4>
          </div>
          <button
            onClick={onClose}
            aria-label="Close contact panel"
            className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-[var(--ink-2)]">
          This signal runs on commercial data — satellite cargo tracking, terminal inventories, vendor feeds. We
          onboard pro feeds per request. Leave an email and we&apos;ll come back with access options.
        </p>

        {state === "ok" ? (
          <div className="mt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--ink)]">
              RECEIVED — WE&apos;LL BE IN TOUCH.
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
              Or write to us directly:{" "}
              <a href="mailto:a3ro.helpdesk@gmail.com" style={{ color: AMBER_CSS }}>
                a3ro.helpdesk@gmail.com
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="pro-contact-email" className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                Email
              </label>
              <input
                id="pro-contact-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full border border-[var(--line)] bg-transparent px-3 py-2 font-mono text-[11px] text-[var(--ink)] outline-none transition-colors duration-[var(--dur-micro)] focus:border-[var(--line-2)]"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="pro-contact-message" className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                Message · optional
              </label>
              <textarea
                id="pro-contact-message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-2 w-full resize-none border border-[var(--line)] bg-transparent px-3 py-2 font-mono text-[11px] text-[var(--ink)] outline-none transition-colors duration-[var(--dur-micro)] focus:border-[var(--line-2)]"
                placeholder="What you need access to…"
              />
            </div>

            {/* honeypot — hidden from real users, left unstyled visually so
                bots filling every field still trip it */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={{ position: "absolute", left: "-9999px" }}
              aria-hidden="true"
            />

            {state === "error" && (
              <p className="font-mono text-[10px] text-[var(--ink-2)]">
                Something went wrong — email us at{" "}
                <a href="mailto:a3ro.helpdesk@gmail.com" style={{ color: AMBER_CSS }}>
                  a3ro.helpdesk@gmail.com
                </a>
              </p>
            )}

            <button
              type="submit"
              disabled={state === "sending"}
              className="border border-[var(--line-2)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink)] transition-colors duration-[var(--dur-micro)] hover:bg-[var(--ink)] hover:text-[var(--depth-1)] disabled:opacity-50"
            >
              {state === "sending" ? "Sending…" : "Request access"}
            </button>
          </form>
        )}
      </div>

      <div className={narrow ? "mt-4" : "mt-4 shrink-0"}>
        <p className="flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          <span>Pro tier</span>
          <span>lead capture</span>
        </p>
        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--ink-3)] opacity-70">
          No fabricated data · commercial access on request
        </p>
      </div>
    </>
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
