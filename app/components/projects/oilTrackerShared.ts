/* ────────────────────────────────────────────────────────────────
   Oil Tracker — shared data + math
   Small, dependency-free module imported by BOTH the lightweight
   homepage teaser and the heavy fullscreen experience. Keep this
   file lean: the landing page bundle includes it.

   Land dots: Natural Earth 110m sampled at build time into a 1.5°
   bitmask, distributed on a Fibonacci sphere at draw-density n.
──────────────────────────────────────────────────────────────── */

export const OT_ROUTE = "/Projects/Oil-Tracker";
export const OT_SESSION = "a3ro-ot-view";

export type OTView = { lon: number; lat: number; zoom: number };

/* Opening composition — Hormuz and China share the frame. */
export const HOME = { lon: 88, lat: 20 };

/* ── palette: ink neutrals + one disciplined amber ── */
export const INK = (a: number) => `rgba(232,235,232,${a})`;
export const DOT = (a: number) => `rgba(201,210,204,${a})`;
export const AMB = (a: number) => `rgba(212,161,87,${a})`; // core amber #d4a157
export const AMB_HI = (a: number) => `rgba(232,190,120,${a})`; // tracer head only
export const AMBER_CSS = "#d4a157";

/* ── flow-health diverging scale (colour-blind-safe: red → amber → teal) ──
   Turns a corridor's "vs 1-year norm" ratio (current ÷ norm) into colour.
   Neutral band 0.85–1.15 stays amber so ordinary week-to-week wobble
   doesn't flash colour; below → reds (not flowing), above → teals (flowing
   above norm). Red↔teal (NOT red↔green) so it survives the common
   red-green colour-vision deficiencies. Returns an rgba() string and takes
   an alpha, matching AMB/INK so the canvas draw loop can reuse it.

   This is the visual layer of the Flow Stress score: the ratio here is the
   same "vs norm" input that feeds the composite. */
type RGB = [number, number, number];
const HEALTH_RED: RGB = [199, 62, 58]; //  #c73e3a — well below norm
const HEALTH_AMBER: RGB = [212, 161, 87]; // #d4a157 — neutral (== AMBER_CSS)
const HEALTH_TEAL: RGB = [46, 160, 144]; //  #2ea090 — well above norm
const HEALTH_LOW = 0.85; //  neutral band lower edge
const HEALTH_HIGH = 1.15; // neutral band upper edge
const HEALTH_RED_FLOOR = 0.5; // ratio ≤ this ⇒ full red
const HEALTH_TEAL_CEIL = 1.5; // ratio ≥ this ⇒ full teal

function healthLerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function flowHealthRgb(ratio: number): RGB {
  if (!Number.isFinite(ratio)) return HEALTH_AMBER;
  if (ratio >= HEALTH_LOW && ratio <= HEALTH_HIGH) return HEALTH_AMBER;
  if (ratio < HEALTH_LOW) {
    const t = (HEALTH_LOW - Math.max(ratio, HEALTH_RED_FLOOR)) / (HEALTH_LOW - HEALTH_RED_FLOOR);
    return healthLerp(HEALTH_AMBER, HEALTH_RED, t);
  }
  const t = (Math.min(ratio, HEALTH_TEAL_CEIL) - HEALTH_HIGH) / (HEALTH_TEAL_CEIL - HEALTH_HIGH);
  return healthLerp(HEALTH_AMBER, HEALTH_TEAL, t);
}

export function flowHealth(ratio: number, a = 1): string {
  const [r, g, b] = flowHealthRgb(ratio);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

/** Bucket for legend / accessibility text. */
export function flowHealthBucket(ratio: number): "low" | "neutral" | "high" {
  if (!Number.isFinite(ratio)) return "neutral";
  return ratio < HEALTH_LOW ? "low" : ratio > HEALTH_HIGH ? "high" : "neutral";
}

/* ── geometry ── */
export const D2R = Math.PI / 180;

export const vec = (lon: number, lat: number): [number, number, number] => {
  const p = lat * D2R, l = lon * D2R;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
};

export function slerp(a: number[], b: number[], t: number, out: number[]) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  d = Math.min(1, Math.max(-1, d));
  const w = Math.acos(d), sw = Math.sin(w);
  if (sw < 1e-6) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return; }
  const s0 = Math.sin((1 - t) * w) / sw, s1 = Math.sin(t * w) / sw;
  out[0] = s0 * a[0] + s1 * b[0];
  out[1] = s0 * a[1] + s1 * b[1];
  out[2] = s0 * a[2] + s1 * b[2];
}

