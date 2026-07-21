/* ────────────────────────────────────────────────────────────────
   BTC Tracker — theme + route constants
   Reuses globe geometry from oilTrackerShared (land dots, bake,
   rotator). Palette is orange — not oil amber.
──────────────────────────────────────────────────────────────── */

export {
  INK,
  DOT,
  bakeCorridor,
  getDots,
  rotator,
  vec,
  slerp,
  flowHealth,
  flowHealthBucket,
  type OTView as BTView,
  type Rot,
  D2R,
} from "./oilTrackerShared";

export const BT_ROUTE = "/Projects/BTC-Tracker";
export const BT_SESSION = "a3ro-bt-view";

/** Opening composition — US–Europe–Asia liquidity belt in frame. */
export const HOME = { lon: 12, lat: 28 };

/* ── palette: ink neutrals + disciplined orange ── */
export const ORG = (a: number) => `rgba(224,135,58,${a})`; // core orange #e0873a
export const ORG_HI = (a: number) => `rgba(255,180,100,${a})`; // tracer head
export const ORANGE_CSS = "#e0873a";

export const BT_ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #14110d 0%, var(--depth-1) 55%, #070808 100%)";
