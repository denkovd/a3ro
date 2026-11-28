/* ────────────────────────────────────────────────────────────────
   Globe 2.0 (roadmap #101): country borders and coastlines, shared by
   every globe. Natural Earth (public domain), baked by
   scripts/bake-borders.mjs.

   Kept cheap enough for phones:
     · 1:110m is embedded (~7k points); 1:50m (~46k) is fetched only
       once someone zooms past DETAIL_ZOOM, and only used when it has
       loaded
     · points are unit vectors computed once; each frame only rotates
     · each line carries a centre and angular radius, so lines wholly
       on the far side are skipped without touching their points
     · one path per layer (borders, coastlines), one stroke each
──────────────────────────────────────────────────────────────── */
import { BORDERS_110_B64 } from "../../../lib/globe/borders110";
import type { Rot } from "./oilTrackerShared";

export const DETAIL_ZOOM = 1.8;
const DETAIL_URL = "/data/borders-50m.bin";

interface Lines {
  /** xyz per point, all lines back to back. */
  xyz: Float32Array;
  /** start index (in points) of each line; last entry = total points. */
  start: Uint32Array;
  /** per line: centre unit vector and cos of its angular radius. */
  centre: Float32Array;
  cosR: Float32Array;
}
export interface BorderSet { borders: Lines; coasts: Lines }

const D2R = Math.PI / 180;
// Same axes as oilTrackerShared.vec, so borders sit exactly on the dots.
function toXyz(lon: number, lat: number, out: Float32Array, i: number) {
  const la = lat * D2R, lo = lon * D2R;
  out[i] = Math.cos(la) * Math.sin(lo);
  out[i + 1] = Math.sin(la);
  out[i + 2] = Math.cos(la) * Math.cos(lo);
}

/** Decodes the baked Int16 format (see scripts/bake-borders.mjs). Exported for tests. */
export function decodeBorders(data: Int16Array): BorderSet {
  const nB = data[0], nC = data[1];
  let p = 2;
  const read = (n: number): Lines => {
    const pts: number[] = [];
    const start = new Uint32Array(n + 1);
    let total = 0;
    for (let l = 0; l < n; l++) {
      start[l] = total;
      const k = data[p++];
      for (let j = 0; j < k; j++) { pts.push(data[p++] / 100, data[p++] / 100); }
      total += k;
    }
    start[n] = total;
    const xyz = new Float32Array(total * 3);
    for (let i = 0; i < total; i++) toXyz(pts[i * 2], pts[i * 2 + 1], xyz, i * 3);
    const centre = new Float32Array(n * 3), cosR = new Float32Array(n);
    for (let l = 0; l < n; l++) {
      let x = 0, y = 0, z = 0;
      for (let i = start[l]; i < start[l + 1]; i++) { x += xyz[i * 3]; y += xyz[i * 3 + 1]; z += xyz[i * 3 + 2]; }
      const len = Math.hypot(x, y, z) || 1;
      x /= len; y /= len; z /= len;
      let minDot = 1;
      for (let i = start[l]; i < start[l + 1]; i++) minDot = Math.min(minDot, x * xyz[i * 3] + y * xyz[i * 3 + 1] + z * xyz[i * 3 + 2]);
      centre[l * 3] = x; centre[l * 3 + 1] = y; centre[l * 3 + 2] = z;
      cosR[l] = minDot;
    }
    return { xyz, start, centre, cosR };
  };
  const borders = read(nB);
  const coasts = read(nC);
  return { borders, coasts };
}

function fromB64(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

let base: BorderSet | null = null;
let detail: BorderSet | null = null;
let detailState: "idle" | "loading" | "ready" | "failed" = "idle";
const waiting = new Set<() => void>();

function loadDetail(onReady: () => void) {
  waiting.add(onReady);
  if (detailState !== "idle") return;
  detailState = "loading";
  fetch(DETAIL_URL)
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
    .then((buf) => { detail = decodeBorders(new Int16Array(buf)); detailState = "ready"; })
    .catch(() => { detailState = "failed"; })
    .finally(() => { for (const f of waiting) f(); waiting.clear(); });
}

export interface BorderStyle { border: string; coast: string; width?: number }

/**
 * Strokes borders and coastlines for the visible side. Call after the
 * land dots and before the data layers. `redraw` is called once the
 * detailed set arrives, for globes that only draw on demand.
 */
export function drawBorders(
  ctx: CanvasRenderingContext2D, rot: Rot, cx: number, cy: number, R: number, zoom: number,
  style: BorderStyle, redraw?: () => void,
) {
  base ??= decodeBorders(fromB64(BORDERS_110_B64));
  let set = base;
  if (zoom >= DETAIL_ZOOM) {
    if (detailState === "ready" && detail) set = detail;
    else if (detailState === "idle") loadDetail(() => redraw?.());
  }
  const o = [0, 0, 0];
  const c = [0, 0, 0];
  const LIMB = 0.04;
  const trace = (L: Lines) => {
    ctx.beginPath();
    const n = L.cosR.length;
    for (let l = 0; l < n; l++) {
      // Skip lines entirely behind the limb: centre's depth below −sin(radius).
      rot(L.centre[l * 3], L.centre[l * 3 + 1], L.centre[l * 3 + 2], c);
      const sinR = Math.sqrt(Math.max(0, 1 - L.cosR[l] * L.cosR[l]));
      if (c[2] < LIMB - sinR) continue;
      let pen = false;
      for (let i = L.start[l]; i < L.start[l + 1]; i++) {
        rot(L.xyz[i * 3], L.xyz[i * 3 + 1], L.xyz[i * 3 + 2], o);
        if (o[2] <= LIMB) { pen = false; continue; }
        const x = cx + o[0] * R, y = cy - o[1] * R;
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      }
    }
  };
  const w = style.width ?? Math.min(1, Math.max(0.6, R / 400));
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
  trace(set.coasts);
  ctx.strokeStyle = style.coast;
  ctx.stroke();
  trace(set.borders);
  ctx.strokeStyle = style.border;
  ctx.stroke();
}