/* view rotation: brings (viewLon, viewLat) to screen center-front */
export type Rot = (x: number, y: number, z: number, out: number[]) => void;
export function rotator(viewLon: number, viewLat: number): Rot {
  const a = -viewLon * D2R, b = viewLat * D2R;
  const sa = Math.sin(a), ca = Math.cos(a), sb = Math.sin(b), cb = Math.cos(b);
  return (x, y, z, out) => {
    const x1 = ca * x + sa * z;
    const z1 = -sa * x + ca * z;
    out[0] = x1;
    out[1] = y * cb - z1 * sb;
    out[2] = y * sb + z1 * cb;
  };
}

/* ── ranked corridor waypoints (over water) ── */
export const MAJOR_PTS: [number, number][] = [
  [56.5, 26.6], [64, 22.5], [80.4, 5.6], [104.2, 1.1], [110.5, 8.5], [119.5, 22.0], [122.2, 29.9],
];
export const SECONDARY_PTS: [number, number][] = [
  [56.5, 26.6], [58.8, 24.0], [51, 12.4], [43.4, 12.6], [38.5, 21.5], [32.4, 30.0], [23.5, 34.0],
  [14.5, 36.8], [-6.2, 35.8], [-9.8, 37.0], [-10.2, 43.5], [-5.6, 48.7], [1.5, 50.4], [4.3, 51.9],
];
export const TERTIARY_PTS: [number, number][][] = [
  [[-94.5, 28.6], [-80.2, 25.0], [-40, 38], [-8, 48.5], [4.3, 51.9]],
  [[4, 3.2], [-8, 4.2], [-17.3, 12], [-17, 20.5], [-12.5, 29], [-6.2, 35.8]],
];

/* sample a waypoint chain into sphere-hugging arc points */
export function bakeCorridor(pts: [number, number][]): { samples: Float32Array; n: number } {
  const vs = pts.map((p) => vec(p[0], p[1]));
  const legs: number[] = [];
  let total = 0;
  for (let i = 0; i < vs.length - 1; i++) {
    const d = Math.acos(Math.min(1,
      vs[i][0] * vs[i + 1][0] + vs[i][1] * vs[i + 1][1] + vs[i][2] * vs[i + 1][2]));
    legs.push(d);
    total += d;
  }
  const n = Math.max(48, Math.round(total * 120));
  const samples = new Float32Array(n * 3);
  const tmp = [0, 0, 0];
  for (let s = 0; s < n; s++) {
    const t = s / (n - 1);
    let target = t * total, i = 0;
    while (i < legs.length - 1 && target > legs[i]) { target -= legs[i]; i++; }
    slerp(vs[i], vs[i + 1], legs[i] === 0 ? 0 : target / legs[i], tmp);
    const h = 1 + 0.045 * Math.sin(Math.PI * t); // hug the sphere — sea lane
    samples[s * 3] = tmp[0] * h;
    samples[s * 3 + 1] = tmp[1] * h;
    samples[s * 3 + 2] = tmp[2] * h;
  }
  return { samples, n };
}

/* the two primary marks the teaser is allowed to show */
export const PRIMARY_MARKS = [
  { label: "HORMUZ", sub: "EST. THROUGHPUT 80%", lon: 56.5, lat: 26.6, side: -1 as const, glyph: "ring" as const },
  { label: "CHINA · DEMAND", sub: "WILDCARD", lon: 122.2, lat: 29.9, side: 1 as const, glyph: "diamond" as const },
];

/* ── land dot builder (cached per density) ── */
const COLS = 240, ROWS = 120, STEP = 1.5;
const dotCache = new Map<number, Float32Array>();

