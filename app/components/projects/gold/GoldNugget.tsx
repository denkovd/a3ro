"use client";
/* ────────────────────────────────────────────────────────────────
   GoldNugget — wireframe nugget hero (canvas 2D, no WebGL deps)
   An icosahedron subdivided once (42 verts / 120 edges / 80 faces),
   displaced by deterministic noise into an irregular lump.

   Behaviour:
   · slow idle rotation, always
   · pointer-over: sprung tilt toward the cursor, a subset of edges
     brightens, and a soft contour scan sweeps the mesh (the plane
     y = scanY is intersected per face and drawn as a bright ring)
   · scroll parallax feeds a subtle extra pitch via stateRef.par

   Budget: one 2D canvas, DPR ≤ 1.75, ~120 line strokes per frame,
   RAF gated by IntersectionObserver + tab visibility, static single
   frame under prefers-reduced-motion.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef, type MutableRefObject } from "react";
import { useReducedMotion } from "framer-motion";

export type NuggetState = {
  tx: number; // pointer tilt target x, -1..1
  ty: number; // pointer tilt target y, -1..1
  hover: number; // engagement target, 0..1 (drives brighten + scan)
  par: number; // scroll parallax, -1..1
};

/* ── geometry, built once at module scope (deterministic) ── */
type Geo = {
  pos: Float32Array;
  edges: Uint16Array;
  faces: Uint16Array;
  hi: Uint8Array;
  minY: number;
  maxY: number;
};

function buildGeo(): Geo {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const verts = raw.map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  /* one subdivision pass → nugget-grade density, still light */
  const cache = new Map<number, number>();
  const mid = (a: number, b: number) => {
    const key = a < b ? a * 1024 + b : b * 1024 + a;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const va = verts[a], vb = verts[b];
    const m = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
    const l = Math.hypot(m[0], m[1], m[2]);
    verts.push([m[0] / l, m[1] / l, m[2] / l]);
    cache.set(key, verts.length - 1);
    return verts.length - 1;
  };
  faces = faces.flatMap(([a, b, c]) => {
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
  });

  /* displace into an irregular lump — continuous sinusoid field */
  const pos = new Float32Array(verts.length * 3);
  let minY = Infinity, maxY = -Infinity;
  verts.forEach((v, i) => {
    const [x, y, z] = v;
    const bump =
      0.13 * Math.sin(3.1 * x + 1.7) * Math.cos(2.2 * y - 0.6) +
      0.1 * Math.sin(2.7 * z + 0.9) * Math.cos(3.3 * x + 2.1) +
      0.05 * Math.sin(4.6 * y + 3.0) * Math.cos(2.9 * z - 1.2);
    const r = 1 + bump;
    const px = x * r * 1.14, py = y * r * 0.84, pz = z * r * 1.04;
    pos[i * 3] = px;
    pos[i * 3 + 1] = py;
    pos[i * 3 + 2] = pz;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  });

  /* unique edges + a deterministic "bright" subset (~1 in 6) */
  const eset = new Set<number>();
  faces.forEach(([a, b, c]) => {
    ([[a, b], [b, c], [c, a]] as const).forEach(([p, q]) =>
      eset.add(p < q ? p * 1024 + q : q * 1024 + p)
    );
  });
  const edges = new Uint16Array(eset.size * 2);
  let k = 0;
  eset.forEach((key) => {
    edges[k++] = Math.floor(key / 1024);
    edges[k++] = key % 1024;
  });
  const hi = new Uint8Array(eset.size);
  for (let i = 0; i < eset.size; i++) hi[i] = (i * 2654435761) % 6 === 0 ? 1 : 0;

  const f = new Uint16Array(faces.length * 3);
  faces.forEach((fa, i) => {
    f[i * 3] = fa[0];
    f[i * 3 + 1] = fa[1];
    f[i * 3 + 2] = fa[2];
  });
  return { pos, edges, faces: f, hi, minY, maxY };
}
const GEO = buildGeo();

