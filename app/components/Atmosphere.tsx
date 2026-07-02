"use client";
/* ────────────────────────────────────────────────────────────────
   Atmosphere — fixed background environment, three layers:
   1. Depth gradient (CSS) that slowly shifts with scroll
   2. Canvas dust field: two parallax planes of drifting particles
   3. Film grain (CSS, see globals.css)

   Budget: one 2D canvas, DPR-capped at 1.5, ≤90 particles desktop /
   ≤42 mobile, paused off-tab, disabled for reduced motion.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

type Mote = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  layer: number; // 0 = far, 1 = near
  tw: number; // twinkle phase
  acid: boolean; // rare accent mote
};

export default function Atmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const COUNT = isMobile ? 42 : 90;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

    let w = 0;
    let h = 0;
    let motes: Mote[] = [];
    let raf = 0;
    let scrollY = 0;
    let running = true;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    const seed = () => {
      motes = Array.from({ length: COUNT }, () => {
        const layer = Math.random() < 0.6 ? 0 : 1;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: layer === 0 ? 0.6 + Math.random() * 0.7 : 1.0 + Math.random() * 1.3,
          vx: (Math.random() - 0.5) * (layer === 0 ? 0.06 : 0.14),
          vy: -(0.02 + Math.random() * (layer === 0 ? 0.05 : 0.12)),
          layer,
          tw: Math.random() * Math.PI * 2,
          acid: layer === 1 && Math.random() < 0.05, // ~2 accent motes
        };
      });
    };

    const onScroll = () => {
      scrollY = window.scrollY;
    };

    /* Pointer parallax targets — the dust field leans away from
       the cursor; eased toward target each frame */
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const onPointer = (e: PointerEvent) => {
      tx = e.clientX / w - 0.5;
      ty = e.clientY / h - 0.5;
    };

    let t = 0;
    const frame = () => {
      if (!running) return;
      t += 0.016;
      // ease pointer offset toward target (believable inertia)
      cx += (tx - cx) * 0.04;
      cy += (ty - cy) * 0.04;
      ctx.clearRect(0, 0, w, h);

      for (const m of motes) {
        m.x += m.vx;
        m.y += m.vy;
        // wrap
        if (m.y < -4) m.y = h + 4;
        if (m.x < -4) m.x = w + 4;
        if (m.x > w + 4) m.x = -4;

        // parallax: scroll + pointer, scaled by depth layer
        const par = m.layer === 0 ? 0.03 : 0.08;
        const px = m.layer === 0 ? -10 : -26;
        const x = m.x + cx * px;
        const y =
          ((((m.y - scrollY * par + cy * px * 0.6) % (h + 8)) + h + 8) %
            (h + 8)) -
          4;

        const alpha =
          (m.layer === 0 ? 0.16 : 0.3) *
          (0.7 + 0.3 * Math.sin(t * 0.7 + m.tw));
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = m.acid
          ? `rgba(184, 230, 45, ${(alpha * 0.9).toFixed(3)})`
          : `rgba(203, 212, 200, ${alpha.toFixed(3)})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) raf = requestAnimationFrame(frame);
      else cancelAnimationFrame(raf);
    };

    resize();
    seed();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return (
    <div aria-hidden className="fixed inset-0 z-0 pointer-events-none">
      {/* Layer 1 — depth gradient: a faint horizon that anchors the space */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% -10%, #101312 0%, var(--depth-0) 55%), radial-gradient(80% 50% at 50% 110%, #0c0f0e 0%, transparent 60%)",
        }}
      />
      {/* Layer 2 — dust field */}
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Layer 3 — vignette to pull focus centre-frame */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 90% at 50% 50%, transparent 60%, rgba(0,0,0,0.35) 100%)",
        }}
      />
    </div>
  );
}