export function getDots(n: number): Float32Array {
  const hit = dotCache.get(n);
  if (hit) return hit;
  const bin = atob(MASK_B64);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  const isLand = (lon: number, lat: number) => {
    const r = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / STEP)));
    const c = Math.min(COLS - 1, Math.max(0, Math.floor((lon + 180) / STEP)));
    const idx = r * COLS + c;
    return !!(raw[idx >> 3] & (1 << (idx & 7)));
  };
  const GA = Math.PI * (3 - Math.sqrt(5));
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(1 - y * y);
    const th = i * GA;
    const x = rr * Math.cos(th), z = rr * Math.sin(th);
    const lat = Math.asin(y) / D2R, lon = Math.atan2(x, z) / D2R;
    if (isLand(lon, lat)) pts.push(x, y, z);
  }
  const out = new Float32Array(pts);
  dotCache.set(n, out);
  return out;
}

/* ── embedded land bitmask — 240×120 @1.5°, row-major N→S ── */
const MASK_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPj/z////3EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/++f///w8AAPADgAEAAOADAAAAAAAAAAAAAAAg3N4f/v///wcAAB8AAAAAAAA4AAAAAAAAAAAAAAADAOAH/P///wcAAA4AAAAAAAAwAAAAAAAAAAAAAAC8cQwBAP///wcAAAAAAIAHAMD/DwDwAAAAAAAAAOAAAAAAAPz//wMAAAAAAGAAAPz/AQAAAAAAAAAAAOBdc/MDAPj//wEAAAAAABjAwP///z9gAAAAA4AAAED8A/P/AOD//////////zjg/v///z//HwAAAPj/A0/8X4PwB/D//wAAAOA/AADh/v///////wM+/P///////////////////wMAnBMgAgAAAAAAAAAAyP///////////////////wEAOAAAAQAAAAAAAAAA5////////////////////8CBBwAAAAAAAAAAAAAAAOD//////88GH8AfAAwAwJ////////////////9/APz//////wNxDIAPAAAA8M///////////////98/APzf/////wHwAwAGAAAA+M///////////////+ADAPAB+P///wHwMwAAAAAA8A//////////////ZBgAAIACgP///wPgfwAAAAAQAAf///////////8fAA4AACAAAP///z/gfwAAAAAwYMf///////////8PAB8AAAQAAP7////5/wMAAABoQOj///////////8DAA8AAAAAgPz////5/wcAAADs+P////////////9/AAcAAAAAAPj////7/wMAAADg+f////////////9/AAEAAAAAAPj/////zwAAAAAw/v////////////+/AAAAAAAAAPD/////Gw4AAACg//////////////8fAAAAAAAAAOD/////HxAAAADA//////////////8fAAAAAAAAAOD//////wAAAACA//9P/vj///////8PAAAAAAAAAOD/////EwAAAACA//wHfPz////////HAAAAAAAAAOD/////AQAAAAD8g/EH8Pj////////gAAAAAAAAAOD/////AAAAAAD8Aebn+fH//////z8AAAAAAAAAAOD///9/AAAAAAD8AGT8//H//////xpgAAAAAAAAAMD///8/AAAAAAD8AMT8//H/////fzggAAAAAAAAAID///8fAAAAAABwdAD8/////////zE4AAAAAAAAAID///8fAAAAAACwfwBD/////////zA/AAAAAAAAAAD+//8PAAAAAAD4fwAA/////////wAHAAAAAAAAAAD8//8DAAAAAAD8/2OA/////////4EAAAAAAAAAAADo//8DAAAAAAD8/+///////////wEAAAAAAAAAAADo/wkCAAAAAAD+//////z//////wEAAAAAAAAAAADYfwACAAAAAID///8///n//////wEAAAAAAAAAAACgfwAWAAAAAMD///9//+H//////wAAAAAAAAAAAAAgfwAAAAAAAMD///9//jPg////fwAAAAAAAAAAAAAAfgAAAAAAAOD//////H/A////PwEAAAAAAAAAAAAAfAAIAAAAAOD//////f/A/+f/BwAAAAAAAAAAAAAAfDBwAAAAAOD/////+X8A/sN/AAAAAAAAAAAAAAAA+DgAAwAAAOD/////+T8A/oB/AwAAAAAAAAAAAAAA4B8AAAAAAOD/////8x8AfoB/AAMAAAAAAAAAAAAAgPwAAAAAAOD/////8wcAPoD+AAEAAAAAAAAAAAAAAPgBAAAAAOD/////7wEAHAD+AQEAAAAAAAAAAAAAAMAAAAAAAOD/////PwAAHAD8AQQAAAAAAAAAAAAAAICAAgAAAMD/////HwMAGADgAAoAAAAAAAAAAAAAAADBfgAAAID//////wMAGABAAAAAAAAAAAAAAAAAAADy/wAAAID//////wEAIAAGAAwAAAAAAAAAAAAAAADw/wEAAAD//////wEAIAAIAAgAAAAAAAAAAAAAAADw/x8AAAD8+P///wAAAAAZYAAAAAAAAAAAAAAAAADg/z8AAAAAwP///wAAAAAbMAAAAAAAAAAAAAAAAADw/z8AAAAAwP//fwAAAAAWfAAAAAAAAAAAAAAAAAD4/38AAAAAwP//HwAAAAAcficAAAAAAAAAAAAAAAD8//8BAAAAwP//DwAAAAAYPiABAAAAAAAAAAAAAAD8//8DAAAAwP//BwAAAAA4vgEaAAAAAAAAAAAAAAD8//8/AAAAgP//BwAAAABwEBL+AAAAAAAAAAAAAAD8////AAAAAP//AwAAAABgAADwAQAAAAAAAAAAAAD8////AQAAAP//AwAAAADABADyAwEAAAAAAAAAAAD4////AQAAAP7/AwAAAAAAHADwBgQAAAAAAAAAAADw////AAAAAP7/BwAAAAAAAAQADAAAAAAAAAAAAADw//9/AAAAAP7/BwAAAAAAAAAAAAAAAAAAAAAAAADg//9/AAAAAP7/BwAAAAAAAICHAAAAAAAAAAAAAADg//8/AAAAAP//BwEAAAAAANDHAAAAAAAAAAAAAADA//8/AAAAAP//hwMAAAAAAPjHAQAAAAAAAAAAAAAA//8/AAAAAP//4QEAAAAAAPzfAQAAAAAAAAAAAAAA/v8/AAAAAP//4AEAAAAAAP7/AwAAAAAAAAAAAAAA/v8fAAAAAP5/wAAAAAAAgP//ByAAAAAAAAAAAAAA/v8fAAAAAP7/4AAAAAAA4P//D0AAAAAAAAAAAAAA/v8HAAAAAPz/4AAAAAAA8P//HwAAAAAAAAAAAAAA/v8AAAAAAPx/YAAAAAAA8P//PwAAAAAAAAAAAAAA/v8AAAAAAPw/AAAAAAAA8P//PwAAAAAAAAAAAAAA/v8AAAAAAPw/AAAAAAAA8P//PwAAAAAAAAAAAAAA/38AAAAAAPgfAAAAAAAA4P//PwAAAAAAAAAAAAAA/z8AAAAAAPAPAAAAAAAA4P//PwAAAAAAAAAAAAAA/x8AAAAAAPAHAAAAAAAA4B/+PwAAAAAAAAAAAAAA/w8AAAAAAPABAAAAAAAA4Af0HwAAAAAAAAAAAAAA/wMAAAAAAAAAAAAAAAAAAADwDwAIAAAAAAAAAACA/wMAAAAAAAAAAAAAAAAAAADgDwAQAAAAAAAAAACA/wEAAAAAAAAAAAAAAAAAAADAAgBwAAAAAAAAAACAfwAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAACAHwAAAAAAAAAAAAAAAAAAAAAABgAQAAAAAAAAAACAHwAAAAAAAAAAAAAAAAAAAAAABgAMAAAAAAAAAADADwAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAADABwAAAAAAAAAAAAAAAAAAAAAAAIADAAAAAAAAAADADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAgwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAADwAAAR4Pv4HAAAAAAAAAAAAAAAACAAAAAAAAAAA4P8/4P//////BwAAAAAAAAAAAAAAPwAAAAAAAADg//8//P///////wMAAAAAAAAAAACAewAAAADI/v////8///////////8BAAAAAAAAABAAeAAAAID///////////////////8DAAAAAAAe4P//fwAAAMD//////////////////38AAADA////////BwAAAPz//////////////////x8AAEDz//////8/AAAA8P///////////////////x8AABj///////8PAIAH/////////////////////38AAADA//////8/gPAD4P///////////////////wcAAAD+////////P4Dx/////////////////////w8AAAD8//////////////////////////////////8AAPz/AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