export default function GoldNugget({
  stateRef,
  className = "",
}: {
  stateRef: MutableRefObject<NuggetState>;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.75);

    let w = 0, h = 0, raf = 0;
    let inView = true, visible = true, running = false;

    /* eased state */
    let cTx = 0, cTy = 0, cHover = 0, cPar = 0;
    let yaw = 0.7, scan = 0.15;
    let last = performance.now();

    const N = GEO.pos.length / 3;
    const rz = new Float32Array(N);
    const sx = new Float32Array(N);
    const sy = new Float32Array(N);

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * DPR));
      canvas.height = Math.max(1, Math.round(h * DPR));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const st = stateRef.current;
      cTx += (st.tx - cTx) * 0.055;
      cTy += (st.ty - cTy) * 0.055;
      cHover += (st.hover - cHover) * 0.04;
      cPar += (st.par - cPar) * 0.06;
      if (!reduced) {
        yaw += dt * (0.16 + cHover * 0.05);
        if (cHover > 0.02) scan = (scan + dt * 0.32) % 1;
      }

      /* orientation: idle yaw + breathing pitch + pointer/scroll tilt */
      const wob = reduced ? 0 : Math.sin(now * 0.00042) * 0.035;
      const cy = Math.cos(yaw + cTx * 0.24);
      const sy2 = Math.sin(yaw + cTx * 0.24);
      const pitch = -0.44 + wob + cTy * 0.17 + cPar * 0.2;
      const cx = Math.cos(pitch), sx2 = Math.sin(pitch);
      const roll = cTx * 0.07;
      const cr = Math.cos(roll), sr = Math.sin(roll);

      const R = Math.min(w, h) * 0.335;
      const CX = w * 0.5;
      const CY = h * 0.565;
      const PERSP = 3.4;

      for (let i = 0; i < N; i++) {
        const x0 = GEO.pos[i * 3], y0 = GEO.pos[i * 3 + 1], z0 = GEO.pos[i * 3 + 2];
        const x1 = cy * x0 + sy2 * z0;
        const z1 = -sy2 * x0 + cy * z0;
        const y2 = cx * y0 - sx2 * z1;
        const z2 = sx2 * y0 + cx * z1;
        const x3 = cr * x1 - sr * y2;
        const y3 = sr * x1 + cr * y2;
        rz[i] = z2;
        const s = PERSP / (PERSP - z2);
        sx[i] = CX + x3 * R * s;
        sy[i] = CY - y3 * R * s;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      /* scan plane, in model space */
      const span = GEO.maxY - GEO.minY + 0.24;
      const scanY = GEO.minY - 0.12 + span * scan;
      const band = 0.2;

      /* wireframe edges */
      const EC = GEO.edges.length / 2;
      for (let e = 0; e < EC; e++) {
        const a = GEO.edges[e * 2], b = GEO.edges[e * 2 + 1];
        const front = Math.min(1, Math.max(0, ((rz[a] + rz[b]) * 0.5 + 1.25) / 2.5));
        let alpha = 0.05 + front * 0.24;
        let bright = 0;
        if (GEO.hi[e]) {
          alpha += cHover * (0.08 + front * 0.24);
          bright = cHover * front;
        }
        if (cHover > 0.02) {
          const dm =
            (GEO.pos[a * 3 + 1] + GEO.pos[b * 3 + 1]) * 0.5 - scanY;
          const g = Math.exp(-(dm * dm) / (band * band)) * cHover;
          alpha += g * 0.28;
          if (g > bright) bright = g;
        }
        ctx.strokeStyle =
          bright > 0.4
            ? `rgba(240,219,159,${alpha.toFixed(3)})`
            : `rgba(216,192,134,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(sx[a], sy[a]);
        ctx.lineTo(sx[b], sy[b]);
        ctx.stroke();
      }

      /* contour scan ring — plane ∩ mesh, soft double stroke */
      if (cHover > 0.03) {
        const FC = GEO.faces.length / 3;
        for (let fi = 0; fi < FC; fi++) {
          const ia = GEO.faces[fi * 3], ib = GEO.faces[fi * 3 + 1], ic = GEO.faces[fi * 3 + 2];
          const tri = [ia, ib, ic];
          let hitX0 = 0, hitY0 = 0, hitZ0 = 0, hitX1 = 0, hitY1 = 0, hitZ1 = 0;
          let hits = 0;
          for (let k2 = 0; k2 < 3 && hits < 2; k2++) {
            const p = tri[k2], q = tri[(k2 + 1) % 3];
            const ya = GEO.pos[p * 3 + 1], yb = GEO.pos[q * 3 + 1];
            if ((ya - scanY) * (yb - scanY) < 0) {
              const tt = (scanY - ya) / (yb - ya);
              const mx = GEO.pos[p * 3] + (GEO.pos[q * 3] - GEO.pos[p * 3]) * tt;
              const mz = GEO.pos[p * 3 + 2] + (GEO.pos[q * 3 + 2] - GEO.pos[p * 3 + 2]) * tt;
              /* same rotation as the mesh */
              const x1 = cy * mx + sy2 * mz;
              const z1 = -sy2 * mx + cy * mz;
              const y2 = cx * scanY - sx2 * z1;
              const z2 = sx2 * scanY + cx * z1;
              const x3 = cr * x1 - sr * y2;
              const y3 = sr * x1 + cr * y2;
              const s = PERSP / (PERSP - z2);
              if (hits === 0) {
                hitX0 = CX + x3 * R * s; hitY0 = CY - y3 * R * s; hitZ0 = z2;
              } else {
                hitX1 = CX + x3 * R * s; hitY1 = CY - y3 * R * s; hitZ1 = z2;
              }
              hits++;
            }
          }
          if (hits === 2) {
            const front = Math.min(1, Math.max(0, ((hitZ0 + hitZ1) * 0.5 + 1.25) / 2.5));
            const a2 = cHover * (0.08 + front * 0.5);
            ctx.strokeStyle = `rgba(244,226,170,${(a2 * 0.32).toFixed(3)})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(hitX0, hitY0);
            ctx.lineTo(hitX1, hitY1);
            ctx.stroke();
            ctx.strokeStyle = `rgba(246,231,180,${a2.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(hitX0, hitY0);
            ctx.lineTo(hitX1, hitY1);
            ctx.stroke();
          }
        }
        ctx.lineWidth = 1;
      }
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const sync = () => {
      const should = inView && visible && !reduced;
      if (should && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        sync();
      },
      { rootMargin: "10%" }
    );
    io.observe(wrap);

    const onVis = () => {
      visible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVis);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(performance.now());
    });
    ro.observe(wrap);

    resize();
    if (reduced) {
      draw(performance.now()); // one static frame
    } else {
      sync();
    }

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced, stateRef]);

  return (
    <div ref={wrapRef} aria-hidden className={`pointer-events-none ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
