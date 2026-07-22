"use client";
/* ────────────────────────────────────────────────────────────────
   Gold Tracker — lightweight teaser globe
   Landing-safe: low detail, no interaction, gold theme.
   Heavy engine lives in GoldTrackerCore (route-only).
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, type MutableRefObject } from "react";
import { useReducedMotion } from "framer-motion";
import {
  GLD,
  GLD_HI,
  DOT,
  INK,
  HOME,
  bakeCorridor,
  getDots,
  rotator,
  vec,
  type GTView,
} from "./goldTrackerShared";
import { FLOW_ROUTES } from "./gold/flowRoutes";
import { PRIMARY_HOLDERS } from "./gold/holders";

const MAJOR = FLOW_ROUTES.find((r) => r.id === "etf_comex")!;

let ARTERY: { samples: Float32Array; n: number } | null = null;

export default function GoldTrackerPreview({
  className = "",
  labels = true,
  initialView,
  viewRef,
}: {
  className?: string;
  labels?: boolean;
  initialView?: GTView | null;
  viewRef?: MutableRefObject<GTView | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const reducedRef = useRef(false);
  reducedRef.current = !!reduced;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wrap = canvas.parentElement as HTMLElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dots = getDots(9000);
    if (!ARTERY) ARTERY = bakeCorridor(MAJOR.pts);
    const artery = ARTERY;
    const o = [0, 0, 0];

    const lat = initialView?.lat ?? HOME.lat;
    let phase = 0;
    if (initialView) {
      const dv = Math.max(-1, Math.min(1, (initialView.lon - HOME.lon) / 24));
      phase = Math.asin(dv);
    }

    let raf = 0;
    let visible = true;
    let t0 = performance.now();
    let dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const size = { w: 0, h: 0 };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      size.w = r.width;
      size.h = r.height;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reducedRef.current) draw(performance.now());
    });
    ro.observe(wrap);

    const draw = (now: number) => {
      const el = now - t0;
      const lon = reducedRef.current
        ? HOME.lon
        : HOME.lon + 24 * Math.sin(el * 0.00008 + phase);
      if (viewRef) viewRef.current = { lon, lat, zoom: 1 };

      const { w, h } = size;
      const cx = w * 0.5,
        cy = h * 0.53;
      const R = Math.min(w * 0.42, h * 0.44);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = reducedRef.current ? 1 : Math.min(1, el / 650);

      const sph = ctx.createRadialGradient(
        cx - R * 0.35,
        cy - R * 0.4,
        R * 0.1,
        cx,
        cy,
        R * 1.02,
      );
      sph.addColorStop(0, "rgba(255,180,100,0.04)");
      sph.addColorStop(0.6, "rgba(232,235,232,0.012)");
      sph.addColorStop(1, "rgba(232,235,232,0)");
      ctx.fillStyle = sph;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      const rot = rotator(lon, lat);
      const SEG = 96;
      ctx.strokeStyle = INK(0.04);
      ctx.lineWidth = 1;
      const circle = (pointAt: (i: number) => [number, number, number]) => {
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i <= SEG; i++) {
          const v = pointAt(i);
          rot(v[0], v[1], v[2], o);
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
        ctx.stroke();
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
        const a = 0.15 + 0.6 * Math.pow(o[2], 1.6);
        const ds = (1.1 + 1.2 * o[2]) * Math.min(1.25, Math.max(0.85, R / 260));
        ctx.fillStyle = DOT(a);
        ctx.fillRect(sx - ds / 2, sy - ds / 2, ds, ds);
      }

      ctx.strokeStyle = INK(0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      const S = artery.samples,
        N = artery.n;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < N; i++) {
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
      ctx.strokeStyle = GLD(0.4);
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (!reducedRef.current) {
        const head = ((now / 1000) * 0.05) % 1;
        const len = 0.1;
        for (const pass of [
          [3.4, GLD(0.12)],
          [1.6, GLD_HI(0.85)],
        ] as const) {
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

      if (labels) {
        ctx.font = '500 9px "JetBrains Mono", ui-monospace, monospace';
        const marks = PRIMARY_HOLDERS.map((v, i) => ({
          label: v.label,
          sub:
            v.status === "connecting"
              ? "CONNECTING"
              : v.status === "watchlist"
                ? "WATCHLIST"
                : "REFERENCE",
          lon: v.lon,
          lat: v.lat,
          side: (i % 2 === 0 ? -1 : 1) as -1 | 1,
          glyph: v.glyph,
        }));
        for (const m of marks) {
          rot(...vec(m.lon, m.lat), o);
          if (o[2] < 0.12) continue;
          const sx = cx + o[0] * R,
            sy = cy - o[1] * R;
          const fade = Math.min(1, (o[2] - 0.12) / 0.3);
          if (m.glyph === "diamond") {
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
            ctx.fillStyle = GLD(0.95 * fade);
            ctx.beginPath();
            ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = GLD(0.95 * fade);
            ctx.beginPath();
            ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = GLD(0.42 * fade);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, sy, 6.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (!reducedRef.current) {
            const pt = ((now / 1000) * 0.4 + (m.lon + 180) / 360) % 1;
            ctx.strokeStyle = GLD(0.3 * (1 - pt) * fade);
            ctx.beginPath();
            ctx.arc(sx, sy, 7 + pt * 16, 0, Math.PI * 2);
            ctx.stroke();
          }
          const lx = sx + m.side * 12,
            ly = sy - 10;
          ctx.textAlign = m.side < 0 ? "right" : "left";
          ctx.strokeStyle = INK(0.22 * fade);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx + m.side * 4, sy - 4);
          ctx.lineTo(lx - m.side * 3, ly + 3);
          ctx.stroke();
          ctx.fillStyle = INK(0.85 * fade);
          ctx.fillText(m.label, lx, ly);
          ctx.fillStyle = GLD(0.8 * fade);
          ctx.fillText(m.sub, lx, ly + 11);
          ctx.textAlign = "left";
        }
      }
    };

    if (reducedRef.current) {
      draw(performance.now());
    } else {
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (!visible) return;
        draw(now);
      };
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}
